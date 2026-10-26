import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CharacterRepository,
  migrateDatabase,
  openDatabase,
  WorkflowRepository,
} from '@doodleforge/database';
import { enqueueWorkflow } from '@doodleforge/workflow';
import { startWorkerRuntime } from './runtime.js';
import { mockAnalysisStage } from './stages.js';
import { ProviderError, type Provider } from '@doodleforge/ai';

let root: string;
let path: string;
let connection: ReturnType<typeof openDatabase>;
let repository: WorkflowRepository;
let characterId: string;
let children: {
  child: ChildProcess;
  done: Promise<[number | null, NodeJS.Signals | null]>;
  output: () => string;
}[];
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'doodle-worker-runtime-'));
  path = join(root, 'queue.sqlite');
  migrateDatabase(path);
  connection = openDatabase(path);
  repository = new WorkflowRepository(connection);
  characterId = new CharacterRepository(connection).create({
    name: 'Synthetic worker test',
    description: '',
    bodyType: 'other',
    fightingStyle: 'unselected',
    specialPower: 'none',
  }).id;
  children = [];
});
afterEach(async () => {
  for (const { child, done } of children) {
    if (child.exitCode === null && child.signalCode === null)
      child.kill('SIGKILL');
    await done;
  }
  connection.close();
  rmSync(root, { recursive: true, force: true });
});
function enqueue() {
  const id = enqueueWorkflow(repository, {
    schemaVersion: 1,
    characterId,
    characterVersionId: null,
    kind: 'generate',
    idempotencyKey: randomUUID(),
    steps: [
      {
        key: 'analyze',
        stageKey: 'analyze-description',
        stageVersion: '1',
        targetKey: 'design',
        dependencies: [],
        input: {
          schemaVersion: 1,
          characterId,
          characterVersion: 1,
          sourceSnapshotHash: 'a'.repeat(64),
          inputs: {
            description: 'Friendly synthetic hero',
            bodyType: 'quadruped',
            fightingStyle: 'light_melee',
            specialPower: 'none',
          },
          parameters: {
            providerId: 'deterministic-mock',
            modelVersion: '1',
            style: 'pixel',
            seed: 42,
          },
        },
      },
    ],
  });
  const row = connection.sqlite
    .prepare('SELECT id FROM generation_steps WHERE job_id=?')
    .get(id) as { id: string };
  return { jobId: id, stepId: row.id };
}
async function until(predicate: () => boolean, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Worker condition timed out');
    await delay(15);
  }
}
function launch(args: string[], env: NodeJS.ProcessEnv = process.env) {
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
  const done = once(child, 'exit') as Promise<
    [number | null, NodeJS.Signals | null]
  >;
  const tracked = { child, done, output: () => output };
  children.push(tracked);
  return tracked;
}
async function port() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No port');
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}
function launchScheduler(mode: 'hold' | 'finish' | 'retry') {
  const db = new URL('../../../packages/database/src/index.ts', import.meta.url)
    .href;
  const workflow = new URL(
    '../../../packages/workflow/src/index.ts',
    import.meta.url,
  ).href;
  const stages = new URL('./stages.ts', import.meta.url).href;
  const code = `import {openDatabase,WorkflowRepository} from ${JSON.stringify(db)};
    import {WorkflowRunner,stageHandler,RetryableStageError} from ${JSON.stringify(workflow)};
    import {mockAnalysisStage} from ${JSON.stringify(stages)};
    const c=openDatabase(${JSON.stringify(path)}),stage=mockAnalysisStage(),original=stage.execute;
    stage.execute=async(context,input)=>{
      console.log('stage.started');
      if(${JSON.stringify(mode)}==='hold') await new Promise((resolve,reject)=>context.signal.addEventListener('abort',()=>{console.log('stage.aborted');reject(new Error('abort'));},{once:true}));
      if(${JSON.stringify(mode)}==='retry' && context.claim.token===1) throw new RetryableStageError('private raw input');
      return original(context,input);
    };
    const runner=new WorkflowRunner(new WorkflowRepository(c),[stageHandler(stage)],{pollMs:20,heartbeatMs:80,leaseMs:400});
    runner.start();console.log('scheduler.ready');
    process.once('SIGTERM',()=>{void runner.close().then(()=>{c.close();console.log('scheduler.stopped');});});`;
  return launch(['--import', 'tsx', '--input-type=module', '-e', code]);
}

describe('mock worker process integration', () => {
  it('the actual worker entry executes persisted analysis and does not repeat it after restart', async () => {
    const work = enqueue();
    const workerPort = await port();
    let studioPort = await port();
    while (studioPort === workerPort) studioPort = await port();
    const env = {
      ...process.env,
      DOODLEFORGE_STORAGE_ROOT: root,
      DOODLEFORGE_DATABASE_PATH: path,
      HOST: '127.0.0.1',
      WORKER_PORT: String(workerPort),
      PORT: String(studioPort),
      ORIGIN: `http://127.0.0.1:${studioPort}`,
      DOODLEFORGE_WORKER_CONCURRENCY: '1',
    };
    const entry = new URL('./index.ts', import.meta.url).pathname;
    const first = launch(['--import', 'tsx', entry], env);
    await until(() => repository.step(work.stepId)?.status === 'succeeded');
    const output = JSON.parse(repository.step(work.stepId)!.outputJson!);
    expect(output.brief.bodyType).toBe('quadruped');
    expect(output.provenance.providerId).toBe('deterministic-mock');
    expect(
      await (await fetch(`http://127.0.0.1:${workerPort}/health`)).json(),
    ).toEqual({ status: 'ok', service: 'worker', generation: 'unavailable' });
    first.child.kill('SIGTERM');
    expect((await first.done)[0]).toBe(0);
    const second = launch(['--import', 'tsx', entry], env);
    await until(() => second.output().includes('worker.ready'));
    second.child.kill('SIGTERM');
    expect((await second.done)[0]).toBe(0);
    expect(repository.attempts(work.stepId)).toHaveLength(1);
    expect(repository.job(work.jobId)?.status).toBe('running');
  }, 10_000);
  it('automatically recovers a killed worker, preserving fencing and attempt history', async () => {
    const work = enqueue();
    const first = launchScheduler('hold');
    await until(() => first.output().includes('stage.started'));
    const stale = repository.step(work.stepId)!;
    first.child.kill('SIGKILL');
    expect((await first.done)[1]).toBe('SIGKILL');
    const replacement = launchScheduler('finish');
    await until(
      () => repository.step(work.stepId)?.status === 'succeeded',
      6000,
    );
    expect(repository.step(work.stepId)?.leaseToken).toBe(stale.leaseToken + 1);
    expect(
      repository.attempts(work.stepId).map((attempt) => attempt.outcome),
    ).toEqual(['expired', 'succeeded']);
    replacement.child.kill('SIGTERM');
    expect((await replacement.done)[0]).toBe(0);
  }, 10_000);
  it('competing worker schedulers adopt a queued step only once', async () => {
    const work = enqueue();
    const first = launchScheduler('finish');
    const second = launchScheduler('finish');
    await until(
      () =>
        repository.step(work.stepId)?.status === 'succeeded' &&
        first.output().includes('scheduler.ready') &&
        second.output().includes('scheduler.ready'),
    );
    expect(repository.attempts(work.stepId)).toHaveLength(1);
    expect(
      (first.output() + second.output()).match(/stage.started/g),
    ).toHaveLength(1);
    first.child.kill('SIGTERM');
    second.child.kill('SIGTERM');
    expect((await first.done)[0]).toBe(0);
    expect((await second.done)[0]).toBe(0);
  });
  it('signals cancellation from a different process and never adopts its output', async () => {
    const work = enqueue();
    const worker = launchScheduler('hold');
    await until(() => worker.output().includes('stage.started'));
    repository.cancel(work.jobId);
    await until(() => worker.output().includes('stage.aborted'));
    expect(repository.step(work.stepId)?.status).toBe('cancelled');
    expect(repository.step(work.stepId)?.outputJson).toBeNull();
    worker.child.kill('SIGTERM');
    expect((await worker.done)[0]).toBe(0);
  });
  it('retries an explicit transient failure through SQLite and commits one checkpoint', async () => {
    const work = enqueue();
    const worker = launchScheduler('retry');
    await until(
      () => repository.step(work.stepId)?.status === 'succeeded',
      6000,
    );
    const attempts = repository.attempts(work.stepId);
    expect(attempts.map((attempt) => attempt.outcome)).toEqual([
      'failed',
      'succeeded',
    ]);
    expect(attempts[0]?.errorJson).toBe('{"code":"TRANSIENT_STAGE_FAILURE"}');
    expect(worker.output()).not.toContain('private raw input');
    worker.child.kill('SIGTERM');
    expect((await worker.done)[0]).toBe(0);
  }, 10_000);
  it('does not start work if the health port is unavailable', async () => {
    const work = enqueue();
    const occupied = createServer();
    occupied.listen(0, '127.0.0.1');
    await once(occupied, 'listening');
    const address = occupied.address();
    if (!address || typeof address === 'string') throw new Error('No port');
    try {
      await expect(
        startWorkerRuntime(connection, '127.0.0.1', address.port),
      ).rejects.toThrow();
      expect(repository.step(work.stepId)?.attemptCount).toBe(0);
    } finally {
      await new Promise<void>((resolve) => occupied.close(() => resolve()));
    }
  });
  it('rejects real provider selection and maps only explicit provider transient errors to retryable work', async () => {
    const provider: Provider = {
      id: 'real-provider',
      version: '1',
      capabilities: ['analyze_description'],
      generate: async () => {
        throw new Error('not called');
      },
    };
    expect(() => mockAnalysisStage(provider)).toThrow('Only mock');
    const work = enqueue();
    const claim = repository.claim('test')!;
    const { RetryableStageError } = await import('@doodleforge/workflow');
    const stage = mockAnalysisStage({
      ...provider,
      id: 'deterministic-mock',
      generate: async () => {
        throw new ProviderError('TRANSIENT_FAILURE');
      },
    });
    await expect(
      stage.execute(
        {
          claim: claim.claim,
          signal: new AbortController().signal,
          log: () => {},
        },
        JSON.parse(repository.step(work.stepId)!.inputJson),
      ),
    ).rejects.toBeInstanceOf(RetryableStageError);
  });
});
