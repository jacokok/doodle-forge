import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import {
  CharacterRepository,
  WorkflowRepository,
  migrateDatabase,
  openDatabase,
} from '@doodleforge/database';
import { enqueueMockGeneration } from '@doodleforge/workflow';
import { mockReviewFixture } from '../../../../../tools/content-cli/src/mock-review-fixture.js';
import { GenerationCancelService } from './generation-cancel.js';

let root: string,
  db: ReturnType<typeof openDatabase>,
  owners: CharacterRepository,
  repo: WorkflowRepository,
  service: GenerationCancelService;
let fixture: Awaited<ReturnType<typeof mockReviewFixture>>;
beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'doodle-cancel-'));
  migrateDatabase(join(root, 'queue.sqlite'));
  db = openDatabase(join(root, 'queue.sqlite'));
  fixture = await mockReviewFixture(db, root);
  owners = new CharacterRepository(db);
  repo = new WorkflowRepository(db);
  service = new GenerationCancelService(repo);
});
afterEach(() => {
  db.close();
  rmSync(root, { recursive: true, force: true });
});
function enqueue() {
  return enqueueMockGeneration(repo, {
    characterId: fixture.characterId,
    expectedRevision: owners.get(fixture.characterId)!.editRevision,
    idempotencyKey: randomUUID(),
    style: 'pixel',
    seed: 17,
  });
}
it('cancels queued work idempotently and rejects other owners or review gates', () => {
  const job = enqueue();
  const input = { characterId: fixture.characterId, jobId: job.jobId };
  expect(() => service.cancel({ ...input, characterId: randomUUID() })).toThrow(
    expect.objectContaining({ code: 'not_found' }),
  );
  const review = repo
    .recentGenerationJobs(fixture.characterId)
    .find(({ job }) => job.status === 'waiting_approval')!.job;
  expect(() => service.cancel({ ...input, jobId: review.id })).toThrow(
    expect.objectContaining({ code: 'not_cancellable' }),
  );
  expect(service.cancel(input)).toEqual({ status: 'cancelled' });
  expect(service.cancel(input)).toEqual({ status: 'cancelled' });
  expect(repo.job(job.jobId)?.status).toBe('cancelled');
  expect(repo.claim('worker')).toBeUndefined();
});
it('rejects corrupted job identity without mutating the job', () => {
  const job = enqueue();
  db.sqlite
    .prepare('UPDATE generation_jobs SET request_hash=? WHERE id=?')
    .run('0'.repeat(64), job.jobId);
  expect(() =>
    service.cancel({ characterId: fixture.characterId, jobId: job.jobId }),
  ).toThrow(expect.objectContaining({ code: 'not_found' }));
  expect(repo.job(job.jobId)?.status).toBe('queued');
});
it('fences a running attempt and denies archived owners', () => {
  const job = enqueue();
  const input = { characterId: fixture.characterId, jobId: job.jobId };
  const claim = repo.claim('worker')!.claim;
  const second = openDatabase(join(root, 'queue.sqlite'));
  try {
    expect(
      new GenerationCancelService(new WorkflowRepository(second)).cancel(input),
    ).toEqual({ status: 'cancelled' });
    expect(repo.complete(claim, '{}')).toBe(false);
  } finally {
    second.close();
  }
  const other = enqueue();
  owners.archive(
    fixture.characterId,
    owners.get(fixture.characterId)!.editRevision,
  );
  expect(() => service.cancel({ ...input, jobId: other.jobId })).toThrow(
    expect.objectContaining({ code: 'not_found' }),
  );
  expect(repo.job(other.jobId)?.status).toBe('queued');
});
