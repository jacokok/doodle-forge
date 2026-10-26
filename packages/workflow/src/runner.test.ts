import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  CharacterRepository,
  migrateDatabase,
  openDatabase,
  WorkflowRepository,
} from '@doodleforge/database';
import {
  enqueueWorkflow,
  RetryableStageError,
  stageEnvelopeSchema,
  stageHandler,
  WorkflowRunner,
  type RunnerOptions,
  type StageContext,
  type StageEnvelope,
} from './index.js';

let root: string;
let connection: ReturnType<typeof openDatabase>;
let peer: ReturnType<typeof openDatabase>;
let repository: WorkflowRepository;
let other: WorkflowRepository;
let characterId: string;
let runners: WorkflowRunner[];
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1000);
  root = mkdtempSync(join(tmpdir(), 'doodle-runner-'));
  const path = join(root, 'queue.sqlite');
  migrateDatabase(path);
  connection = openDatabase(path);
  peer = openDatabase(path);
  repository = new WorkflowRepository(connection);
  other = new WorkflowRepository(peer);
  characterId = new CharacterRepository(connection).create({
    name: 'Runner',
    description: '',
    bodyType: 'other',
    fightingStyle: 'unselected',
    specialPower: 'none',
  }).id;
  runners = [];
});
afterEach(async () => {
  await Promise.all(runners.map((runner) => runner.close()));
  connection.close();
  peer.close();
  vi.useRealTimers();
  rmSync(root, { recursive: true, force: true });
});
function enqueue(count = 1, stageKey = 'test', version = '1') {
  return enqueueWorkflow(repository, {
    schemaVersion: 1,
    characterId,
    characterVersionId: null,
    kind: 'generate',
    idempotencyKey: randomUUID(),
    steps: Array.from({ length: count }, (_, i) => ({
      key: `step-${i}`,
      stageKey,
      stageVersion: version,
      targetKey: `target-${i}`,
      dependencies: [],
      input: {
        schemaVersion: 1,
        characterId,
        characterVersion: 1,
        sourceSnapshotHash: 'a'.repeat(64),
        inputs: {},
        parameters: {},
      },
    })),
  });
}
function steps(id: string) {
  return (
    connection.sqlite
      .prepare('SELECT id FROM generation_steps WHERE job_id=?')
      .all(id) as { id: string }[]
  ).map((row) => repository.step(row.id)!);
}
function createRunner(
  execute: (
    context: StageContext,
    input: StageEnvelope,
  ) => Promise<{ value: number }>,
  options: RunnerOptions = {},
  repo = repository,
) {
  const handler = stageHandler({
    key: 'test',
    version: '1',
    dependencies: [],
    cachePolicy: 'disabled',
    inputSchema: stageEnvelopeSchema,
    outputSchema: z.strictObject({ value: z.number().int() }),
    execute,
  });
  const runner = new WorkflowRunner(repo, [handler], options);
  runners.push(runner);
  return runner;
}
function hold(signal: AbortSignal) {
  return new Promise<{ value: number }>((_, reject) =>
    signal.addEventListener('abort', () => reject(new Error('aborted')), {
      once: true,
    }),
  );
}

describe('worker scheduler', () => {
  it('polls real SQLite and commits typed checkpoints without claiming job/review success', async () => {
    const id = enqueue();
    const runner = createRunner(async () => ({ value: 42 }));
    runner.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(steps(id)[0]?.status).toBe('succeeded');
    expect(steps(id)[0]?.outputJson).toBe('{"value":42}');
    expect(repository.job(id)?.status).toBe('running');
    expect(repository.attempts(steps(id)[0]!.id)).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(repository.attempts(steps(id)[0]!.id)).toHaveLength(1);
  });
  it('enforces bounded concurrency while independent work remains queued', async () => {
    const id = enqueue(3);
    let active = 0,
      max = 0;
    const runner = createRunner(
      async () => {
        active++;
        max = Math.max(max, active);
        await new Promise((resolve) => setTimeout(resolve, 5000));
        active--;
        return { value: 1 };
      },
      { concurrency: 2 },
    );
    runner.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(steps(id).filter((step) => step.status === 'running')).toHaveLength(
      2,
    );
    expect(steps(id).filter((step) => step.status === 'queued')).toHaveLength(
      1,
    );
    await vi.advanceTimersByTimeAsync(12_000);
    expect(steps(id).every((step) => step.status === 'succeeded')).toBe(true);
    expect(max).toBe(2);
  });
  it('heartbeats long-running work every 15 seconds without lease recovery by a competitor', async () => {
    const id = enqueue();
    const runner = createRunner(({ signal }) => hold(signal));
    runner.start();
    await vi.advanceTimersByTimeAsync(45_000);
    const step = steps(id)[0]!;
    expect(step.leaseExpiresAt).toBe(Date.now() + 60_000);
    expect(other.recoverExpired()).toBe(0);
    expect(other.claim('competitor')).toBeUndefined();
    expect(repository.attempts(step.id)).toHaveLength(1);
  });
  it('cancellation from another connection signals the handler at the next poll and blocks adoption', async () => {
    const id = enqueue();
    let signal: AbortSignal | undefined;
    const runner = createRunner((context) => {
      signal = context.signal;
      return hold(context.signal);
    });
    runner.start();
    await vi.advanceTimersByTimeAsync(0);
    other.cancel(id);
    await vi.advanceTimersByTimeAsync(1000);
    expect(signal?.aborted).toBe(true);
    expect(steps(id)[0]?.outputJson).toBeNull();
    expect(repository.attempts(steps(id)[0]!.id)[0]?.outcome).toBe('cancelled');
  });
  it('retries only explicit transient failures at persisted due times without leaking error text', async () => {
    const id = enqueue();
    let attempts = 0;
    const runner = createRunner(async () => {
      if (++attempts === 1) throw new RetryableStageError('private prompt');
      return { value: 7 };
    });
    runner.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(steps(id)[0]?.status).toBe('queued');
    expect(steps(id)[0]?.availableAt).toBe(3000);
    expect(repository.attempts(steps(id)[0]!.id)[0]?.errorJson).toBe(
      '{"code":"TRANSIENT_STAGE_FAILURE"}',
    );
    await vi.advanceTimersByTimeAsync(1999);
    expect(attempts).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(attempts).toBe(2);
    expect(steps(id)[0]?.status).toBe('succeeded');
  });
  it('fails unknown errors permanently and persists only a safe code', async () => {
    const id = enqueue();
    const runner = createRunner(async () => {
      throw new Error('private drawing data');
    });
    runner.start();
    await vi.advanceTimersByTimeAsync(5000);
    expect(repository.job(id)?.status).toBe('failed');
    expect(steps(id)[0]?.errorJson).toBe('{"code":"STAGE_EXECUTION_FAILED"}');
    expect(repository.attempts(steps(id)[0]!.id)).toHaveLength(1);
  });
  it('leaves unsupported stages and versions queued rather than consuming attempts', async () => {
    const unknown = enqueue(1, 'future-stage'),
      version = enqueue(1, 'test', '2'),
      supported = enqueue();
    const runner = createRunner(async () => ({ value: 1 }));
    runner.start();
    await vi.advanceTimersByTimeAsync(2000);
    expect(steps(unknown)[0]?.attemptCount).toBe(0);
    expect(steps(version)[0]?.attemptCount).toBe(0);
    expect(steps(supported)[0]?.status).toBe('succeeded');
  });
  it('graceful shutdown aborts, relinquishes once and resumes through a replacement runner', async () => {
    const id = enqueue();
    const runner = createRunner(({ signal }) => hold(signal));
    runner.start();
    await vi.advanceTimersByTimeAsync(0);
    await Promise.all([runner.close(), runner.close()]);
    const step = steps(id)[0]!;
    expect(step.status).toBe('queued');
    expect(step.leaseOwner).toBeNull();
    expect(
      repository.attempts(step.id).map((attempt) => attempt.outcome),
    ).toEqual(['cancelled']);
    await vi.advanceTimersByTimeAsync(2000);
    const replacement = createRunner(async () => ({ value: 9 }), {}, other);
    replacement.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(steps(id)[0]?.outputJson).toBe('{"value":9}');
    expect(
      repository.attempts(step.id).map((attempt) => attempt.outcome),
    ).toEqual(['cancelled', 'succeeded']);
  });
  it('bounds shutdown for an abort-ignoring handler and rejects its eventual completion', async () => {
    const id = enqueue();
    let finish: ((output: { value: number }) => void) | undefined;
    const runner = createRunner(
      async () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
      { shutdownGraceMs: 50 },
    );
    runner.start();
    await vi.advanceTimersByTimeAsync(0);
    const closing = runner.close();
    await vi.advanceTimersByTimeAsync(50);
    await closing;
    expect(steps(id)[0]?.status).toBe('queued');
    finish!({ value: 99 });
    await vi.advanceTimersByTimeAsync(0);
    expect(steps(id)[0]?.outputJson).toBeNull();
  });
  it('tracks attempts separately when an old abort-ignoring handler outlives local lease recovery', async () => {
    const id = enqueue();
    let finishFirst: ((output: { value: number }) => void) | undefined;
    let calls = 0;
    const heartbeat = repository.heartbeat.bind(repository);
    vi.spyOn(repository, 'heartbeat').mockImplementation((claim, leaseMs) =>
      claim.token === 1 && Date.now() > 1000
        ? false
        : heartbeat(claim, leaseMs),
    );
    const runner = createRunner(
      async ({ signal }) => {
        if (++calls === 1)
          return new Promise((resolve) => {
            finishFirst = resolve;
          });
        return hold(signal);
      },
      { concurrency: 2, pollMs: 10, heartbeatMs: 20, leaseMs: 100 },
    );
    runner.start();
    await vi.advanceTimersByTimeAsync(2100);
    expect(calls).toBe(2);
    expect(steps(id)[0]?.leaseToken).toBe(2);
    finishFirst!({ value: 99 });
    await vi.advanceTimersByTimeAsync(0);
    await runner.close();
    expect(steps(id)[0]?.status).toBe('queued');
    expect(steps(id)[0]?.outputJson).toBeNull();
    expect(
      repository.attempts(steps(id)[0]!.id).map((attempt) => attempt.outcome),
    ).toEqual(['expired', 'cancelled']);
  });
  it('bounds expired-lease recovery to 100 steps per sweep', async () => {
    const id = enqueue(101);
    for (let index = 0; index < 101; index++)
      expect(repository.claim('lost-worker')).toBeDefined();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(repository.recoverExpired()).toBe(100);
    expect(steps(id).filter((step) => step.status === 'running')).toHaveLength(
      1,
    );
    expect(other.recoverExpired()).toBe(1);
  });
  it('stops new claims on database faults and notifies the runtime once', async () => {
    const fault = vi.fn();
    const runner = createRunner(async () => ({ value: 1 }), { onFault: fault });
    const original = repository.recoverExpired.bind(repository);
    vi.spyOn(repository, 'recoverExpired').mockImplementation(() => {
      throw new Error('private database path');
    });
    runner.start();
    await vi.advanceTimersByTimeAsync(3000);
    expect(fault).toHaveBeenCalledTimes(1);
    vi.mocked(repository.recoverExpired).mockImplementation(original);
  });
  it.each([
    { concurrency: 0 },
    { concurrency: 5 },
    { heartbeatMs: 60_000 },
    { leaseMs: 0 },
    { pollMs: 0 },
  ])('rejects invalid scheduler bounds %j', (options) => {
    expect(() => createRunner(async () => ({ value: 1 }), options)).toThrow(
      'Invalid',
    );
  });
});
