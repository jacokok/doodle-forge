import { randomUUID } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { afterEach, beforeEach, expect, it } from 'vitest';
import {
  AssetRepository,
  CharacterRepository,
  migrateDatabase,
  openDatabase,
  SnapshotRepository,
  WorkflowRepository,
} from '@doodleforge/database';
import { canonicalJson, sha256 } from '@doodleforge/contracts';
import {
  ArtifactStore,
  enqueueMockGeneration,
  generatedReviewSourceSchema,
  WorkflowRunner,
} from '@doodleforge/workflow';
import { mockStageHandlers } from './stages.js';

it('requeues only an eligible failed graph and preserves adopted upstream checkpoints and attempt history', () => {
  const job = enqueueMockGeneration(repo, command());
  const capture = repo.claim('first')!;
  expect(repo.complete(capture.claim, '{"checkpoint":"kept"}')).toBe(true);
  const failed = repo.claim('first')!;
  const sibling = repo.claim('second')!;
  expect(
    repo.fail(failed.claim, '{"code":"STAGE_EXECUTION_FAILED"}', false),
  ).toBe(true);
  const before = repo.step(capture.step.id)!;
  const other = openDatabase(join(root, 'queue.sqlite'));
  try {
    const competing = new WorkflowRepository(other);
    expect(
      competing.retryFailedMockGeneration(
        randomUUID(),
        job.jobId,
        failed.step.id,
        1,
      ),
    ).toBe('not_found');
    expect(
      competing.retryFailedMockGeneration(
        characterId,
        job.jobId,
        failed.step.id,
        2,
      ),
    ).toBe('not_retryable');
    expect(
      competing.retryFailedMockGeneration(
        characterId,
        job.jobId,
        failed.step.id,
        1,
      ),
    ).toBe('retried');
    expect(
      repo.retryFailedMockGeneration(characterId, job.jobId, failed.step.id, 1),
    ).toBe('not_retryable');
    expect(repo.step(capture.step.id)).toEqual(before);
    expect(repo.complete(sibling.claim, '{}')).toBe(false);
    expect(repo.attempts(failed.step.id)).toHaveLength(1);
    expect(repo.attempts(sibling.step.id)[0]!.outcome).toBe('cancelled');
    const next = repo.claim('replacement')!;
    expect([failed.step.id, sibling.step.id]).toContain(next.step.id);
    expect(next.step.attemptCount).toBe(2);
    expect(repo.attempts(next.step.id)).toHaveLength(2);
    expect(
      readFileSync(join(root, 'originals', `${originalId}.original`)),
    ).toEqual(png);
  } finally {
    other.close();
  }
});

it('refuses retries when the failed step has exhausted its budget', () => {
  const job = enqueueMockGeneration(repo, command());
  const failed = repo.claim('first')!;
  repo.fail(failed.claim, '{"code":"STAGE_EXECUTION_FAILED"}', false);
  connection.sqlite
    .prepare(
      'UPDATE generation_steps SET max_attempts=attempt_count WHERE id=?',
    )
    .run(failed.step.id);
  expect(
    repo.retryFailedMockGeneration(characterId, job.jobId, failed.step.id, 1),
  ).toBe('not_retryable');
  expect(repo.job(job.jobId)!.status).toBe('failed');
});

it('refuses retries when an interrupted sibling has exhausted its budget', () => {
  const job = enqueueMockGeneration(repo, command());
  const capture = repo.claim('first')!;
  repo.complete(capture.claim, '{}');
  const failed = repo.claim('first')!;
  const sibling = repo.claim('second')!;
  repo.fail(failed.claim, '{"code":"STAGE_EXECUTION_FAILED"}', false);
  connection.sqlite
    .prepare(
      'UPDATE generation_steps SET max_attempts=attempt_count WHERE id=?',
    )
    .run(sibling.step.id);
  expect(
    repo.retryFailedMockGeneration(characterId, job.jobId, failed.step.id, 1),
  ).toBe('not_retryable');
  expect(repo.job(job.jobId)!.status).toBe('failed');
});

const png = readFileSync(
  new URL(
    '../../../packages/contracts/fixtures/sprout/v1/assets/db061ac349376d65ef413dbf86627cc70e692922ab59b9087cbd11eb73bb423d.png',
    import.meta.url,
  ),
);
let root: string;
let connection: ReturnType<typeof openDatabase>;
let repo: WorkflowRepository;
let characterId: string;
let revision: number;
let originalId: string;
let runner: WorkflowRunner | undefined;
const processes: { child: ReturnType<typeof spawn>; done: Promise<unknown> }[] =
  [];
function command(key = randomUUID()) {
  return {
    characterId,
    expectedRevision: revision,
    idempotencyKey: key,
    style: 'pixel',
    seed: 17,
  };
}
function open() {
  connection = openDatabase(join(root, 'queue.sqlite'));
  repo = new WorkflowRepository(connection);
}
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'doodle-factory-'));
  mkdirSync(join(root, 'originals'));
  migrateDatabase(join(root, 'queue.sqlite'));
  open();
  const character = new CharacterRepository(connection).create({
    name: 'Pinned hero',
    description: 'Synthetic leaf hero',
    bodyType: 'humanoid',
    fightingStyle: 'light_melee',
    specialPower: 'none',
  });
  characterId = character.id;
  originalId = randomUUID();
  const previewId = randomUUID();
  const attached = new AssetRepository(connection).attach(
    character.id,
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
      createdAt: Date.now(),
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
      createdAt: Date.now(),
    },
  )!;
  revision = attached.editRevision;
  writeFileSync(join(root, 'originals', `${originalId}.original`), png);
});
afterEach(async () => {
  await runner?.close();
  runner = undefined;
  for (const { child, done } of processes.splice(0)) {
    if (child.exitCode === null && child.signalCode === null)
      child.kill('SIGKILL');
    await done;
  }
  connection.close();
  rmSync(root, { recursive: true, force: true });
});
async function until(check: () => boolean, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('Factory condition timed out');
    await delay(15);
  }
}
function launch(args: string[], env: NodeJS.ProcessEnv) {
  const child = spawn(process.execPath, args, {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout!.on('data', (bytes) => {
    output += String(bytes);
  });
  child.stderr!.on('data', (bytes) => {
    output += String(bytes);
  });
  const done = once(child, 'exit');
  processes.push({ child, done });
  return { child, done, output: () => output };
}
function env() {
  return {
    ...process.env,
    DOODLEFORGE_STORAGE_ROOT: root,
    DOODLEFORGE_DATABASE_PATH: join(root, 'queue.sqlite'),
  };
}
function cli(key: string) {
  return launch(
    [
      '--import',
      'tsx',
      'tools/content-cli/src/index.ts',
      'enqueue-mock',
      characterId,
      String(revision),
      key,
      'pixel',
      '17',
    ],
    env(),
  );
}

it('atomically captures immutable input, idempotency and retained version reservations', () => {
  const request = command();
  const first = enqueueMockGeneration(repo, request);
  expect(first.characterVersion).toBe(1);
  const job = repo.job(first.jobId)!;
  const graph = JSON.parse(job.requestJson);
  expect(graph.steps).toHaveLength(27);
  expect(graph.generation.source).toMatchObject({
    name: 'Pinned hero',
    editRevision: revision,
    original: { assetId: originalId, sha256: sha256(png) },
  });
  expect(
    graph.steps.every(
      (step: {
        input: { sourceSnapshotHash: string; characterVersion: number };
      }) =>
        step.input.sourceSnapshotHash ===
          sha256(canonicalJson(graph.generation.source)) &&
        step.input.characterVersion === 1,
    ),
  ).toBe(true);
  new CharacterRepository(connection).update(characterId, revision, {
    name: 'Later edit',
  });
  expect(enqueueMockGeneration(repo, request)).toEqual(first);
  expect(() => enqueueMockGeneration(repo, { ...request, seed: 18 })).toThrow(
    'Idempotency conflict',
  );
  expect(() => enqueueMockGeneration(repo, command())).toThrow(
    'matching edit revision',
  );
  revision++;
  expect(repo.cancel(first.jobId)).toBe(true);
  expect(enqueueMockGeneration(repo, command()).characterVersion).toBe(2);
});

it('reserves after existing frozen/draft versions and never partially enqueues on failure', () => {
  connection.sqlite
    .prepare(
      "INSERT INTO character_versions(id,character_id,version,status,source_snapshot_json,created_at,updated_at) VALUES(?,?,5,'draft','{}',?,?)",
    )
    .run(randomUUID(), characterId, Date.now(), Date.now());
  connection.sqlite.exec(
    "CREATE TRIGGER enqueue_fault BEFORE INSERT ON generation_steps WHEN NEW.stage_key='generate-frames' BEGIN SELECT RAISE(ABORT,'enqueue fault'); END;",
  );
  const request = command();
  expect(() => enqueueMockGeneration(repo, request)).toThrow('enqueue fault');
  expect(
    connection.sqlite
      .prepare('SELECT COUNT(*) AS count FROM generation_jobs')
      .get(),
  ).toEqual({ count: 0 });
  expect(
    connection.sqlite
      .prepare('SELECT COUNT(*) AS count FROM generation_steps')
      .get(),
  ).toEqual({ count: 0 });
  connection.sqlite.exec('DROP TRIGGER enqueue_fault');
  expect(enqueueMockGeneration(repo, request).characterVersion).toBe(6);
});

it('rejects unsupported intent, missing originals, invalid parameters and stale owners before jobs exist', () => {
  expect(() =>
    enqueueMockGeneration(repo, { ...command(), seed: -1 }),
  ).toThrow();
  new CharacterRepository(connection).update(characterId, revision++, {
    fightingStyle: 'unselected',
  });
  expect(() => enqueueMockGeneration(repo, command())).toThrow();
  connection.sqlite
    .prepare('UPDATE characters SET original_asset_id=NULL WHERE id=?')
    .run(characterId);
  expect(() => enqueueMockGeneration(repo, command())).toThrow(
    'original required',
  );
  new CharacterRepository(connection).archive(characterId, revision);
  expect(() => enqueueMockGeneration(repo, command())).toThrow(
    'Active character',
  );
  expect(
    connection.sqlite
      .prepare('SELECT COUNT(*) AS count FROM generation_jobs')
      .get(),
  ).toEqual({ count: 0 });
});

it('serializes competing CLI reservations across independent processes', async () => {
  const first = cli(randomUUID()),
    second = cli(randomUUID());
  expect(await first.done, first.output()).toEqual([0, null]);
  expect(await second.done, second.output()).toEqual([0, null]);
  const outputs = [JSON.parse(first.output()), JSON.parse(second.output())];
  expect(outputs.map((out) => out.characterVersion).sort()).toEqual([1, 2]);
  const key = randomUUID();
  const a = cli(key),
    b = cli(key);
  expect(await a.done, a.output()).toEqual([0, null]);
  expect(await b.done, b.output()).toEqual([0, null]);
  expect(JSON.parse(a.output())).toEqual(JSON.parse(b.output()));
  expect(JSON.parse(a.output()).characterVersion).toBe(3);
}, 20_000);

it('runs the actual registered graph after reopen and retains pinned art/metadata without approval', async () => {
  const result = enqueueMockGeneration(repo, command());
  const handlers = mockStageHandlers(connection, root);
  expect(
    new Set(handlers.map(({ key, version }) => `${key}@${version}`)).size,
  ).toBe(handlers.length);
  const byKey = new Map(handlers.map((handler) => [handler.key, handler]));
  // Adopt the shared upstream slice before restart; resumes only the remaining branches.
  for (let i = 0; i < 5; i++) {
    const work = repo.claim('before-restart')!;
    expect(
      await byKey
        .get(work.step.stageKey)!
        .execute(repo, work, new AbortController().signal, 60_000),
    ).toBe(true);
  }
  new CharacterRepository(connection).update(characterId, revision, {
    name: 'Unsaved future hero',
    description: 'Changed after enqueue',
  });
  connection.close();
  open();
  runner = new WorkflowRunner(repo, mockStageHandlers(connection, root), {
    pollMs: 5,
    concurrency: 2,
  });
  runner.start();
  await until(() =>
    ['waiting_approval', 'failed'].includes(repo.job(result.jobId)!.status),
  );
  expect(repo.job(result.jobId)!.status).toBe('waiting_approval');
  await runner.close();
  runner = undefined;
  const snapshots = new SnapshotRepository(connection);
  const snapshot = snapshots.get(repo.job(result.jobId)!.characterVersionId!)!;
  expect(JSON.parse(snapshot.manifestJson!)).toMatchObject({
    name: 'Pinned hero',
    description: 'Synthetic leaf hero',
    characterVersion: 1,
  });
  expect(snapshots.latestDecision(snapshot.id)).toBeUndefined();
  const source = generatedReviewSourceSchema.parse(
    JSON.parse(snapshot.sourceSnapshotJson),
  );
  const store = new ArtifactStore(join(root, 'generated', 'attempts'));
  for (const image of Object.values(source.assets))
    expect(sha256(await store.read(image))).toBe(image.sha256);
  expect(
    readFileSync(join(root, 'originals', `${originalId}.original`)),
  ).toEqual(png);
  const steps = connection.sqlite
    .prepare('SELECT status,attempt_count FROM generation_steps WHERE job_id=?')
    .all(result.jobId);
  expect(steps).toHaveLength(27);
  expect(
    steps.every(
      (row) =>
        (row as { status: string; attempt_count: number }).status ===
          'succeeded' && (row as { attempt_count: number }).attempt_count === 1,
    ),
  ).toBe(true);
});

it('resumes a failed animation with actual registered handlers and preserves completed checkpoints', async () => {
  const { jobId } = enqueueMockGeneration(repo, command());
  const handlers = mockStageHandlers(connection, root).map((handler) =>
    handler.key !== 'generate-frames'
      ? handler
      : {
          ...handler,
          async execute(...args: Parameters<typeof handler.execute>) {
            if (args[1].step.targetKey === 'walk')
              throw new Error('injected failure');
            return handler.execute(...args);
          },
        },
  );
  runner = new WorkflowRunner(repo, handlers, { pollMs: 5, concurrency: 1 });
  runner.start();
  await until(() => repo.job(jobId)!.status === 'failed');
  await runner.close();
  runner = undefined;
  const completed = connection.sqlite
    .prepare(
      "SELECT id,output_json,attempt_count FROM generation_steps WHERE job_id=? AND status='succeeded'",
    )
    .all(jobId);
  const failed = connection.sqlite
    .prepare(
      "SELECT id,attempt_count FROM generation_steps WHERE job_id=? AND status='failed'",
    )
    .get(jobId) as { id: string; attempt_count: number };
  expect(completed.length).toBeGreaterThan(5);
  expect(
    repo.retryFailedMockGeneration(
      characterId,
      jobId,
      failed.id,
      failed.attempt_count,
    ),
  ).toBe('retried');
  runner = new WorkflowRunner(repo, mockStageHandlers(connection, root), {
    pollMs: 5,
    concurrency: 1,
  });
  runner.start();
  await until(
    () => ['waiting_approval', 'failed'].includes(repo.job(jobId)!.status),
    60_000,
  );
  expect(repo.job(jobId)!.status).toBe('waiting_approval');
  await runner.close();
  runner = undefined;
  for (const item of completed as {
    id: string;
    output_json: string;
    attempt_count: number;
  }[]) {
    expect(repo.step(item.id)).toMatchObject({
      status: 'succeeded',
      outputJson: item.output_json,
      attemptCount: item.attempt_count,
    });
  }
  expect(repo.attempts(failed.id).map((a) => a.outcome)).toEqual([
    'failed',
    'succeeded',
  ]);
  expect(
    readFileSync(join(root, 'originals', `${originalId}.original`)),
  ).toEqual(png);
  expect(
    new SnapshotRepository(connection).latestDecision(
      repo.job(jobId)!.characterVersionId!,
    ),
  ).toBeUndefined();
}, 75_000);

it('cancellation during registered frame execution cannot freeze or approve a version', async () => {
  const { jobId } = enqueueMockGeneration(repo, command());
  const handlers = mockStageHandlers(connection, root).map((handler) =>
    handler.key !== 'generate-frames'
      ? handler
      : {
          ...handler,
          async execute(...args: Parameters<typeof handler.execute>) {
            repo.cancel(jobId);
            return handler.execute(...args);
          },
        },
  );
  runner = new WorkflowRunner(repo, handlers, { pollMs: 5, concurrency: 2 });
  runner.start();
  await until(() => repo.job(jobId)!.status === 'cancelled');
  await runner.close();
  runner = undefined;
  expect(new SnapshotRepository(connection).history(characterId)).toEqual([]);
  expect(repo.job(jobId)!.characterVersionId).toBeNull();
  expect(
    readFileSync(join(root, 'originals', `${originalId}.original`)),
  ).toEqual(png);
});

it('executes explicit CLI generation through the real worker entry to unapproved review', async () => {
  const net = createServer();
  net.listen(0, '127.0.0.1');
  await once(net, 'listening');
  const address = net.address();
  if (!address || typeof address === 'string') throw new Error('No port');
  const port = address.port;
  await new Promise<void>((resolve) => net.close(() => resolve()));
  const key = randomUUID();
  const queued = cli(key);
  expect(await queued.done, queued.output()).toEqual([0, null]);
  const result = JSON.parse(queued.output());
  const worker = launch(['--import', 'tsx', 'apps/worker/src/index.ts'], {
    ...env(),
    HOST: '127.0.0.1',
    WORKER_PORT: String(port),
    PORT: String(port === 5173 ? 5175 : 5173),
    DOODLEFORGE_WORKER_CONCURRENCY: '4',
  });
  await until(() => worker.output().includes('worker.ready'));
  expect(
    await (await fetch(`http://127.0.0.1:${port}/health`)).json(),
  ).toMatchObject({ generation: 'mock-cli' });
  await until(
    () =>
      ['failed', 'waiting_approval'].includes(repo.job(result.jobId)!.status),
    60_000,
  );
  expect(repo.job(result.jobId)!.status, worker.output()).toBe(
    'waiting_approval',
  );
  expect(
    new SnapshotRepository(connection).latestDecision(
      repo.job(result.jobId)!.characterVersionId!,
    ),
  ).toBeUndefined();
  worker.child.kill('SIGTERM');
  expect(await worker.done, worker.output()).toEqual([0, null]);
  const status = launch(
    [
      '--import',
      'tsx',
      'tools/content-cli/src/index.ts',
      'factory-status',
      result.jobId,
    ],
    env(),
  );
  expect(await status.done, status.output()).toEqual([0, null]);
  expect(JSON.parse(status.output())).toMatchObject({
    status: 'waiting_approval',
    completed: 27,
    total: 27,
    failed: 0,
  });
  expect(status.output()).not.toContain('Pinned hero');
  const repeat = cli(key);
  expect(await repeat.done).toEqual([0, null]);
  expect(JSON.parse(repeat.output())).toEqual(result);
}, 75_000);
