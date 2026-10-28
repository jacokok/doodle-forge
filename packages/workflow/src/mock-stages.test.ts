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
  bodyTypeOutputSchema,
  poseStage,
  poseOutputSchema,
  framesStage,
  framesOutputSchema,
  packSheetStage,
  sheetOutputSchema,
  normalizeFramesStage,
  normalizedFramesOutputSchema,
  captureArtworkStage,
  characterMasterStage,
  cleanImageStage,
  enqueueWorkflow,
  executeStage,
} from './index.js';
import { analysisOutputSchema, mockImageOutputSchema } from './mock-stages.js';
import { captureOutputSchema } from './capture.js';

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
    parameters,
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
async function prepareMaster() {
  const jobId = enqueueWorkflow(repo, request());
  const upstream: string[] = [];
  for (let i = 0; i < 3; i++) {
    const work = repo.claim('upstream')!;
    expect(await run(work)).toBe(true);
    upstream.push(work.step.id);
  }
  return { jobId, upstream, work: repo.claim('master')! };
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
      stageKey: 'pack-sheet',
      stageVersion: '1',
      targetKey: 'walk',
      dependencies: ['normalize-walk'],
      input: {
        ...graph.steps[3]!.input,
        inputs: { animation: 'walk', columns: 2 },
        parameters,
      },
    });
  const jobId = enqueueWorkflow(repo, graph);
  for (let i = 0; i < 6; i++)
    expect(await run(repo.claim('upstream')!)).toBe(true);
  return { jobId, work: repo.claim('frames')! };
}

async function prepareNormalization() {
  const { jobId, work } = await prepareFrameBranch('walk', true);
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
  const source = framesOutputSchema.parse(
    JSON.parse(repo.step(work.step.id)!.outputJson!),
  );
  reopen();
  return { jobId, source, work: repo.claim('normalizer')! };
}

it('adopts capture/analysis/cleanup/master with actual PNGs, lineage and no review/publication side effects', async () => {
  const { jobId, upstream, work } = await prepareMaster();
  expect(work.step.stageKey).toBe('character-master');
  const capture = captureOutputSchema.parse(
    JSON.parse(repo.step(upstream[0]!)!.outputJson!),
  );
  const cleanedStep = upstream
    .map((id) => repo.step(id)!)
    .find((item) => item.stageKey === 'clean-image')!;
  const cleaned = mockImageOutputSchema.parse(
    JSON.parse(cleanedStep.outputJson!),
  );
  expect(cleaned.provenance.sourceHashes).toEqual([capture.preview.sha256]);
  const briefStep = upstream
    .map((id) => repo.step(id)!)
    .find((item) => item.stageKey === 'analyze-captured-description')!;
  expect(
    analysisOutputSchema.parse(JSON.parse(briefStep.outputJson!)).brief
      .description,
  ).toBe('Friendly leaf friend');
  reopen();
  expect(await run(work)).toBe(true);
  const output = mockImageOutputSchema.parse(
    JSON.parse(repo.step(work.step.id)!.outputJson!),
  );
  expect(output.provenance.sourceHashes).toEqual([cleaned.image.sha256]);
  expect(output.image.width).toBe(256);
  expect(output.image.sha256).not.toBe(cleaned.image.sha256);
  expect(sha256(await store.read(output.image))).toBe(output.image.sha256);
  expect(
    readFileSync(join(root, 'originals', `${originalId}.original`)),
  ).toEqual(png);
  expect(repo.job(jobId)?.status).toBe('running');
  for (const table of ['character_versions', 'approvals', 'content_releases'])
    expect(
      connection.sqlite.prepare(`SELECT count(*) n FROM ${table}`).get(),
    ).toEqual({ n: 0 });
});

it('adopts the selected body type and target anchor after verifying the master across restart', async () => {
  const graph = request();
  graph.steps.push({
    key: 'body',
    stageKey: 'determine-body-type',
    stageVersion: '1',
    targetKey: '',
    dependencies: ['master', 'analysis'],
    input: { ...graph.steps[3]!.input, inputs: {}, parameters },
  });
  const jobId = enqueueWorkflow(repo, graph);
  for (let i = 0; i < 4; i++)
    expect(await run(repo.claim('upstream')!)).toBe(true);
  reopen();
  const work = repo.claim('body')!;
  expect(
    await executeStage(
      repo,
      work,
      bodyTypeStage(provider),
      signal(),
      undefined,
      store,
    ),
  ).toBe(true);
  const output = bodyTypeOutputSchema.parse(
    JSON.parse(repo.step(work.step.id)!.outputJson!),
  );
  expect(output.bodyType).toBe('humanoid');
  expect(output.targetFootAnchor).toEqual({ x: 128, y: 224 });
  expect(output.provenance.sourceHashes).toHaveLength(1);
  expect(repo.job(jobId)?.status).toBe('running');
});

it('persists separate animation poses after restart and leaves the job running', async () => {
  const graph = request();
  graph.steps.push({
    key: 'body',
    stageKey: 'determine-body-type',
    stageVersion: '1',
    targetKey: '',
    dependencies: ['master', 'analysis'],
    input: { ...graph.steps[3]!.input, inputs: {}, parameters },
  });
  for (const animation of ['idle', 'walk'])
    graph.steps.push({
      key: `pose-${animation}`,
      stageKey: 'generate-pose',
      stageVersion: '1',
      targetKey: animation,
      dependencies: ['master', 'analysis', 'body'],
      input: { ...graph.steps[3]!.input, inputs: { animation }, parameters },
    });
  const jobId = enqueueWorkflow(repo, graph);
  for (let i = 0; i < 5; i++)
    expect(await run(repo.claim('upstream')!)).toBe(true);
  reopen();
  const images = [];
  for (let i = 0; i < 2; i++) {
    const work = repo.claim('pose')!;
    expect(await run(work)).toBe(true);
    const output = poseOutputSchema.parse(
      JSON.parse(repo.step(work.step.id)!.outputJson!),
    );
    expect(output.animation).toBe(work.step.targetKey);
    expect(sha256(await store.read(output.image))).toBe(output.image.sha256);
    images.push(output.image.sha256);
  }
  expect(new Set(images).size).toBe(2);
  expect(repo.job(jobId)?.status).toBe('running');
});

it('retries and persists ordered frames without recomputing the adopted pose', async () => {
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
      inputs: { animation: 'walk', frameCount: 4 },
      parameters,
    },
  });
  const jobId = enqueueWorkflow(repo, graph);
  let poseId = '';
  for (let i = 0; i < 6; i++) {
    const work = repo.claim('upstream')!;
    expect(await run(work)).toBe(true);
    if (work.step.stageKey === 'generate-pose') poseId = work.step.id;
  }
  const poseJson = repo.step(poseId)!.outputJson;
  const adapter = new FrameMockProvider();
  vi.spyOn(adapter, 'generate').mockRejectedValueOnce(new Error('transient'));
  const work = repo.claim('frames')!;
  await expect(
    executeStage(
      repo,
      work,
      framesStage(adapter, 'walk'),
      signal(),
      undefined,
      store,
    ),
  ).rejects.toThrow('transient');
  expect(
    repo.fail(work.claim, JSON.stringify({ code: 'TRANSIENT' }), true),
  ).toBe(true);
  reopen();
  now += 2000;
  const retry = repo.claim('frames-retry')!;
  expect(
    await executeStage(
      repo,
      retry,
      framesStage(adapter, 'walk'),
      signal(),
      undefined,
      store,
    ),
  ).toBe(true);
  const result = framesOutputSchema.parse(
    JSON.parse(repo.step(retry.step.id)!.outputJson!),
  );
  expect(result.frames).toHaveLength(4);
  expect(new Set(result.frames.map((frame) => frame.sha256)).size).toBe(4);
  for (const frame of result.frames)
    expect(sha256(await store.read(frame))).toBe(frame.sha256);
  expect(repo.step(poseId)!.outputJson).toBe(poseJson);
  expect(repo.attempts(poseId)).toHaveLength(1);
  expect(repo.job(jobId)?.status).toBe('running');
});

it('does not adopt a partial frame sequence when cancellation interrupts installation', async () => {
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
    key: 'pose-idle',
    stageKey: 'generate-pose',
    stageVersion: '1',
    targetKey: 'idle',
    dependencies: ['master', 'analysis', 'body'],
    input: {
      ...graph.steps[3]!.input,
      inputs: { animation: 'idle' },
      parameters,
    },
  });
  graph.steps.push({
    key: 'frames-idle',
    stageKey: 'generate-frames',
    stageVersion: '1',
    targetKey: 'idle',
    dependencies: ['master', 'analysis', 'body', 'pose-idle'],
    input: {
      ...graph.steps[3]!.input,
      inputs: { animation: 'idle', frameCount: 3 },
      parameters,
    },
  });
  enqueueWorkflow(repo, graph);
  for (let i = 0; i < 6; i++)
    expect(await run(repo.claim('upstream')!)).toBe(true);
  const work = repo.claim('frames')!;
  const controller = new AbortController();
  const put = store.putPng.bind(store);
  const spy = vi.spyOn(store, 'putPng').mockImplementation(async (...args) => {
    const artifact = await put(...args);
    controller.abort();
    return artifact;
  });
  await expect(
    executeStage(
      repo,
      work,
      framesStage(new FrameMockProvider(), 'idle'),
      controller.signal,
      undefined,
      store,
    ),
  ).rejects.toThrow();
  expect(spy).toHaveBeenCalledTimes(1);
  expect(repo.step(work.step.id)!.outputJson).toBeNull();
});

it('normalizes adopted frames in order across restart without altering upstream files', async () => {
  const { jobId, source, work } = await prepareNormalization();
  const before = await Promise.all(
    source.frames.map((frame) => store.read(frame)),
  );
  expect(
    await executeStage(
      repo,
      work,
      normalizeFramesStage('walk'),
      signal(),
      undefined,
      store,
    ),
  ).toBe(true);
  reopen();
  const output = normalizedFramesOutputSchema.parse(
    JSON.parse(repo.step(work.step.id)!.outputJson!),
  );
  expect(output.frames.map((frame) => frame.sourceSha256)).toEqual(
    source.frames.map((frame) => frame.sha256),
  );
  expect(output.footAnchor).toEqual({ x: 128, y: 224 });
  for (const item of output.frames) {
    expect(item.image).toMatchObject({
      width: 256,
      height: 256,
      attemptId: work.claim.attemptId,
    });
    expect(sha256(await store.read(item.image))).toBe(item.image.sha256);
    expect(item.placedBounds.y + item.placedBounds.height).toBe(224);
  }
  expect(
    await Promise.all(source.frames.map((frame) => store.read(frame))),
  ).toEqual(before);
  expect(repo.job(jobId)?.status).toBe('running');
});

it('does not adopt partially normalized frames after cancellation', async () => {
  const { work } = await prepareNormalization();
  const controller = new AbortController();
  const put = store.putPng.bind(store);
  const spy = vi.spyOn(store, 'putPng').mockImplementation(async (...args) => {
    const result = await put(...args);
    controller.abort();
    return result;
  });
  await expect(
    executeStage(
      repo,
      work,
      normalizeFramesStage('walk'),
      controller.signal,
      undefined,
      store,
    ),
  ).rejects.toThrow();
  expect(spy).toHaveBeenCalledTimes(1);
  expect(repo.step(work.step.id)!.outputJson).toBeNull();
});

it('rejects expired normalized artifacts from an older attempt', async () => {
  const { work } = await prepareNormalization();
  const stage = normalizeFramesStage('walk');
  let stale: Awaited<ReturnType<typeof stage.execute>> | undefined;
  const expiring = {
    ...stage,
    async execute(...args: Parameters<typeof stage.execute>) {
      stale = await stage.execute(...args);
      now += 60_000;
      repo.recoverExpired();
      return stale;
    },
  };
  expect(
    await executeStage(repo, work, expiring, signal(), undefined, store),
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
  const adopted = normalizedFramesOutputSchema.parse(
    JSON.parse(repo.step(work.step.id)!.outputJson!),
  );
  expect(adopted.frames.map((frame) => frame.image.sha256)).toEqual(
    stale!.frames.map((frame) => frame.image.sha256),
  );
  expect(
    adopted.frames.every(
      (frame) => frame.image.attemptId === replacement.claim.attemptId,
    ),
  ).toBe(true);
});

it('rejects a corrupt upstream frame and does not adopt the normalized checkpoint', async () => {
  const { source, work } = await prepareNormalization();
  const file = join(
    root,
    'artifacts',
    source.frames[1]!.stepId,
    source.frames[1]!.attemptId,
    `${source.frames[1]!.artifactId}.png`,
  );
  chmodSync(file, 0o600);
  writeFileSync(file, Buffer.alloc(source.frames[1]!.bytes));
  await expect(
    executeStage(
      repo,
      work,
      normalizeFramesStage('walk'),
      signal(),
      undefined,
      store,
    ),
  ).rejects.toThrow('Artifact hash mismatch');
  expect(repo.step(work.step.id)!.outputJson).toBeNull();
});

it('fences expired frame artifacts and rejects their adoption by a replacement attempt', async () => {
  const { work } = await prepareFrameBranch();
  const stage = framesStage(new FrameMockProvider(), 'walk');
  let stale: Awaited<ReturnType<typeof stage.execute>> | undefined;
  const expiring = {
    ...stage,
    async execute(...args: Parameters<typeof stage.execute>) {
      stale = await stage.execute(...args);
      now += 60_000;
      repo.recoverExpired();
      return stale;
    },
  };
  expect(
    await executeStage(repo, work, expiring, signal(), undefined, store),
  ).toBe(false);
  expect(repo.step(work.step.id)!.outputJson).toBeNull();
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
  const adopted = framesOutputSchema.parse(
    JSON.parse(repo.step(work.step.id)!.outputJson!),
  );
  expect(adopted.frames.map((item) => item.sha256)).toEqual(
    stale!.frames.map((item) => item.sha256),
  );
  expect(
    adopted.frames.every(
      (item) => item.attemptId === replacement.claim.attemptId,
    ),
  ).toBe(true);
  expect(
    stale!.frames.every(
      (item) => item.attemptId !== replacement.claim.attemptId,
    ),
  ).toBe(true);
});

it('rejects malformed later frames without adopting earlier installed artifacts', async () => {
  const { work } = await prepareFrameBranch();
  const adapter = new FrameMockProvider();
  const generate = adapter.generate.bind(adapter);
  vi.spyOn(adapter, 'generate').mockImplementation(async (...args) => {
    const result = await generate(...args);
    if (result.capability !== 'generate_frames')
      throw new Error('Unexpected capability');
    return {
      ...result,
      frames: result.frames.map((frame, index) =>
        index === 1 ? { ...frame, sha256: '0'.repeat(64) } : frame,
      ),
    };
  });
  const put = vi.spyOn(store, 'putPng');
  await expect(
    executeStage(
      repo,
      work,
      framesStage(adapter, 'walk'),
      signal(),
      undefined,
      store,
    ),
  ).rejects.toThrow('Candidate provenance/hash mismatch');
  expect(put).toHaveBeenCalledTimes(1);
  expect(repo.step(work.step.id)!.outputJson).toBeNull();
});

it('rejects mismatched frame animation and pose branch before provider execution', async () => {
  const { work } = await prepareFrameBranch('idle');
  const adapter = new FrameMockProvider();
  const generate = vi.spyOn(adapter, 'generate');
  await expect(
    executeStage(
      repo,
      work,
      framesStage(adapter, 'walk'),
      signal(),
      undefined,
      store,
    ),
  ).rejects.toThrow('Frame target mismatch');
  await expect(
    executeStage(
      repo,
      work,
      framesStage(adapter, 'idle'),
      signal(),
      undefined,
      store,
    ),
  ).rejects.toThrow('Stage dependency mismatch');
  expect(generate).not.toHaveBeenCalled();
  expect(repo.step(work.step.id)!.outputJson).toBeNull();
});

it('rejects a pose with a provider hash mismatch without adopting a checkpoint', async () => {
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
    key: 'pose-idle',
    stageKey: 'generate-pose',
    stageVersion: '1',
    targetKey: 'idle',
    dependencies: ['master', 'analysis', 'body'],
    input: {
      ...graph.steps[3]!.input,
      inputs: { animation: 'idle' },
      parameters,
    },
  });
  enqueueWorkflow(repo, graph);
  for (let i = 0; i < 5; i++)
    expect(await run(repo.claim('upstream')!)).toBe(true);
  const adapter = new FrameMockProvider();
  const generate = adapter.generate.bind(adapter);
  vi.spyOn(adapter, 'generate').mockImplementation(async (...args) => {
    const result = await generate(...args);
    if (result.capability !== 'generate_frames')
      throw new Error('Unexpected capability');
    return {
      ...result,
      frames: result.frames.map((frame) => ({
        ...frame,
        sha256: '0'.repeat(64),
      })),
    };
  });
  const work = repo.claim('pose')!;
  await expect(
    executeStage(repo, work, poseStage(adapter), signal(), undefined, store),
  ).rejects.toThrow('Candidate provenance/hash mismatch');
  expect(repo.step(work.step.id)!.outputJson).toBeNull();
});

it('rejects a body stage paired with a different analysis than the master used', async () => {
  const graph = request();
  graph.steps.push({
    key: 'body',
    stageKey: 'determine-body-type',
    stageVersion: '1',
    targetKey: '',
    dependencies: ['master', 'analysis'],
    input: { ...graph.steps[3]!.input, inputs: {}, parameters },
  });
  enqueueWorkflow(repo, graph);
  for (let i = 0; i < 4; i++)
    expect(await run(repo.claim('upstream')!)).toBe(true);
  const work = repo.claim('body')!;
  const stage = bodyTypeStage(provider);
  const mismatched = {
    ...stage,
    async execute(
      context: Parameters<typeof stage.execute>[0],
      input: Parameters<typeof stage.execute>[1],
    ) {
      const dependencyOutputs = context.dependencyOutputs!.map((item) => {
        if (item.stageKey !== 'analyze-captured-description') return item;
        const output = analysisOutputSchema.parse(JSON.parse(item.outputJson));
        return {
          ...item,
          outputJson: JSON.stringify({
            ...output,
            brief: { ...output.brief, bodyType: 'floating' },
          }),
        };
      });
      return stage.execute({ ...context, dependencyOutputs }, input);
    },
  };
  await expect(
    executeStage(repo, work, mismatched, signal(), undefined, store),
  ).rejects.toThrow('Master analysis lineage mismatch');
  expect(repo.step(work.step.id)!.outputJson).toBeNull();
});

it('refuses body type adoption when the master artifact is corrupt', async () => {
  const graph = request();
  graph.steps.push({
    key: 'body',
    stageKey: 'determine-body-type',
    stageVersion: '1',
    targetKey: '',
    dependencies: ['master', 'analysis'],
    input: { ...graph.steps[3]!.input, inputs: {}, parameters },
  });
  enqueueWorkflow(repo, graph);
  let masterWork:
    NonNullable<ReturnType<WorkflowRepository['claim']>> | undefined;
  for (let i = 0; i < 4; i++) {
    const work = repo.claim('upstream')!;
    expect(await run(work)).toBe(true);
    if (work.step.stageKey === 'character-master') masterWork = work;
  }
  const master = mockImageOutputSchema.parse(
    JSON.parse(repo.step(masterWork!.step.id)!.outputJson!),
  );
  const read = vi
    .spyOn(store, 'read')
    .mockRejectedValueOnce(new Error('corrupt master'));
  const work = repo.claim('body')!;
  await expect(
    executeStage(
      repo,
      work,
      bodyTypeStage(provider),
      signal(),
      undefined,
      store,
    ),
  ).rejects.toThrow('corrupt master');
  expect(read).toHaveBeenCalledWith(master.image);
  expect(repo.step(work.step.id)!.outputJson).toBeNull();
});

it('transient master failure/restart retries without recomputing adopted capture/analysis/cleaned art', async () => {
  const { upstream, work } = await prepareMaster();
  const kept = upstream.map((id) => repo.step(id)!.outputJson);
  const generate = vi
    .spyOn(provider, 'generate')
    .mockRejectedValueOnce(new Error('mock transient failure'));
  await expect(run(work)).rejects.toThrow('transient');
  expect(
    repo.fail(work.claim, JSON.stringify({ code: 'MOCK_TRANSIENT' }), true),
  ).toBe(true);
  reopen();
  now += 2000;
  const next = repo.claim('retry')!;
  expect(next.step.id).toBe(work.step.id);
  expect(await run(next)).toBe(true);
  expect(generate).toHaveBeenCalledTimes(2);
  expect(upstream.map((id) => repo.step(id)!.outputJson)).toEqual(kept);
  expect(upstream.map((id) => repo.attempts(id).length)).toEqual([1, 1, 1]);
  expect(repo.attempts(work.step.id).map((attempt) => attempt.outcome)).toEqual(
    ['failed', 'succeeded'],
  );
});

it('expired master artifacts remain orphans and cannot be adopted by a newer attempt', async () => {
  const { work } = await prepareMaster();
  const base = characterMasterStage(provider);
  let oldOutput: Awaited<ReturnType<typeof base.execute>> | undefined;
  const expiring = {
    ...base,
    async execute(...args: Parameters<typeof base.execute>) {
      oldOutput = await base.execute(...args);
      now += 60_000;
      repo.recoverExpired();
      return oldOutput;
    },
  };
  expect(
    await executeStage(repo, work, expiring, signal(), undefined, store),
  ).toBe(false);
  reopen();
  now += 2000;
  const next = repo.claim('retry')!;
  await expect(
    executeStage(
      repo,
      next,
      { ...base, execute: async () => oldOutput! },
      signal(),
      undefined,
      store,
    ),
  ).rejects.toThrow('attempt mismatch');
  expect(await run(next)).toBe(true);
  const adopted = mockImageOutputSchema.parse(
    JSON.parse(repo.step(next.step.id)!.outputJson!),
  );
  expect(adopted.image.sha256).toBe(oldOutput!.image.sha256);
  expect(adopted.provenance.resolvedInputHash).toBe(
    oldOutput!.provenance.resolvedInputHash,
  );
  expect(adopted.provenance.requestHash).toBe(
    oldOutput!.provenance.requestHash,
  );
  expect(adopted.image.attemptId).not.toBe(oldOutput!.image.attemptId);
  expect(await store.read(oldOutput!.image)).toBeDefined();
});

it('cancelling during image production prevents adoption and descendant/release progress', async () => {
  const { jobId, work } = await prepareMaster();
  const generate = provider.generate.bind(provider);
  vi.spyOn(provider, 'generate').mockImplementation(async (...args) => {
    const output = await generate(...args);
    expect(repo.cancel(jobId)).toBe(true);
    return output;
  });
  expect(await run(work)).toBe(false);
  expect(repo.step(work.step.id)?.outputJson).toBeNull();
  expect(repo.job(jobId)?.status).toBe('cancelled');
  expect(repo.claim('later')).toBeUndefined();
});

it('aborting after provider work prevents artifact adoption', async () => {
  const { work } = await prepareMaster();
  const controller = new AbortController();
  const generate = provider.generate.bind(provider);
  vi.spyOn(provider, 'generate').mockImplementation(async (...args) => {
    const output = await generate(...args);
    controller.abort();
    return output;
  });
  await expect(
    executeStage(
      repo,
      work,
      characterMasterStage(provider),
      controller.signal,
      undefined,
      store,
    ),
  ).rejects.toThrow();
  expect(repo.step(work.step.id)?.outputJson).toBeNull();
});

it('corrupt adopted cleanup bytes block master before calling a provider', async () => {
  const { upstream, work } = await prepareMaster();
  const cleaned = upstream
    .map((id) => repo.step(id)!)
    .find((item) => item.stageKey === 'clean-image')!;
  const ref = mockImageOutputSchema.parse(
    JSON.parse(cleaned.outputJson!),
  ).image;
  const file = join(
    root,
    'artifacts',
    ref.stepId,
    ref.attemptId,
    `${ref.artifactId}.png`,
  );
  chmodSync(file, 0o600);
  writeFileSync(file, Buffer.alloc(ref.bytes));
  const generate = vi.spyOn(provider, 'generate');
  await expect(run(work)).rejects.toThrow('hash mismatch');
  expect(generate).not.toHaveBeenCalled();
  expect(repo.step(work.step.id)?.outputJson).toBeNull();
});

it.each(['snapshot', 'version', 'missing-dependency'] as const)(
  'rejects %s dependency mismatch before analysis/provider work',
  async (failure) => {
    const graph = request();
    // Isolate capture -> analysis, with the invalid graph still accepted as structurally acyclic.
    graph.steps = graph.steps.slice(0, 2);
    if (failure === 'snapshot')
      graph.steps[1]!.input.sourceSnapshotHash = '0'.repeat(64);
    if (failure === 'version') graph.steps[1]!.input.characterVersion = 2;
    if (failure === 'missing-dependency') graph.steps[1]!.dependencies = [];
    enqueueWorkflow(repo, graph);
    const capture = repo.claim('capture')!;
    // Empty-dependency analysis could sort first; execute the captured work only if it is capture.
    if (capture.step.stageKey === 'capture-artwork')
      expect(await run(capture)).toBe(true);
    const analysis =
      capture.step.stageKey === 'analyze-captured-description'
        ? capture
        : repo.claim('analysis')!;
    const analyze = vi.spyOn(provider, 'analyze');
    await expect(run(analysis)).rejects.toThrow(/dependency|Dependency/);
    expect(analyze).not.toHaveBeenCalled();
  },
);

it('refuses orphan artifact references embedded in a fault-injected upstream checkpoint', async () => {
  const graph = request();
  graph.steps = graph.steps.slice(0, 2);
  enqueueWorkflow(repo, graph);
  const capture = repo.claim('capture')!;
  const orphan = await store.putPng(
    { ...capture.claim, attemptId: randomUUID() },
    png,
    signal(),
  );
  // Low-level completion intentionally simulates a faulty producer; normal executeStage rejects this.
  expect(
    repo.complete(
      capture.claim,
      JSON.stringify({
        original: { assetId: originalId, sha256: sha256(png) },
        preview: orphan,
      }),
    ),
  ).toBe(true);
  const analyze = vi.spyOn(provider, 'analyze');
  await expect(run(repo.claim('analysis')!)).rejects.toThrow(
    'Unselected dependency artifact',
  );
  expect(analyze).not.toHaveBeenCalled();
});

it('rejects invalid provider output instead of checkpointing success', async () => {
  const { work } = await prepareMaster();
  const generate = provider.generate.bind(provider);
  vi.spyOn(provider, 'generate').mockImplementation(async (...args) => ({
    ...(await generate(...args)),
    sha256: '0'.repeat(64),
  }));
  await expect(run(work)).rejects.toThrow('provenance/hash mismatch');
  expect(repo.step(work.step.id)?.outputJson).toBeNull();
});

it.each(['implementation', 'target'] as const)(
  'rejects an unsupported upstream %s before provider work',
  async (failure) => {
    const graph = request();
    graph.steps = graph.steps.slice(0, 2);
    if (failure === 'implementation') graph.steps[0]!.stageVersion = '2';
    if (failure === 'target') graph.steps[0]!.targetKey = 'unexpected';
    enqueueWorkflow(repo, graph);
    const capture = repo.claim('capture')!;
    const preview = await store.putPng(capture.claim, png, signal());
    repo.complete(
      capture.claim,
      JSON.stringify({
        original: { assetId: originalId, sha256: sha256(png) },
        preview,
      }),
    );
    const analyze = vi.spyOn(provider, 'analyze');
    await expect(run(repo.claim('analysis')!)).rejects.toThrow(
      'Required typed dependency',
    );
    expect(analyze).not.toHaveBeenCalled();
  },
);

it('rejects provider changes to the explicitly selected body type', async () => {
  const graph = request();
  graph.steps = graph.steps.slice(0, 2);
  enqueueWorkflow(repo, graph);
  expect(await run(repo.claim('capture')!)).toBe(true);
  const analyze = provider.analyze.bind(provider);
  vi.spyOn(provider, 'analyze').mockImplementation(async (...args) => ({
    ...(await analyze(...args)),
    bodyType: 'quadruped',
  }));
  await expect(run(repo.claim('analysis')!)).rejects.toThrow(
    'explicit creative choices',
  );
});

async function prepareSheet() {
  const { work: frames } = await prepareFrameBranch('walk', true, true);
  expect(
    await executeStage(
      repo,
      frames,
      framesStage(new FrameMockProvider(), 'walk'),
      signal(),
      undefined,
      store,
    ),
  ).toBe(true);
  const normalization = repo.claim('normalizer')!;
  expect(
    await executeStage(
      repo,
      normalization,
      normalizeFramesStage('walk'),
      signal(),
      undefined,
      store,
    ),
  ).toBe(true);
  const source = normalizedFramesOutputSchema.parse(
    JSON.parse(repo.step(normalization.step.id)!.outputJson!),
  );
  reopen();
  return { source, work: repo.claim('packer')! };
}

it('adopts a deterministic sheet from the selected normalized branch', async () => {
  const { source, work } = await prepareSheet();
  expect(
    await executeStage(
      repo,
      work,
      packSheetStage('walk'),
      signal(),
      undefined,
      store,
    ),
  ).toBe(true);
  reopen();
  const output = sheetOutputSchema.parse(
    JSON.parse(repo.step(work.step.id)!.outputJson!),
  );
  expect(output.sourceSha256s).toEqual(
    source.frames.map((frame) => frame.image.sha256),
  );
  expect(output).toMatchObject({
    animation: 'walk',
    frameCount: 3,
    columns: 2,
    frameWidth: 256,
    frameHeight: 256,
    footAnchor: source.footAnchor,
  });
  expect(output.image).toMatchObject({
    width: 512,
    height: 512,
    attemptId: work.claim.attemptId,
  });
  expect(sha256(await store.read(output.image))).toBe(output.image.sha256);
});

it('refuses corrupt normalized artifacts without adopting a sheet', async () => {
  const { source, work } = await prepareSheet();
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
  await expect(
    executeStage(
      repo,
      work,
      packSheetStage('walk'),
      signal(),
      undefined,
      store,
    ),
  ).rejects.toThrow('Artifact hash mismatch');
  expect(repo.step(work.step.id)!.outputJson).toBeNull();
});

it('fences expired sheet attempts and rejects stale artifact adoption', async () => {
  const { work } = await prepareSheet();
  const stage = packSheetStage('walk');
  let stale: Awaited<ReturnType<typeof stage.execute>> | undefined;
  const expiring = {
    ...stage,
    async execute(...args: Parameters<typeof stage.execute>) {
      stale = await stage.execute(...args);
      now += 60000;
      repo.recoverExpired();
      return stale;
    },
  };
  expect(
    await executeStage(repo, work, expiring, signal(), undefined, store),
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
  const output = sheetOutputSchema.parse(
    JSON.parse(repo.step(work.step.id)!.outputJson!),
  );
  expect(output.image.sha256).toBe(stale!.image.sha256);
  expect(output.image.attemptId).toBe(replacement.claim.attemptId);
});

it('does not adopt a sheet cancelled after artifact creation', async () => {
  const { work } = await prepareSheet();
  const controller = new AbortController();
  const put = store.putPng.bind(store);
  vi.spyOn(store, 'putPng').mockImplementation(async (...args) => {
    const result = await put(...args);
    controller.abort();
    return result;
  });
  await expect(
    executeStage(
      repo,
      work,
      packSheetStage('walk'),
      controller.signal,
      undefined,
      store,
    ),
  ).rejects.toThrow();
  expect(repo.step(work.step.id)!.outputJson).toBeNull();
});

it('rejects a handler for a different branch', async () => {
  const { work } = await prepareSheet();
  await expect(
    executeStage(
      repo,
      work,
      packSheetStage('idle'),
      signal(),
      undefined,
      store,
    ),
  ).rejects.toThrow();
  expect(repo.step(work.step.id)!.outputJson).toBeNull();
});
