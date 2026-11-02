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
  SnapshotRepository,
} from '@doodleforge/database';
import { ReviewService } from '@doodleforge/content-publisher';
import {
  ArtifactStore,
  enqueueWorkflow,
  executeStage,
  generateMetadataStage,
  metadataOutputSchema,
  buildSheetOutputSchema,
  validateReviewStage,
  reviewValidationOutputSchema,
  generatedReviewSourceSchema,
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
type Sheet = ReturnType<typeof buildSheetOutputSchema.parse>;

// Synthetic upstream producers isolate the metadata boundary; not a generation E2E.
async function prepare(
  change?: (sheet: Sheet, branch: string) => Sheet,
  omit?: string,
  withReview = false,
  unfinished = false,
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
      ...(withReview
        ? [
            {
              key: 'review',
              stageKey: 'validate-review',
              stageVersion: '1',
              targetKey: '',
              dependencies: [
                'metadata',
                ...branches.map((branch) => `sheet-${branch}`),
              ],
              input: envelope,
            },
          ]
        : []),
      ...(unfinished
        ? [
            {
              key: 'extra',
              stageKey: 'extra-work',
              stageVersion: '1',
              targetKey: '',
              dependencies: ['metadata'],
              input: envelope,
            },
          ]
        : []),
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
  const frame = withReview
    ? (
        await new DeterministicMockProvider().generate(
          {
            capability: 'character-master',
            providerId: 'deterministic-mock',
            providerVersion: '1',
            seed: 17,
            style: 'pixel',
            sourceSha256: sha256(png),
            brief,
          },
          png,
          signal(),
        )
      ).bytes
    : png;
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
        outputSchema: buildSheetOutputSchema,
        dependencies: [],
        cachePolicy: 'disabled',
        artifactRefs: (output) => [output.image],
        async execute(context) {
          const packed = await packSheet([frame, frame, frame], 2);
          const image = await store.putPng(
            context.claim,
            packed.bytes,
            context.signal,
          );
          const output: Sheet = {
            animation: poseAnimationSchema.parse(definition.targetKey),
            image,
            sourceHashes: [sha256(frame), sha256(frame), sha256(frame)],
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

async function prepareReview(unfinished = false) {
  const { jobId, work } = await prepare(undefined, undefined, true, unfinished);
  expect(
    await executeStage(
      repo,
      work,
      generateMetadataStage(),
      signal(),
      undefined,
      store,
    ),
  ).toBe(true);
  reopen();
  return {
    jobId,
    work: repo.claim('review', 60_000, [
      { key: 'validate-review', version: '1' },
    ])!,
  };
}
function snapshots() {
  return new SnapshotRepository(connection);
}

it('atomically freezes validated review sources and waits without a lease or approval', async () => {
  const { jobId, work } = await prepareReview();
  expect(
    await executeStage(
      repo,
      work,
      validateReviewStage(),
      signal(),
      undefined,
      store,
    ),
  ).toBe(true);
  reopen();
  const job = repo.job(jobId)!;
  expect(job.status).toBe('waiting_approval');
  const snapshot = snapshots().get(job.characterVersionId!)!;
  const output = reviewValidationOutputSchema.parse(
    JSON.parse(repo.step(work.step.id)!.outputJson!),
  );
  expect(snapshot.status).toBe('review');
  expect(snapshot.manifestJson).toBe(canonicalJson(output.metadata.manifest));
  expect(snapshot.manifestSha256).toBe(output.metadata.manifestSha256);
  expect(
    generatedReviewSourceSchema.parse(JSON.parse(snapshot.sourceSnapshotJson)),
  ).toEqual(output.source);
  expect(output.report).toEqual({ sheets: 5, frames: 15 });
  for (const image of Object.values(output.source.assets))
    await store.read(image);
  expect(repo.step(work.step.id)).toMatchObject({
    status: 'succeeded',
    leaseOwner: null,
    leaseExpiresAt: null,
  });
  expect(repo.attempts(work.step.id)[0]!.outcome).toBe('succeeded');
  expect(repo.claim('another')).toBeUndefined();
  expect(snapshots().latestDecision(snapshot.id)).toBeUndefined();
  expect(() =>
    new ReviewService(snapshots()).requireApproval(
      snapshot.id,
      snapshot.manifestSha256!,
    ),
  ).toThrow('approval');
  expect(
    await executeStage(
      repo,
      work,
      validateReviewStage(),
      signal(),
      undefined,
      store,
    ),
  ).toBe(false);
  expect(snapshots().history(characterId)).toHaveLength(1);
  expect(() =>
    connection.sqlite
      .prepare(
        "UPDATE character_versions SET source_snapshot_json='{}' WHERE id=?",
      )
      .run(snapshot.id),
  ).toThrow('immutable');
});

it('rolls back the snapshot, checkpoint and attempt when the gate write fails', async () => {
  const { jobId, work } = await prepareReview();
  connection.sqlite.exec(
    "CREATE TRIGGER fail_review_gate BEFORE UPDATE ON generation_jobs WHEN NEW.status='waiting_approval' BEGIN SELECT RAISE(ABORT, 'gate fault'); END;",
  );
  await expect(
    executeStage(repo, work, validateReviewStage(), signal(), undefined, store),
  ).rejects.toThrow('gate fault');
  expect(snapshots().history(characterId)).toEqual([]);
  expect(repo.step(work.step.id)).toMatchObject({
    status: 'running',
    outputJson: null,
  });
  expect(repo.attempts(work.step.id)[0]!.outcome).toBe('running');
  expect(repo.job(jobId)).toMatchObject({
    status: 'running',
    characterVersionId: null,
  });
  connection.sqlite.exec('DROP TRIGGER fail_review_gate');
  expect(
    await executeStage(
      repo,
      work,
      validateReviewStage(),
      signal(),
      undefined,
      store,
    ),
  ).toBe(true);
});

it('does not freeze when another connection cancels during final validation', async () => {
  const { jobId, work } = await prepareReview();
  const other = openDatabase(join(root, 'queue.sqlite'));
  try {
    const stage = validateReviewStage();
    expect(
      await executeStage(
        repo,
        work,
        {
          ...stage,
          async execute(...args: Parameters<typeof stage.execute>) {
            const result = await stage.execute(...args);
            new WorkflowRepository(other, () => now).cancel(jobId);
            return result;
          },
        },
        signal(),
        undefined,
        store,
      ),
    ).toBe(false);
    expect(snapshots().history(characterId)).toEqual([]);
    expect(repo.step(work.step.id)!.outputJson).toBeNull();
  } finally {
    other.close();
  }
});

it('does not freeze an expired validator and a replacement can resume after reopen', async () => {
  const { work } = await prepareReview();
  const stage = validateReviewStage();
  expect(
    await executeStage(
      repo,
      work,
      {
        ...stage,
        async execute(...args: Parameters<typeof stage.execute>) {
          const result = await stage.execute(...args);
          now += 60_000;
          return result;
        },
      },
      signal(),
      undefined,
      store,
    ),
  ).toBe(false);
  expect(snapshots().history(characterId)).toEqual([]);
  repo.recoverExpired();
  reopen();
  now += 2000;
  const replacement = repo.claim('replacement')!;
  expect(
    await executeStage(repo, work, stage, signal(), undefined, store),
  ).toBe(false);
  expect(
    await executeStage(repo, replacement, stage, signal(), undefined, store),
  ).toBe(true);
  expect(snapshots().history(characterId)).toHaveLength(1);
});

it('rolls back a freeze if the lease expires inside the adoption transaction', async () => {
  const { work } = await prepareReview();
  const original = SnapshotRepository.prototype.freeze;
  vi.spyOn(SnapshotRepository.prototype, 'freeze').mockImplementation(function (
    this: SnapshotRepository,
    input,
  ) {
    const frozen = original.call(this, input);
    now += 60_000;
    return frozen;
  });
  expect(
    await executeStage(
      repo,
      work,
      validateReviewStage(),
      signal(),
      undefined,
      store,
    ),
  ).toBe(false);
  expect(snapshots().history(characterId)).toEqual([]);
  expect(repo.step(work.step.id)!.outputJson).toBeNull();
  expect(repo.attempts(work.step.id)[0]!.outcome).toBe('running');
});

it('rejects review while a sibling computation is unfinished', async () => {
  const { work } = await prepareReview(true);
  await expect(
    executeStage(repo, work, validateReviewStage(), signal(), undefined, store),
  ).rejects.toThrow('all other steps');
  expect(snapshots().history(characterId)).toEqual([]);
  expect(repo.step(work.step.id)!.outputJson).toBeNull();
});

it('rejects an unselected review sheet attempt before freezing', async () => {
  const { work } = await prepareReview();
  const stage = validateReviewStage();
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
  ).rejects.toThrow('Unselected review sheet artifact');
  expect(snapshots().history(characterId)).toEqual([]);
  expect(repo.step(work.step.id)!.outputJson).toBeNull();
});

it('cancellation after review preserves immutable history without approval or further claims', async () => {
  const { jobId, work } = await prepareReview();
  expect(
    await executeStage(
      repo,
      work,
      validateReviewStage(),
      signal(),
      undefined,
      store,
    ),
  ).toBe(true);
  const id = repo.job(jobId)!.characterVersionId!;
  const before = snapshots().get(id);
  expect(repo.cancel(jobId)).toBe(true);
  reopen();
  expect(repo.job(jobId)!.status).toBe('cancelled');
  expect(snapshots().get(id)).toEqual(before);
  expect(snapshots().latestDecision(id)).toBeUndefined();
  expect(repo.claim('another')).toBeUndefined();
});

it('rejects corrupt review sheets without creating a snapshot', async () => {
  const { work } = await prepareReview();
  const read = store.read.bind(store);
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
    return read(image);
  });
  await expect(
    executeStage(repo, work, validateReviewStage(), signal(), undefined, store),
  ).rejects.toThrow('hash mismatch');
  expect(snapshots().history(characterId)).toEqual([]);
  expect(repo.step(work.step.id)!.outputJson).toBeNull();
});

it('rejects an archive racing with validated review adoption', async () => {
  const { work } = await prepareReview();
  const stage = validateReviewStage();
  await expect(
    executeStage(
      repo,
      work,
      {
        ...stage,
        async execute(...args: Parameters<typeof stage.execute>) {
          const output = await stage.execute(...args);
          connection.sqlite
            .prepare('UPDATE characters SET archived_at=? WHERE id=?')
            .run(now, characterId);
          return output;
        },
      },
      signal(),
      undefined,
      store,
    ),
  ).rejects.toThrow('Active character required');
  expect(snapshots().history(characterId)).toEqual([]);
  expect(repo.step(work.step.id)!.outputJson).toBeNull();
});

it('rejects a conflicting frozen version without mutating either snapshot or checkpoint', async () => {
  const { work } = await prepareReview();
  const stage = validateReviewStage();
  let existingId: string | undefined;
  await expect(
    executeStage(
      repo,
      work,
      {
        ...stage,
        async execute(...args: Parameters<typeof stage.execute>) {
          const output = await stage.execute(...args);
          const snapshot = stage.reviewSnapshot!(output);
          existingId = snapshots().freeze({
            ...snapshot,
            sourceSnapshotJson: '{}',
          }).id;
          return output;
        },
      },
      signal(),
      undefined,
      store,
    ),
  ).rejects.toThrow('different snapshot');
  expect(snapshots().history(characterId)).toHaveLength(1);
  expect(snapshots().get(existingId!)!.sourceSnapshotJson).toBe('{}');
  expect(repo.step(work.step.id)!.outputJson).toBeNull();
});

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
