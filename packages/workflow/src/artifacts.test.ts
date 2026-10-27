import { randomUUID } from 'node:crypto';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
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
import { sha256 } from '@doodleforge/contracts';
import {
  ArtifactStore,
  captureArtworkStage,
  enqueueWorkflow,
  executeStage,
  type Artifact,
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
let characterId: string;
let originalId: string;
let now: number;
const signal = () => new AbortController().signal;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'doodle-artifacts-'));
  mkdirSync(join(root, 'originals'));
  mkdirSync(join(root, 'artifacts'));
  const path = join(root, 'queue.sqlite');
  migrateDatabase(path);
  connection = openDatabase(path);
  now = 1000;
  repo = new WorkflowRepository(connection, () => now);
  assets = new AssetRepository(connection);
  store = new ArtifactStore(join(root, 'artifacts'));
  const character = new CharacterRepository(connection).create({
    name: 'Capture',
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
      mediaType: 'image/png',
      bytes: png.length,
      sha256: sha256(png),
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
      mediaType: 'image/png',
      bytes: png.length,
      sha256: sha256(png),
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
function enqueue() {
  return enqueueWorkflow(repo, {
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
        dependencies: [],
        input: {
          schemaVersion: 1,
          characterId,
          characterVersion: 1,
          sourceSnapshotHash: 'a'.repeat(64),
          inputs: { original: { assetId: originalId, sha256: sha256(png) } },
          parameters: {},
        },
      },
    ],
  });
}
function stage() {
  return captureArtworkStage(assets, join(root, 'originals'));
}
function filename(ref: Artifact) {
  return join(
    root,
    'artifacts',
    ref.stepId,
    ref.attemptId,
    `${ref.artifactId}.png`,
  );
}
async function produce() {
  enqueue();
  const work = repo.claim('test')!;
  const ref = await store.putPng(work.claim, png, signal());
  return { work, ref };
}

it('installs verified private files without modifying original bytes; restart resolves selected output', async () => {
  enqueue();
  const work = repo.claim('test')!;
  expect(
    await executeStage(repo, work, stage(), signal(), undefined, store),
  ).toBe(true);
  const output = JSON.parse(repo.step(work.step.id)!.outputJson!);
  expect(output.original.assetId).toBe(originalId);
  const preview = await store.read(output.preview);
  expect(sha256(preview)).toBe(output.preview.sha256);
  expect(
    readFileSync(join(root, 'originals', `${originalId}.original`)),
  ).toEqual(png);
  connection.close();
  connection = openDatabase(join(root, 'queue.sqlite'));
  repo = new WorkflowRepository(connection, () => now);
  assets = new AssetRepository(connection);
  store = new ArtifactStore(join(root, 'artifacts'));
  expect(
    await store.read(JSON.parse(repo.step(work.step.id)!.outputJson!).preview),
  ).toEqual(preview);
  enqueue();
  const next = repo.claim('restart')!;
  expect(
    await executeStage(repo, next, stage(), signal(), undefined, store),
  ).toBe(true);
  expect(JSON.parse(repo.step(next.step.id)!.outputJson!).preview.sha256).toBe(
    output.preview.sha256,
  );
});

it('recovery cannot adopt an expired attempt artifact, and late completion leaves only an orphan', async () => {
  enqueue();
  const old = repo.claim('old')!;
  const output = await stage().execute(
    { claim: old.claim, signal: signal(), log() {}, artifacts: store },
    JSON.parse(old.step.inputJson),
  );
  connection.close();
  connection = openDatabase(join(root, 'queue.sqlite'));
  repo = new WorkflowRepository(connection, () => now);
  assets = new AssetRepository(connection);
  store = new ArtifactStore(join(root, 'artifacts'));
  now += 60_000;
  expect(repo.recoverExpired()).toBe(1);
  now += 2000;
  const next = repo.claim('new')!;
  expect(repo.complete(old.claim, JSON.stringify(output))).toBe(false);
  const stolen: ReturnType<typeof stage> = {
    ...stage(),
    execute: async () => output,
  };
  await expect(
    executeStage(repo, next, stolen, signal(), undefined, store),
  ).rejects.toThrow('attempt mismatch');
  expect(repo.step(next.step.id)?.outputJson).toBeNull();
  expect(
    await executeStage(repo, next, stage(), signal(), undefined, store),
  ).toBe(true);
  const selected = JSON.parse(repo.step(next.step.id)!.outputJson!).preview;
  expect(selected.attemptId).toBe(next.claim.attemptId);
  expect(selected.sha256).toBe(output.preview.sha256);
  expect(await store.read(output.preview)).toBeDefined();
});

it('cancellation between file installation and checkpoint adoption retains file but rejects output', async () => {
  const job = enqueue();
  const work = repo.claim('test')!;
  const base = stage();
  let orphan: Artifact | undefined;
  const cancelling: ReturnType<typeof stage> = {
    ...base,
    async execute(context, input) {
      const result = await base.execute(context, input);
      orphan = result.preview;
      repo.cancel(job);
      return result;
    },
  };
  expect(
    await executeStage(repo, work, cancelling, signal(), undefined, store),
  ).toBe(false);
  expect(repo.step(work.step.id)?.outputJson).toBeNull();
  expect(await store.read(orphan!)).toBeDefined();
});

it('abort after artifact installation rejects adoption even if handler returns', async () => {
  enqueue();
  const work = repo.claim('test')!;
  const controller = new AbortController();
  const base = stage();
  const aborting: ReturnType<typeof stage> = {
    ...base,
    async execute(context, input) {
      const output = await base.execute(context, input);
      controller.abort();
      return output;
    },
  };
  await expect(
    executeStage(repo, work, aborting, controller.signal, undefined, store),
  ).rejects.toThrow();
  expect(repo.step(work.step.id)?.outputJson).toBeNull();
});

it('revalidates declared bytes before adopting a handler output', async () => {
  enqueue();
  const work = repo.claim('test')!;
  const base = stage();
  const corrupting: ReturnType<typeof stage> = {
    ...base,
    async execute(context, input) {
      const output = await base.execute(context, input);
      chmodSync(filename(output.preview), 0o600);
      writeFileSync(
        filename(output.preview),
        Buffer.alloc(output.preview.bytes),
      );
      return output;
    },
  };
  await expect(
    executeStage(repo, work, corrupting, signal(), undefined, store),
  ).rejects.toThrow('hash mismatch');
  expect(repo.step(work.step.id)?.outputJson).toBeNull();
});

it.each(['missing', 'hash', 'dimensions', 'size', 'symlink'] as const)(
  'rejects %s artifact on restart/read',
  async (failure) => {
    const { ref } = await produce();
    if (failure === 'missing' || failure === 'symlink')
      unlinkSync(filename(ref));
    if (failure === 'symlink')
      symlinkSync(
        join(root, 'originals', `${originalId}.original`),
        filename(ref),
      );
    const bad = { ...ref };
    if (failure === 'hash') bad.sha256 = '0'.repeat(64);
    if (failure === 'dimensions') bad.width++;
    if (failure === 'size') bad.bytes++;
    await expect(
      new ArtifactStore(join(root, 'artifacts')).read(bad),
    ).rejects.toThrow();
  },
);

it('rejects traversal and symlinked directories without touching outside files', async () => {
  const { ref } = await produce();
  await expect(
    store.read({ ...ref, artifactId: '../outside' }),
  ).rejects.toThrow();
  const attempt = join(root, 'artifacts', ref.stepId, ref.attemptId);
  rmSync(attempt, { recursive: true });
  symlinkSync(join(root, 'originals'), attempt);
  await expect(store.read(ref)).rejects.toThrow('Unsafe artifact directory');
  await expect(
    store.putPng(
      { stepId: ref.stepId, attemptId: ref.attemptId, workerId: 'x', token: 1 },
      png,
      signal(),
    ),
  ).rejects.toThrow('Unsafe artifact directory');
  expect(
    readFileSync(join(root, 'originals', `${originalId}.original`)),
  ).toEqual(png);
});

it.each(['owner', 'hash', 'key', 'dimensions', 'missing', 'bytes'] as const)(
  'rejects invalid original %s without checkpoint adoption',
  async (failure) => {
    enqueue();
    const work = repo.claim('test')!;
    // Inject a corrupt repository result without bypassing SQL's asset immutability guards.
    const record = { ...assets.get(originalId)! };
    if (failure === 'owner') record.characterId = randomUUID();
    if (failure === 'hash') record.sha256 = '0'.repeat(64);
    if (failure === 'key') record.storageKey = '../outside';
    if (failure === 'dimensions') record.width = 1;
    vi.spyOn(assets, 'get').mockReturnValue(record);
    if (failure === 'missing')
      unlinkSync(join(root, 'originals', `${originalId}.original`));
    if (failure === 'bytes')
      writeFileSync(
        join(root, 'originals', `${originalId}.original`),
        Buffer.alloc(png.length),
      );
    await expect(
      executeStage(repo, work, stage(), signal(), undefined, store),
    ).rejects.toThrow();
    expect(repo.step(work.step.id)?.outputJson).toBeNull();
  },
);

it('uses captured original identity even after a different original is attached', async () => {
  enqueue();
  const work = repo.claim('test')!;
  const replacementId = randomUUID();
  const previewId = randomUUID();
  const original = assets.get(originalId)!;
  const preview = assets.preview(originalId)!;
  const character = new CharacterRepository(connection).get(characterId)!;
  expect(
    assets.attach(
      characterId,
      character.editRevision,
      {
        ...original,
        id: replacementId,
        storageKey: `${replacementId}.original`,
      },
      {
        ...preview,
        id: previewId,
        storageKey: `${previewId}.png`,
        sourceAssetId: replacementId,
      },
    ),
  ).toBeDefined();
  expect(
    await executeStage(repo, work, stage(), signal(), undefined, store),
  ).toBe(true);
  expect(
    JSON.parse(repo.step(work.step.id)!.outputJson!).original.assetId,
  ).toBe(originalId);
});

it('refuses symlinked original files and roots', async () => {
  enqueue();
  const work = repo.claim('test')!;
  const original = join(root, 'originals', `${originalId}.original`);
  const outside = join(root, 'outside.png');
  writeFileSync(outside, png);
  unlinkSync(original);
  symlinkSync(outside, original);
  await expect(
    executeStage(repo, work, stage(), signal(), undefined, store),
  ).rejects.toThrow();
  unlinkSync(original);
  rmSync(join(root, 'originals'), { recursive: true });
  mkdirSync(join(root, 'other'));
  writeFileSync(join(root, 'other', `${originalId}.original`), png);
  symlinkSync(join(root, 'other'), join(root, 'originals'));
  await expect(
    executeStage(repo, work, stage(), signal(), undefined, store),
  ).rejects.toThrow('Unsafe artifact directory');
  expect(readFileSync(outside)).toEqual(png);
});

it('same-attempt writes use distinct immutable paths with identical content hashes', async () => {
  const { work, ref } = await produce();
  const again = await store.putPng(work.claim, png, signal());
  expect(again.artifactId).not.toBe(ref.artifactId);
  expect(again.sha256).toBe(ref.sha256);
  expect(readFileSync(filename(ref))).toEqual(png);
  expect(readFileSync(filename(again))).toEqual(png);
});

it('rejects invalid image, oversized input and pre-aborted writes', async () => {
  enqueue();
  const claim = repo.claim('test')!.claim;
  await expect(
    store.putPng(claim, Buffer.from('not png'), signal()),
  ).rejects.toThrow();
  await expect(
    store.putPng(claim, Buffer.alloc(10 * 1024 * 1024 + 1), signal()),
  ).rejects.toThrow('size');
  const controller = new AbortController();
  controller.abort();
  await expect(store.putPng(claim, png, controller.signal)).rejects.toThrow();
});
