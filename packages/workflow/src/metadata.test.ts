import { randomUUID } from 'node:crypto';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { packSheet } from '@doodleforge/animation';
import { DeterministicMockProvider } from '@doodleforge/ai';
import {
  canonicalJson,
  sha256,
  validateManifestSemantics,
} from '@doodleforge/contracts';
import {
  CharacterRepository,
  migrateDatabase,
  openDatabase,
  WorkflowRepository,
} from '@doodleforge/database';
import {
  ArtifactStore,
  enqueueWorkflow,
  executeStage,
  generateMetadataStage,
  metadataOutputSchema,
  sheetOutputSchema,
  stageEnvelopeSchema,
  type Stage,
} from './index.js';
import { analysisOutputSchema, poseAnimationSchema } from './mock-stages.js';

const signal = () => new AbortController().signal;
const png = readFileSync(
  new URL(
    '../../contracts/fixtures/sprout/v1/assets/db061ac349376d65ef413dbf86627cc70e692922ab59b9087cbd11eb73bb423d.png',
    import.meta.url,
  ),
);
let root: string;
let connection: ReturnType<typeof openDatabase>;
let repo: WorkflowRepository;
let store: ArtifactStore;
let now: number;
let characterId: string;
function reopen() {
  connection.close();
  connection = openDatabase(join(root, 'queue.sqlite'));
  repo = new WorkflowRepository(connection, () => now);
  store = new ArtifactStore(join(root, 'artifacts'));
}
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'doodle-metadata-'));
  mkdirSync(join(root, 'artifacts'));
  migrateDatabase(join(root, 'queue.sqlite'));
  connection = openDatabase(join(root, 'queue.sqlite'));
  now = 1000;
  repo = new WorkflowRepository(connection, () => now);
  store = new ArtifactStore(join(root, 'artifacts'));
  characterId = new CharacterRepository(connection).create({
    name: 'Metadata',
    description: '',
    bodyType: 'humanoid',
    fightingStyle: 'light_melee',
    specialPower: 'none',
  }).id;
});
afterEach(() => {
  vi.restoreAllMocks();
  connection.close();
  rmSync(root, { recursive: true, force: true });
});
type Sheet = ReturnType<typeof sheetOutputSchema.parse>;

// Synthetic upstream producers isolate the metadata boundary; not a generation E2E.
async function prepare(
  change?: (sheet: Sheet, branch: string) => Sheet,
  omit?: string,
) {
  const envelope = {
    schemaVersion: 1,
    characterId,
    characterVersion: 2,
    sourceSnapshotHash: sha256('pinned source'),
    inputs: {},
    parameters: {},
  };
  const branches = poseAnimationSchema.options.filter(
    (branch) => branch !== omit,
  );
  const definitions = [
    {
      key: 'analysis',
      stageKey: 'analyze-captured-description',
      targetKey: '',
    },
    ...branches.map((branch) => ({
      key: `sheet-${branch}`,
      stageKey: 'build-sheet',
      targetKey: branch,
    })),
  ];
  const jobId = enqueueWorkflow(repo, {
    schemaVersion: 1,
    characterId,
    characterVersionId: null,
    kind: 'generate',
    idempotencyKey: randomUUID(),
    steps: [
      ...definitions.map((definition) => ({
        ...definition,
        stageVersion: '1',
        dependencies: [],
        input: envelope,
      })),
      {
        key: 'metadata',
        stageKey: 'generate-metadata',
        stageVersion: '1',
        targetKey: '',
        dependencies: definitions.map(({ key }) => key),
        input: {
          ...envelope,
          inputs: { name: '  Leaf hero  ' },
          parameters: { catalog: 'light-melee@1' },
        },
      },
    ],
  });
  const brief = await new DeterministicMockProvider().analyze(
    {
      description: 'Leaf friend',
      bodyType: 'quadruped',
      fightingStyle: 'light_melee',
      specialPower: 'none',
    },
    signal(),
  );
  for (let index = 0; index < definitions.length; index++) {
    const work = repo.claim('upstream')!;
    const definition = definitions.find(
      (item) =>
        item.stageKey === work.step.stageKey &&
        item.targetKey === work.step.targetKey,
    )!;
    if (definition.key === 'analysis') {
      const stage: Stage<unknown, unknown> = {
        key: definition.stageKey,
        version: '1',
        inputSchema: stageEnvelopeSchema,
        outputSchema: analysisOutputSchema,
        dependencies: [],
        cachePolicy: 'disabled',
        async execute() {
          return {
            brief,
            provenance: {
              providerId: 'deterministic-mock',
              providerVersion: '1',
              seed: 17,
              style: 'pixel',
              requestHash: sha256('request'),
              resolvedInputHash: sha256('analysis'),
              sourceHashes: [sha256(png)],
            },
          };
        },
      };
      expect(
        await executeStage(repo, work, stage, signal(), undefined, store),
      ).toBe(true);
    } else {
      const stage: Stage<unknown, Sheet> = {
        key: 'build-sheet',
        version: '1',
        inputSchema: stageEnvelopeSchema,
        outputSchema: sheetOutputSchema,
        dependencies: [],
        cachePolicy: 'disabled',
        artifactRefs: (output) => [output.image],
        async execute(context) {
          const packed = await packSheet([png, png, png], 2);
          const image = await store.putPng(
            context.claim,
            packed.bytes,
            context.signal,
          );
          const output: Sheet = {
            animation: poseAnimationSchema.parse(definition.targetKey),
            image,
            sourceHashes: [sha256(png), sha256(png), sha256(png)],
            frameWidth: 256,
            frameHeight: 256,
            columns: 2,
            frameCount: 3,
            footAnchor: { x: 128, y: 224 },
            style: 'pixel',
            resolvedInputHash: sha256('sheet'),
          };
          return change ? change(output, definition.targetKey) : output;
        },
      };
      expect(
        await executeStage(repo, work, stage, signal(), undefined, store),
      ).toBe(true);
    }
  }
  reopen();
  return { jobId, work: repo.claim('metadata')! };
}

it('joins all five adopted sheets into canonical shared-v1 metadata across restart', async () => {
  const { jobId, work } = await prepare();
  const stage = generateMetadataStage();
  expect(
    await executeStage(
      repo,
      work,
      {
        ...stage,
        async execute(...args: Parameters<typeof stage.execute>) {
          const first = await stage.execute(...args);
          expect(await stage.execute(...args)).toEqual(first);
          return first;
        },
      },
      signal(),
      undefined,
      store,
    ),
  ).toBe(true);
  reopen();
  const output = metadataOutputSchema.parse(
    JSON.parse(repo.step(work.step.id)!.outputJson!),
  );
  expect(output.manifestSha256).toBe(sha256(canonicalJson(output.manifest)));
  expect(output.manifest).toMatchObject({
    characterId,
    characterVersion: 2,
    name: 'Leaf hero',
    description: 'Leaf friend',
    bodyType: 'quadruped',
    artStyle: 'pixel',
  });
  expect(Object.keys(output.manifest.animations).sort()).toEqual([
    'attack_light',
    'hurt',
    'idle',
    'knockout',
    'walk',
  ]);
  expect(output.manifest.animations.attack_light).toMatchObject({
    frameCount: 3,
    columns: 2,
    fps: 10,
    loop: false,
  });
  expect(output.manifest.animations.idle).toMatchObject({ fps: 8, loop: true });
  expect(output.manifest.animations.walk!.loop).toBe(true);
  expect(validateManifestSemantics(output.manifest)).toEqual([]);
  for (const image of Object.values(output.sheets))
    expect(sha256(await store.read(image))).toBe(image.sha256);
  expect(repo.job(jobId)!.status).toBe('running'); // No review/gate completion inferred.
  expect(
    metadataOutputSchema.safeParse({
      ...output,
      manifestSha256: sha256('wrong'),
    }).success,
  ).toBe(false);
  const changed = structuredClone(output);
  changed.sheets.walk.sha256 = sha256('wrong sheet');
  expect(metadataOutputSchema.safeParse(changed).success).toBe(false);
});

it.each(['branch', 'style'])(
  'rejects a mismatched sheet %s without adopting metadata',
  async (kind) => {
    const { work } = await prepare((sheet, branch) =>
      branch === 'walk'
        ? {
            ...sheet,
            ...(kind === 'branch'
              ? { animation: 'idle' as const }
              : { style: 'cartoon' as const }),
          }
        : sheet,
    );
    await expect(
      executeStage(
        repo,
        work,
        generateMetadataStage(),
        signal(),
        undefined,
        store,
      ),
    ).rejects.toThrow('Sheet branch/style mismatch');
    expect(repo.step(work.step.id)!.outputJson).toBeNull();
  },
);

it('requires every animation branch', async () => {
  const { work } = await prepare(undefined, 'ko');
  await expect(
    executeStage(
      repo,
      work,
      generateMetadataStage(),
      signal(),
      undefined,
      store,
    ),
  ).rejects.toThrow('Stage dependency mismatch');
  expect(repo.step(work.step.id)!.outputJson).toBeNull();
});

it('rejects corrupted sheet bytes before metadata adoption', async () => {
  const { work } = await prepare();
  const original = store.read.bind(store);
  vi.spyOn(store, 'read').mockImplementationOnce(async (image) => {
    const file = join(
      root,
      'artifacts',
      image.stepId,
      image.attemptId,
      `${image.artifactId}.png`,
    );
    chmodSync(file, 0o600);
    writeFileSync(file, Buffer.alloc(image.bytes));
    return original(image);
  });
  await expect(
    executeStage(
      repo,
      work,
      generateMetadataStage(),
      signal(),
      undefined,
      store,
    ),
  ).rejects.toThrow('Artifact hash mismatch');
  expect(repo.step(work.step.id)!.outputJson).toBeNull();
});

it('rejects an unselected sheet attempt even when its bytes exist', async () => {
  const { work } = await prepare();
  const stage = generateMetadataStage();
  await expect(
    executeStage(
      repo,
      work,
      {
        ...stage,
        async execute(context, input) {
          return stage.execute(
            {
              ...context,
              dependencyOutputs: context.dependencyOutputs!.map((parent) =>
                parent.stageKey === 'build-sheet'
                  ? { ...parent, attemptId: randomUUID() }
                  : parent,
              ),
            },
            input,
          );
        },
      },
      signal(),
      undefined,
      store,
    ),
  ).rejects.toThrow('Unselected dependency artifact');
  expect(repo.step(work.step.id)!.outputJson).toBeNull();
});

it('does not adopt metadata cancelled during sheet verification', async () => {
  const { jobId, work } = await prepare();
  const controller = new AbortController();
  const original = store.read.bind(store);
  vi.spyOn(store, 'read').mockImplementationOnce(async (image) => {
    const bytes = await original(image);
    repo.cancel(jobId);
    controller.abort();
    return bytes;
  });
  await expect(
    executeStage(
      repo,
      work,
      generateMetadataStage(),
      controller.signal,
      undefined,
      store,
    ),
  ).rejects.toThrow();
  expect(repo.step(work.step.id)!.outputJson).toBeNull();
});

it('fences expired metadata and recomputes the same manifest on a fresh attempt', async () => {
  const { work } = await prepare();
  const stage = generateMetadataStage();
  let stale: Awaited<ReturnType<typeof stage.execute>> | undefined;
  expect(
    await executeStage(
      repo,
      work,
      {
        ...stage,
        async execute(...args: Parameters<typeof stage.execute>) {
          stale = await stage.execute(...args);
          now += 60_000;
          repo.recoverExpired();
          return stale;
        },
      },
      signal(),
      undefined,
      store,
    ),
  ).toBe(false);
  expect(repo.step(work.step.id)!.outputJson).toBeNull();
  reopen();
  now += 2000;
  const replacement = repo.claim('replacement')!;
  expect(
    await executeStage(repo, replacement, stage, signal(), undefined, store),
  ).toBe(true);
  const adopted = metadataOutputSchema.parse(
    JSON.parse(repo.step(work.step.id)!.outputJson!),
  );
  expect(adopted).toEqual(stale);
});
