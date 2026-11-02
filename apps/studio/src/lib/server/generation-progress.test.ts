import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  CharacterRepository,
  SnapshotRepository,
  WorkflowRepository,
  migrateDatabase,
  openDatabase,
} from '@doodleforge/database';
import { enqueueMockGeneration, enqueueWorkflow } from '@doodleforge/workflow';
import { mockReviewFixture } from '../../../../../tools/content-cli/src/mock-review-fixture.js';
import { CharacterService } from './characters.js';
import { GenerationProgressService } from './generation-progress.js';

let root: string,
  db: ReturnType<typeof openDatabase>,
  repo: WorkflowRepository,
  owners: CharacterRepository;
let fixture: Awaited<ReturnType<typeof mockReviewFixture>>;
let service: GenerationProgressService;
beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'doodle-progress-'));
  migrateDatabase(join(root, 'queue.sqlite'));
  db = openDatabase(join(root, 'queue.sqlite'));
  fixture = await mockReviewFixture(db, root);
  repo = new WorkflowRepository(db);
  owners = new CharacterRepository(db);
  service = new GenerationProgressService(new CharacterService(owners), repo);
});
afterEach(() => {
  vi.restoreAllMocks();
  db.close();
  rmSync(root, { recursive: true, force: true });
});
function enqueue(key = randomUUID()) {
  return enqueueMockGeneration(repo, {
    characterId: fixture.characterId,
    expectedRevision: owners.get(fixture.characterId)!.editRevision,
    idempotencyKey: key,
    style: 'pixel',
    seed: 17,
  });
}

it('projects persisted complete/queued/running/retry/failed/cancelled states without source or worker data', () => {
  const complete = service.list(fixture.characterId)[0]!;
  expect(complete).toMatchObject({
    status: 'waiting_approval',
    total: 27,
    completed: 27,
    frozenVersionId: fixture.versionId,
  });
  const next = enqueue();
  expect(
    service.list(fixture.characterId).find((job) => job.id === next.jobId),
  ).toMatchObject({ status: 'queued', completed: 0 });
  const work = repo.claim('private-worker-label')!;
  expect(
    service
      .list(fixture.characterId)
      .find((job) => job.id === next.jobId)!
      .steps.find((step) => step.status === 'running'),
  ).toMatchObject({
    stage: 'capture-artwork',
    attempts: 1,
    maxAttempts: 3,
    retryAt: null,
  });
  repo.fail(
    work.claim,
    JSON.stringify({
      code: 'TRANSIENT_STAGE_FAILURE',
      message: 'private description /secret/path',
    }),
    true,
  );
  const retry = service
    .list(fixture.characterId)
    .find((job) => job.id === next.jobId)!
    .steps.find((step) => step.attempts === 1)!;
  expect(retry).toMatchObject({
    status: 'queued',
    errorCode: 'TRANSIENT_STAGE_FAILURE',
  });
  expect(retry.retryAt).toBeGreaterThan(Date.now() - 100);
  repo.cancel(next.jobId);
  expect(
    service.list(fixture.characterId).find((job) => job.id === next.jobId)!
      .status,
  ).toBe('cancelled');
  const failed = enqueue();
  const failedWork = repo.claim('private-worker-label')!;
  repo.fail(
    failedWork.claim,
    JSON.stringify({
      code: '/secret/private-error',
      message: 'Child private description',
    }),
    false,
  );
  expect(
    service
      .list(fixture.characterId)
      .find((job) => job.id === failed.jobId)!
      .steps.find((step) => step.status === 'failed')!.errorCode,
  ).toBe('UNKNOWN_STAGE_FAILURE');
  const json = JSON.stringify(service.list(fixture.characterId));
  for (const secret of [
    'private-worker-label',
    '/secret',
    'Child private description',
    fixture.originalId,
    'sourceSnapshot',
    'inputJson',
    'outputJson',
    'artifactId',
    'leaseToken',
  ])
    expect(json).not.toContain(secret);
  expect(
    new SnapshotRepository(db).latestDecision(fixture.versionId),
  ).toBeUndefined();
});

it('returns a deterministic bounded owner-scoped snapshot and excludes other workflow protocols', () => {
  let now = Date.now() + 100;
  repo = new WorkflowRepository(db, () => now++);
  service = new GenerationProgressService(new CharacterService(owners), repo);
  const versions = Array.from({ length: 12 }, () => enqueue());
  const listed = service.list(fixture.characterId);
  expect(listed).toHaveLength(10);
  expect(listed.map((job) => job.id)).toEqual(
    versions
      .slice(-10)
      .reverse()
      .map((job) => job.jobId),
  );
  expect(service.list(fixture.characterId)).toEqual(listed);
  expect(() => repo.recentGenerationJobs(fixture.characterId, 11)).toThrow(
    'limit',
  );
  const other = owners.create({
    name: 'Other owner',
    description: '',
    bodyType: 'other',
    fightingStyle: 'unselected',
    specialPower: 'none',
  });
  enqueueWorkflow(repo, {
    schemaVersion: 1,
    characterId: other.id,
    characterVersionId: null,
    kind: 'generate',
    idempotencyKey: randomUUID(),
    steps: [
      {
        key: 'legacy',
        stageKey: 'analyze-description',
        stageVersion: '1',
        targetKey: '',
        dependencies: [],
        input: {
          schemaVersion: 1,
          characterId: other.id,
          characterVersion: 1,
          sourceSnapshotHash: 'a'.repeat(64),
          inputs: {},
          parameters: {},
        },
      },
    ],
  });
  expect(service.list(other.id)).toEqual([]);
});

it('denies missing/invalid/archived owners, including archive during repository projection', () => {
  expect(() => service.list('invalid')).toThrow('Invalid character');
  expect(() => service.list(randomUUID())).toThrow('Character not found');
  const original = repo.recentGenerationJobs.bind(repo);
  vi.spyOn(repo, 'recentGenerationJobs').mockImplementation((id) => {
    const rows = original(id);
    const owner = owners.get(id)!;
    owners.archive(id, owner.editRevision);
    return rows;
  });
  expect(() => service.list(fixture.characterId)).toThrow(
    'Character not found',
  );
  expect(() => service.list(fixture.characterId)).toThrow(
    'Character not found',
  );
});

it('fails closed with sanitized errors on corrupt requests or database faults', () => {
  const original = repo.recentGenerationJobs.bind(repo);
  vi.spyOn(repo, 'recentGenerationJobs').mockImplementation((id) =>
    original(id).map((row) => ({
      ...row,
      job: { ...row.job, requestHash: '0'.repeat(64) },
    })),
  );
  expect(() => service.list(fixture.characterId)).toThrow(
    'Generation progress unavailable',
  );
  vi.mocked(repo.recentGenerationJobs).mockImplementation(() => {
    throw new Error('/secret/db/path provider credential');
  });
  try {
    service.list(fixture.characterId);
    throw new Error('Expected rejection');
  } catch (error) {
    expect(error).toMatchObject({
      status: 503,
      code: 'generation_progress_unavailable',
      message: 'Generation progress unavailable; refresh to retry.',
    });
  }
});
