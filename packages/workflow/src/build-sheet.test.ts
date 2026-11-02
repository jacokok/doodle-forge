import { randomUUID } from 'node:crypto';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  AssetRepository,
  CharacterRepository,
  migrateDatabase,
  openDatabase,
  WorkflowRepository,
} from '@doodleforge/database';
import { DeterministicMockProvider } from '@doodleforge/ai';
import { DeterministicMockProvider as FrameMockProvider } from '@doodleforge/ai/capabilities';
import { sha256 } from '@doodleforge/contracts';
import {
  ArtifactStore,
  analysisStage,
  bodyTypeStage,
  poseStage,
  framesStage,
  normalizeFramesStage,
  normalizedFramesOutputSchema,
  buildSheetStage,
  buildSheetOutputSchema,
  captureArtworkStage,
  characterMasterStage,
  cleanImageStage,
  enqueueWorkflow,
  executeStage,
} from './index.js';

const png = readFileSync(
  new URL(
    '../../contracts/fixtures/sprout/v1/assets/db061ac349376d65ef413dbf86627cc70e692922ab59b9087cbd11eb73bb423d.png',
    import.meta.url,
  ),
);
let root: string;
let connection: ReturnType<typeof openDatabase>;
let repo: WorkflowRepository;
let assets: AssetRepository;
let store: ArtifactStore;
let provider: DeterministicMockProvider;
let characterId: string;
let originalId: string;
let now: number;
const signal = () => new AbortController().signal;
const parameters = {
  providerId: 'deterministic-mock',
  providerVersion: '1',
  seed: 17,
  style: 'pixel',
};
const design = {
  description: '  Friendly leaf friend  ',
  bodyType: 'humanoid',
  fightingStyle: 'light_melee',
  specialPower: 'none',
};
function reopen() {
  connection.close();
  connection = openDatabase(join(root, 'queue.sqlite'));
  repo = new WorkflowRepository(connection, () => now);
  assets = new AssetRepository(connection);
  store = new ArtifactStore(join(root, 'artifacts'));
}
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'doodle-mock-stages-'));
  mkdirSync(join(root, 'originals'));
  mkdirSync(join(root, 'artifacts'));
  migrateDatabase(join(root, 'queue.sqlite'));
  connection = openDatabase(join(root, 'queue.sqlite'));
  now = 1000;
  repo = new WorkflowRepository(connection, () => now);
  assets = new AssetRepository(connection);
  store = new ArtifactStore(join(root, 'artifacts'));
  provider = new DeterministicMockProvider();
  const character = new CharacterRepository(connection).create({
    name: 'Mock pipeline',
    description: '',
    bodyType: 'humanoid',
    fightingStyle: 'unselected',
    specialPower: 'none',
  });
  characterId = character.id;
  originalId = randomUUID();
  const previewId = randomUUID();
  assets.attach(
    characterId,
    character.editRevision,
    {
      id: originalId,
      characterId,
      kind: 'original',
      storageKey: `${originalId}.original`,
      sha256: sha256(png),
      bytes: png.length,
      mediaType: 'image/png',
      width: 256,
      height: 256,
      createdAt: now,
    },
    {
      id: previewId,
      characterId,
      kind: 'preview',
      sourceAssetId: originalId,
      storageKey: `${previewId}.png`,
      sha256: sha256(png),
      bytes: png.length,
      mediaType: 'image/png',
      width: 256,
      height: 256,
      createdAt: now,
    },
  );
  writeFileSync(join(root, 'originals', `${originalId}.original`), png);
});
afterEach(() => {
  vi.restoreAllMocks();
  connection.close();
  rmSync(root, { recursive: true, force: true });
});
function request() {
  const envelope = {
    schemaVersion: 1,
    characterId,
    characterVersion: 1,
    sourceSnapshotHash: sha256('captured source snapshot'),
    inputs: {},
    parameters: parameters as Record<string, string | number>,
  };
  return {
    schemaVersion: 1,
    characterId,
    characterVersionId: null,
    kind: 'generate',
    idempotencyKey: randomUUID(),
    steps: [
      {
        key: 'capture',
        stageKey: 'capture-artwork',
        stageVersion: '1',
        targetKey: '',
        dependencies: [] as string[],
        input: {
          ...envelope,
          inputs: { original: { assetId: originalId, sha256: sha256(png) } },
          parameters: {},
        },
      },
      {
        key: 'analysis',
        stageKey: 'analyze-captured-description',
        stageVersion: '1',
        targetKey: '',
        dependencies: ['capture'],
        input: { ...envelope, inputs: design },
      },
      {
        key: 'clean',
        stageKey: 'clean-image',
        stageVersion: '1',
        targetKey: '',
        dependencies: ['capture'],
        input: envelope,
      },
      {
        key: 'master',
        stageKey: 'character-master',
        stageVersion: '1',
        targetKey: '',
        dependencies: ['analysis', 'clean'],
        input: envelope,
      },
    ],
  };
}
async function run(work: NonNullable<ReturnType<WorkflowRepository['claim']>>) {
  // Dispatch with concrete generic types rather than erasing input/output validation.
  switch (work.step.stageKey) {
    case 'capture-artwork':
      return executeStage(
        repo,
        work,
        captureArtworkStage(assets, join(root, 'originals')),
        signal(),
        undefined,
        store,
      );
    case 'analyze-captured-description':
      return executeStage(
        repo,
        work,
        analysisStage(provider),
        signal(),
        undefined,
        store,
      );
    case 'clean-image':
      return executeStage(
        repo,
        work,
        cleanImageStage(provider),
        signal(),
        undefined,
        store,
      );
    case 'character-master':
      return executeStage(
        repo,
        work,
        characterMasterStage(provider),
        signal(),
        undefined,
        store,
      );
    case 'determine-body-type':
      return executeStage(
        repo,
        work,
        bodyTypeStage(provider),
        signal(),
        undefined,
        store,
      );
    case 'generate-pose':
      return executeStage(
        repo,
        work,
        poseStage(new FrameMockProvider()),
        signal(),
        undefined,
        store,
      );
    default:
      throw new Error('Unknown stage');
  }
}
async function prepareFrameBranch(
  frameAnimation = 'walk',
  withNormalization = false,
  withSheet = false,
) {
  const graph = request();
  graph.steps.push({
    key: 'body',
    stageKey: 'determine-body-type',
    stageVersion: '1',
    targetKey: '',
    dependencies: ['master', 'analysis'],
    input: { ...graph.steps[3]!.input, inputs: {}, parameters },
  });
  graph.steps.push({
    key: 'pose-walk',
    stageKey: 'generate-pose',
    stageVersion: '1',
    targetKey: 'walk',
    dependencies: ['master', 'analysis', 'body'],
    input: {
      ...graph.steps[3]!.input,
      inputs: { animation: 'walk' },
      parameters,
    },
  });
  graph.steps.push({
    key: 'frames-walk',
    stageKey: 'generate-frames',
    stageVersion: '1',
    targetKey: 'walk',
    dependencies: ['master', 'analysis', 'body', 'pose-walk'],
    input: {
      ...graph.steps[3]!.input,
      inputs: { animation: frameAnimation, frameCount: 3 },
      parameters,
    },
  });
  if (withNormalization)
    graph.steps.push({
      key: 'normalize-walk',
      stageKey: 'normalize-frames',
      stageVersion: '1',
      targetKey: 'walk',
      dependencies: ['frames-walk'],
      input: {
        ...graph.steps[3]!.input,
        inputs: { animation: 'walk' },
        parameters,
      },
    });
  if (withSheet)
    graph.steps.push({
      key: 'sheet-walk',
      stageKey: 'build-sheet',
      stageVersion: '1',
      targetKey: 'walk',
      dependencies: ['normalize-walk'],
      input: {
        ...graph.steps[3]!.input,
        inputs: { animation: 'walk' },
        parameters: { columns: 2 },
      },
    });
  const jobId = enqueueWorkflow(repo, graph);
  for (let i = 0; i < 6; i++)
    expect(await run(repo.claim('upstream')!)).toBe(true);
  return { jobId, work: repo.claim('frames')! };
}

async function prepareSheet() {
  const { jobId, work } = await prepareFrameBranch('walk', true, true);
  expect(
    await executeStage(
      repo,
      work,
      framesStage(new FrameMockProvider(), 'walk'),
      signal(),
      undefined,
      store,
    ),
  ).toBe(true);
  const normalized = repo.claim('normalizer')!;
  expect(
    await executeStage(
      repo,
      normalized,
      normalizeFramesStage('walk'),
      signal(),
      undefined,
      store,
    ),
  ).toBe(true);
  const source = normalizedFramesOutputSchema.parse(
    JSON.parse(repo.step(normalized.step.id)!.outputJson!),
  );
  reopen();
  return { jobId, source, work: repo.claim('packer')! };
}

it('packs the selected normalized branch across restart with ordered hashes and deterministic bytes', async () => {
  const { work, source } = await prepareSheet();
  const before = await Promise.all(
    source.frames.map(({ image }) => store.read(image)),
  );
  const stage = buildSheetStage('walk');
  let first: Awaited<ReturnType<typeof stage.execute>> | undefined;
  expect(
    await executeStage(
      repo,
      work,
      {
        ...stage,
        async execute(...args: Parameters<typeof stage.execute>) {
          first = await stage.execute(...args);
          const second = await stage.execute(...args);
          expect(second.image.sha256).toBe(first.image.sha256);
          expect(await store.read(second.image)).toEqual(
            await store.read(first.image),
          );
          return second;
        },
      },
      signal(),
      undefined,
      store,
    ),
  ).toBe(true);
  reopen();
  const output = buildSheetOutputSchema.parse(
    JSON.parse(repo.step(work.step.id)!.outputJson!),
  );
  expect(output.sourceHashes).toEqual(
    source.frames.map(({ image }) => image.sha256),
  );
  expect(output).toMatchObject({
    animation: 'walk',
    frameCount: 3,
    columns: 2,
    footAnchor: { x: 128, y: 224 },
    image: { width: 512, height: 512, attemptId: work.claim.attemptId },
  });
  expect(
    await Promise.all(source.frames.map(({ image }) => store.read(image))),
  ).toEqual(before);
  expect(
    buildSheetOutputSchema.safeParse({ ...output, frameCount: 2 }).success,
  ).toBe(false);
});

it('rejects corrupt normalized input before installing a sheet', async () => {
  const { work, source } = await prepareSheet();
  const image = source.frames[1]!.image;
  const file = join(
    root,
    'artifacts',
    image.stepId,
    image.attemptId,
    `${image.artifactId}.png`,
  );
  chmodSync(file, 0o600);
  writeFileSync(file, Buffer.alloc(image.bytes));
  const put = vi.spyOn(store, 'putPng');
  await expect(
    executeStage(
      repo,
      work,
      buildSheetStage('walk'),
      signal(),
      undefined,
      store,
    ),
  ).rejects.toThrow('Artifact hash mismatch');
  expect(put).not.toHaveBeenCalled();
  expect(repo.step(work.step.id)!.outputJson).toBeNull();
});

it('does not adopt a sheet cancelled after artifact installation', async () => {
  const { work } = await prepareSheet();
  const controller = new AbortController();
  const original = store.putPng.bind(store);
  vi.spyOn(store, 'putPng').mockImplementation(async (...args) => {
    const image = await original(...args);
    repo.cancel(work.step.jobId);
    controller.abort();
    return image;
  });
  await expect(
    executeStage(
      repo,
      work,
      buildSheetStage('walk'),
      controller.signal,
      undefined,
      store,
    ),
  ).rejects.toThrow();
  expect(repo.step(work.step.id)!.outputJson).toBeNull();
});

it('fences expired sheets and rejects old artifacts on a replacement attempt', async () => {
  const { work } = await prepareSheet();
  const stage = buildSheetStage('walk');
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
  reopen();
  now += 2000;
  const replacement = repo.claim('replacement')!;
  await expect(
    executeStage(
      repo,
      replacement,
      { ...stage, execute: async () => stale! },
      signal(),
      undefined,
      store,
    ),
  ).rejects.toThrow('attempt mismatch');
  expect(
    await executeStage(repo, replacement, stage, signal(), undefined, store),
  ).toBe(true);
  const adopted = buildSheetOutputSchema.parse(
    JSON.parse(repo.step(work.step.id)!.outputJson!),
  );
  expect(adopted.image.sha256).toBe(stale!.image.sha256);
  expect(adopted.image.attemptId).toBe(replacement.claim.attemptId);
});
