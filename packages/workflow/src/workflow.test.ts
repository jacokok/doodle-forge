import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { promisify } from 'node:util';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  CharacterRepository,
  migrateDatabase,
  openDatabase,
  WorkflowRepository,
} from '@doodleforge/database';
import {
  enqueueWorkflow,
  executeStage,
  stageEnvelopeSchema,
  stageInputHash,
  type Stage,
} from './index.js';

let root: string;
let path: string;
let first: ReturnType<typeof openDatabase>;
let second: ReturnType<typeof openDatabase>;
let repo: WorkflowRepository;
let other: WorkflowRepository;
let now: number;
let characterId: string;
const hash = 'a'.repeat(64);
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'doodle-workflow-'));
  path = join(root, 'queue.sqlite');
  migrateDatabase(path);
  first = openDatabase(path);
  second = openDatabase(path);
  now = 1000;
  repo = new WorkflowRepository(first, () => now);
  other = new WorkflowRepository(second, () => now);
  characterId = new CharacterRepository(first).create({
    name: 'Queue test',
    description: '',
    bodyType: 'humanoid',
    fightingStyle: 'unselected',
    specialPower: 'none',
  }).id;
});
afterEach(() => {
  first.close();
  second.close();
  rmSync(root, { recursive: true, force: true });
});
function envelope() {
  return {
    schemaVersion: 1 as const,
    characterId,
    characterVersion: 1,
    sourceSnapshotHash: hash,
    inputs: {},
    parameters: { provider: 'mock', modelVersion: '1', seed: 42 },
  };
}
function request(count = 1, maxAttempts = 3) {
  return {
    schemaVersion: 1,
    characterId,
    characterVersionId: null,
    kind: 'generate',
    idempotencyKey: randomUUID(),
    steps: Array.from({ length: count }, (_, i) => ({
      key: `step-${i}`,
      stageKey: 'test',
      stageVersion: '1',
      targetKey: `target-${i}`,
      dependencies: i ? [`step-${i - 1}`] : [],
      input: envelope(),
      maxAttempts,
    })),
  };
}
function work() {
  return repo.claim('worker-a')!;
}

describe('durable workflow foundations', () => {
  it('migrates idempotently with checked JSON, lease invariants and foreign keys', () => {
    const id = enqueueWorkflow(repo, request());
    migrateDatabase(path);
    expect(other.job(id)?.status).toBe('queued');
    expect(first.sqlite.pragma('foreign_key_check')).toEqual([]);
    const claimed = work();
    expect(() =>
      first.sqlite
        .prepare('UPDATE generation_steps SET lease_owner=NULL WHERE id=?')
        .run(claimed.step.id),
    ).toThrow(/CHECK/);
    expect(() =>
      first.sqlite
        .prepare("UPDATE generation_steps SET input_json='broken' WHERE id=?")
        .run(claimed.step.id),
    ).toThrow(/CHECK/);
    expect(() =>
      first.sqlite
        .prepare("UPDATE generation_jobs SET character_id='missing' WHERE id=?")
        .run(id),
    ).toThrow(/FOREIGN KEY/);
  });
  it('deduplicates exact requests and rejects changed input/graph under the same key', () => {
    const input = request();
    const id = enqueueWorkflow(repo, input);
    expect(enqueueWorkflow(other, input)).toBe(id);
    input.steps[0]!.stageVersion = '2';
    expect(() => enqueueWorkflow(other, input)).toThrow('Idempotency conflict');
    expect(
      first.sqlite.prepare('SELECT count(*) n FROM generation_jobs').get(),
    ).toEqual({ n: 1 });
  });
  it('rejects unknown, cyclic, duplicate and cross-owner inputs without partial insertion', () => {
    const input = request(2);
    input.steps[0]!.dependencies = ['step-1'];
    expect(() => enqueueWorkflow(repo, input)).toThrow('dependencies');
    input.steps[0]!.dependencies = ['missing'];
    expect(() => enqueueWorkflow(repo, input)).toThrow('Unknown');
    input.steps[0]!.dependencies = [];
    input.steps[1]!.key = 'step-0';
    expect(() => enqueueWorkflow(repo, input)).toThrow('Duplicate');
    input.steps[0]!.input.characterId = randomUUID();
    expect(() => enqueueWorkflow(repo, input)).toThrow('owner');
    expect(
      first.sqlite.prepare('SELECT count(*) n FROM generation_jobs').get(),
    ).toEqual({ n: 0 });
  });
  it('rolls back job insertion if a later step violates a constraint', () => {
    const input = request(2);
    input.steps[1]!.targetKey = input.steps[0]!.targetKey;
    expect(() => enqueueWorkflow(repo, input)).toThrow(/UNIQUE/);
    expect(
      first.sqlite.prepare('SELECT count(*) n FROM generation_jobs').get(),
    ).toEqual({ n: 0 });
  });
  it('rolls back claims if attempt-history insertion fails', () => {
    const id = enqueueWorkflow(repo, request());
    first.sqlite.exec(
      "CREATE TRIGGER injected_attempt_failure BEFORE INSERT ON generation_attempts BEGIN SELECT RAISE(ABORT, 'injected attempt failure'); END",
    );
    expect(() => work()).toThrow('injected attempt failure');
    expect(repo.job(id)?.status).toBe('queued');
    first.sqlite.exec('DROP TRIGGER injected_attempt_failure');
    const a = work();
    expect(a.step.attemptCount).toBe(1);
    expect(a.claim.token).toBe(1);
  });
  it('rolls back checkpoint adoption if attempt finalization fails', () => {
    enqueueWorkflow(repo, request());
    const a = work();
    first.sqlite.exec(
      "CREATE TRIGGER injected_finish_failure BEFORE UPDATE ON generation_attempts BEGIN SELECT RAISE(ABORT, 'injected finish failure'); END",
    );
    expect(() => repo.complete(a.claim, '{"result":1}')).toThrow(
      'injected finish failure',
    );
    expect(other.step(a.step.id)?.status).toBe('running');
    expect(other.step(a.step.id)?.outputJson).toBeNull();
    expect(other.attempts(a.step.id)[0]?.outcome).toBe('running');
    first.sqlite.exec('DROP TRIGGER injected_finish_failure');
    expect(repo.complete(a.claim, '{"result":1}')).toBe(true);
  });
  it('serializes competing connections and schedules dependencies only after checkpoint adoption', () => {
    enqueueWorkflow(repo, request(2));
    const a = work();
    expect(other.claim('worker-b')).toBeUndefined();
    expect(other.complete(a.claim, '{"result":1}')).toBe(true);
    const b = other.claim('worker-b')!;
    expect(b.step.id).not.toBe(a.step.id);
    expect(repo.step(a.step.id)?.outputJson).toBe('{"result":1}');
    expect(repo.complete(a.claim, '{"stale":true}')).toBe(false);
  });
  it('protects adopted checkpoints and terminal attempts against raw SQL rewrites/deletion', () => {
    enqueueWorkflow(repo, request());
    const a = work();
    repo.complete(a.claim, '{"selected":true}');
    expect(() =>
      first.sqlite
        .prepare("UPDATE generation_steps SET output_json='{}' WHERE id=?")
        .run(a.step.id),
    ).toThrow('checkpoint is immutable');
    expect(() =>
      first.sqlite
        .prepare('DELETE FROM generation_steps WHERE id=?')
        .run(a.step.id),
    ).toThrow('checkpoint cannot be deleted');
    expect(() =>
      first.sqlite
        .prepare("UPDATE generation_attempts SET outcome='failed' WHERE id=?")
        .run(a.claim.attemptId),
    ).toThrow('history is immutable');
    expect(() =>
      first.sqlite
        .prepare('DELETE FROM generation_attempts WHERE id=?')
        .run(a.claim.attemptId),
    ).toThrow('history cannot be deleted');
  });
  it('allows exactly one claim from concurrently running worker processes', async () => {
    enqueueWorkflow(repo, request());
    const moduleUrl = new URL('../../database/src/index.ts', import.meta.url)
      .href;
    const code = `import {openDatabase,WorkflowRepository} from ${JSON.stringify(moduleUrl)};
      const c=openDatabase(${JSON.stringify(path)});
      const r=new WorkflowRepository(c,()=>1000);
      console.log(JSON.stringify(r.claim('worker-'+process.pid) ?? null)); c.close();`;
    const run = promisify(execFile);
    const results = await Promise.all([
      run(process.execPath, [
        '--import',
        'tsx',
        '--input-type=module',
        '-e',
        code,
      ]),
      run(process.execPath, [
        '--import',
        'tsx',
        '--input-type=module',
        '-e',
        code,
      ]),
    ]);
    expect(
      results.map((r) => JSON.parse(r.stdout)).filter(Boolean),
    ).toHaveLength(1);
  });
  it('recovers a committed claim after SIGKILL of the owning worker process', async () => {
    enqueueWorkflow(repo, request());
    const moduleUrl = new URL('../../database/src/index.ts', import.meta.url)
      .href;
    const code = `import {openDatabase,WorkflowRepository} from ${JSON.stringify(moduleUrl)};
      const c=openDatabase(${JSON.stringify(path)});
      const r=new WorkflowRepository(c,()=>1000);
      console.log(JSON.stringify(r.claim('killed-worker'))); setInterval(()=>{},1000);`;
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', '--input-type=module', '-e', code],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const lines = createInterface({ input: child.stdout });
    const exited = once(child, 'exit');
    try {
      const [line] = await once(lines, 'line');
      const claimed = JSON.parse(line as string) as NonNullable<
        ReturnType<WorkflowRepository['claim']>
      >;
      child.kill('SIGKILL');
      expect((await exited)[1]).toBe('SIGKILL');
      first.close();
      first = openDatabase(path);
      repo = new WorkflowRepository(first, () => now);
      now = 61_000;
      expect(repo.recoverExpired()).toBe(1);
      now += 2000;
      const resumed = other.claim('replacement-worker')!;
      expect(resumed.step.id).toBe(claimed.step.id);
      expect(resumed.claim.token).toBe(claimed.claim.token + 1);
      expect(repo.complete(claimed.claim, '{}')).toBe(false);
      expect(repo.complete(resumed.claim, '{"recovered":true}')).toBe(true);
      expect(repo.attempts(resumed.step.id).map((a) => a.outcome)).toEqual([
        'expired',
        'succeeded',
      ]);
    } finally {
      lines.close();
      child.kill('SIGKILL');
      await exited;
    }
  });
  it('heartbeats extend but never shorten leases and cannot revive an expired claim', () => {
    enqueueWorkflow(repo, request());
    const a = work();
    now = 16_000;
    expect(other.heartbeat(a.claim)).toBe(true);
    expect(repo.step(a.step.id)?.leaseExpiresAt).toBe(76_000);
    expect(repo.heartbeat(a.claim, 1)).toBe(true);
    expect(repo.step(a.step.id)?.leaseExpiresAt).toBe(76_000);
    now = 76_000;
    expect(repo.heartbeat(a.claim)).toBe(false);
    expect(repo.complete(a.claim, '{}')).toBe(false);
    expect(repo.fail(a.claim, '{}', true)).toBe(false);
  });
  it('rejects wrong worker, attempt ID and fencing token on every mutation', () => {
    enqueueWorkflow(repo, request());
    const a = work();
    for (const claim of [
      { ...a.claim, workerId: 'impostor' },
      { ...a.claim, attemptId: randomUUID() },
      { ...a.claim, token: 999 },
    ]) {
      expect(other.heartbeat(claim)).toBe(false);
      expect(other.complete(claim, '{}')).toBe(false);
      expect(other.fail(claim, '{}', false)).toBe(false);
    }
    expect(repo.step(a.step.id)?.status).toBe('running');
  });
  it('recovers after closing and reopening connections; stale completion cannot replace a newer checkpoint', () => {
    enqueueWorkflow(repo, request());
    const a = work();
    first.close();
    first = openDatabase(path);
    repo = new WorkflowRepository(first, () => now);
    now = 61_000;
    expect(repo.recoverExpired()).toBe(1);
    expect(other.recoverExpired()).toBe(0);
    expect(repo.claim('worker-b')).toBeUndefined();
    now += 2000;
    const b = other.claim('worker-b')!;
    expect(b.claim.token).toBe(a.claim.token + 1);
    expect(repo.complete(a.claim, '{"stale":true}')).toBe(false);
    expect(repo.heartbeat(a.claim)).toBe(false);
    expect(repo.complete(b.claim, '{"selected":true}')).toBe(true);
    expect(repo.step(a.step.id)?.outputJson).toBe('{"selected":true}');
    expect(repo.attempts(a.step.id).map((a) => a.outcome)).toEqual([
      'expired',
      'succeeded',
    ]);
  });
  it('preserves upstream checkpoints through downstream restart recovery', () => {
    enqueueWorkflow(repo, request(3));
    const a = work();
    repo.complete(a.claim, '{"master":"immutable"}');
    const b = work();
    now = 61_000;
    repo.recoverExpired();
    now += 2000;
    const retry = work();
    expect(retry.step.id).toBe(b.step.id);
    expect(repo.step(a.step.id)?.outputJson).toBe('{"master":"immutable"}');
    expect(repo.attempts(a.step.id)).toHaveLength(1);
    expect(other.claim('other')).toBeUndefined();
  });
  it('retries transient failures at deterministic due times and fails at budget', () => {
    const id = enqueueWorkflow(repo, request(2, 2));
    const a = work();
    expect(repo.fail(a.claim, '{"code":"IO"}', true)).toBe(true);
    now += 1999;
    expect(work()).toBeUndefined();
    now++;
    const b = work();
    expect(b.step.attemptCount).toBe(2);
    repo.fail(b.claim, '{"code":"IO"}', true);
    expect(repo.job(id)?.status).toBe('failed');
    expect(repo.attempts(a.step.id).map((a) => a.outcome)).toEqual([
      'failed',
      'failed',
    ]);
    expect(work()).toBeUndefined();
    expect(
      first.sqlite
        .prepare("SELECT status FROM generation_steps WHERE status='blocked'")
        .all(),
    ).toHaveLength(1);
  });
  it('exhausts expired lease budgets and blocks descendants', () => {
    const id = enqueueWorkflow(repo, request(2, 1));
    const a = work();
    now = 61_000;
    expect(repo.recoverExpired()).toBe(1);
    expect(repo.job(id)?.status).toBe('failed');
    expect(repo.step(a.step.id)?.status).toBe('failed');
    expect(repo.attempts(a.step.id)[0]?.outcome).toBe('expired');
    expect(work()).toBeUndefined();
  });
  it('fails permanent errors without retry and fences running siblings', () => {
    const input = request(2);
    input.steps[1]!.dependencies = [];
    const id = enqueueWorkflow(repo, input);
    const a = work(),
      b = other.claim('worker-b')!;
    expect(repo.fail(a.claim, '{"code":"INVALID"}', false)).toBe(true);
    expect(repo.job(id)?.status).toBe('failed');
    expect(repo.complete(b.claim, '{}')).toBe(false);
    expect(repo.attempts(b.step.id)[0]?.outcome).toBe('cancelled');
  });
  it('cancels queued work durably and never claims it after restart', () => {
    const id = enqueueWorkflow(repo, request(2));
    expect(other.cancel(id)).toBe(true);
    expect(repo.job(id)?.cancelRequestedAt).toBe(now);
    expect(repo.cancel(id)).toBe(false);
    expect(work()).toBeUndefined();
    expect(repo.recoverExpired()).toBe(0);
  });
  it('cancels running and queued descendants and rejects in-flight completion/heartbeat/failure', () => {
    const id = enqueueWorkflow(repo, request(2));
    const a = work();
    expect(other.cancel(id)).toBe(true);
    expect(repo.heartbeat(a.claim)).toBe(false);
    expect(repo.complete(a.claim, '{}')).toBe(false);
    expect(repo.fail(a.claim, '{}', true)).toBe(false);
    now = 100_000;
    expect(repo.recoverExpired()).toBe(0);
    expect(repo.attempts(a.step.id)[0]?.outcome).toBe('cancelled');
    expect(work()).toBeUndefined();
  });
  it('retains a completed checkpoint when later cancellation wins before descendant claim', () => {
    const id = enqueueWorkflow(repo, request(2));
    const a = work();
    repo.complete(a.claim, '{"kept":true}');
    other.cancel(id);
    expect(repo.step(a.step.id)?.outputJson).toBe('{"kept":true}');
    expect(repo.step(a.step.id)?.status).toBe('succeeded');
    expect(work()).toBeUndefined();
  });
});

describe('typed stage boundaries', () => {
  function stage(): Stage<
    z.infer<typeof stageEnvelopeSchema>,
    { value: number }
  > {
    return {
      key: 'test',
      version: '1',
      inputSchema: stageEnvelopeSchema,
      outputSchema: z.strictObject({ value: z.number().int() }),
      cachePolicy: 'disabled',
      dependencies: [],
      execute: async () => ({ value: 42 }),
    };
  }
  it('hashes canonical validated input with stage and provider versions/seed', () => {
    const input = envelope();
    expect(stageInputHash('test', '1', input)).toBe(
      stageInputHash('test', '1', {
        ...input,
        parameters: { seed: 42, modelVersion: '1', provider: 'mock' },
      }),
    );
    expect(stageInputHash('test', '2', input)).not.toBe(
      stageInputHash('test', '1', input),
    );
    expect(
      stageInputHash('test', '1', {
        ...input,
        parameters: { ...input.parameters, seed: 43 },
      }),
    ).not.toBe(stageInputHash('test', '1', input));
  });
  it('validates and adopts typed outputs without implying review readiness or publication', async () => {
    const id = enqueueWorkflow(repo, request());
    const a = work();
    expect(
      await executeStage(repo, a, stage(), new AbortController().signal),
    ).toBe(true);
    expect(repo.step(a.step.id)?.outputJson).toBe('{"value":42}');
    expect(repo.job(id)?.status).toBe('running');
    expect(
      first.sqlite.prepare('SELECT count(*) n FROM content_releases').get(),
    ).toEqual({ n: 0 });
  });
  it('does not adopt invalid output, unsupported stage or corrupt input', async () => {
    enqueueWorkflow(repo, request());
    const a = work();
    const invalid = { ...stage(), execute: async () => ({ value: 0.5 }) };
    await expect(
      executeStage(repo, a, invalid, new AbortController().signal),
    ).rejects.toThrow();
    await expect(
      executeStage(
        repo,
        a,
        { ...stage(), version: '2' },
        new AbortController().signal,
      ),
    ).rejects.toThrow('Unsupported');
    await expect(
      executeStage(
        repo,
        { ...a, step: { ...a.step, inputHash: 'b'.repeat(64) } },
        stage(),
        new AbortController().signal,
      ),
    ).rejects.toThrow('Corrupt');
    expect(repo.step(a.step.id)?.outputJson).toBeNull();
  });
  it('rejects output from a handler that finishes after durable cancellation', async () => {
    const id = enqueueWorkflow(repo, request());
    const a = work();
    const handler = {
      ...stage(),
      execute: async () => {
        other.cancel(id);
        return { value: 42 };
      },
    };
    expect(
      await executeStage(repo, a, handler, new AbortController().signal),
    ).toBe(false);
    expect(repo.step(a.step.id)?.outputJson).toBeNull();
  });
  it('does not start a handler for an already cancelled claim', async () => {
    const id = enqueueWorkflow(repo, request());
    const a = work();
    other.cancel(id);
    let executed = false;
    const handler = {
      ...stage(),
      execute: async () => {
        executed = true;
        return { value: 42 };
      },
    };
    expect(
      await executeStage(repo, a, handler, new AbortController().signal),
    ).toBe(false);
    expect(executed).toBe(false);
  });
  it('honors abort signals without checkpoint adoption', async () => {
    enqueueWorkflow(repo, request());
    const a = work();
    const controller = new AbortController();
    controller.abort();
    await expect(
      executeStage(repo, a, stage(), controller.signal),
    ).rejects.toThrow();
    expect(repo.step(a.step.id)?.outputJson).toBeNull();
  });
});
