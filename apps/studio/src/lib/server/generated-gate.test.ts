import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, expect, it } from 'vitest';
import {
  CharacterRepository,
  SnapshotRepository,
  WorkflowRepository,
  migrateDatabase,
  openDatabase,
} from '@doodleforge/database';
import { sha256 } from '@doodleforge/contracts';
import { mockReviewFixture } from '../../../../../tools/content-cli/src/mock-review-fixture.js';

let root: string,
  db: ReturnType<typeof openDatabase>,
  repo: WorkflowRepository,
  snapshots: SnapshotRepository;
let fixture: Awaited<ReturnType<typeof mockReviewFixture>>;
beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'doodle-generated-gate-'));
  migrateDatabase(join(root, 'queue.sqlite'));
  db = openDatabase(join(root, 'queue.sqlite'));
  fixture = await mockReviewFixture(db, root);
  repo = new WorkflowRepository(db);
  snapshots = new SnapshotRepository(db);
});
afterEach(() => {
  db.close();
  rmSync(root, { recursive: true, force: true });
});
function input() {
  const s = snapshots.get(fixture.versionId)!;
  return {
    characterId: fixture.characterId,
    versionId: fixture.versionId,
    expectedManifestSha256: s.manifestSha256!,
    expectedSourceSha256: sha256(s.sourceSnapshotJson),
    expectedDecisionOrder: 0,
    decision: 'approved' as const,
    actorLabel: 'local-test',
    note: '',
  };
}
function job() {
  return repo.recentGenerationJobs(fixture.characterId)[0]!.job;
}
it('atomically synchronizes hash-bound approve, reject and revoke without publication', () => {
  const request = input();
  const first = repo.recordGeneratedReviewDecision(request);
  expect(first.decisionOrder).toBe(1);
  expect(job().status).toBe('waiting_publish');
  expect(snapshots.get(fixture.versionId)!.status).toBe('approved');
  expect(() => repo.recordGeneratedReviewDecision(request)).toThrow();
  expect(snapshots.latestDecision(fixture.versionId)!.decisionOrder).toBe(1);
  repo.recordGeneratedReviewDecision({
    ...request,
    expectedDecisionOrder: 1,
    decision: 'rejected',
  });
  expect(job().status).toBe('waiting_approval');
  expect(snapshots.get(fixture.versionId)!.status).toBe('review');
  repo.recordGeneratedReviewDecision({
    ...request,
    expectedDecisionOrder: 2,
    decision: 'approved',
  });
  repo.recordGeneratedReviewDecision({
    ...request,
    expectedDecisionOrder: 3,
    decision: 'revoked',
  });
  expect(job().status).toBe('waiting_approval');
  expect(snapshots.latestDecision(fixture.versionId)!.decision).toBe('revoked');
  expect(
    db.sqlite.prepare('SELECT COUNT(*) AS n FROM content_releases').get(),
  ).toEqual({ n: 0 });
});
it('serializes competing decision and cancellation attempts across connections', () => {
  const request = input();
  const other = openDatabase(join(root, 'queue.sqlite'));
  try {
    const competitor = new WorkflowRepository(other);
    repo.recordGeneratedReviewDecision(request);
    expect(() => competitor.recordGeneratedReviewDecision(request)).toThrow();
    expect(snapshots.latestDecision(fixture.versionId)!.decisionOrder).toBe(1);
    expect(competitor.cancel(job().id)).toBe(true);
    expect(() =>
      repo.recordGeneratedReviewDecision({
        ...request,
        expectedDecisionOrder: 1,
        decision: 'revoked',
      }),
    ).toThrow();
    expect(snapshots.latestDecision(fixture.versionId)!.decision).toBe(
      'approved',
    );
  } finally {
    other.close();
  }
});

it('rolls decision and snapshot status back on gate update failure', () => {
  db.sqlite.exec(
    "CREATE TRIGGER fail_generated_gate BEFORE UPDATE ON generation_jobs WHEN NEW.status='waiting_publish' BEGIN SELECT RAISE(ABORT, 'fault'); END;",
  );
  expect(() => repo.recordGeneratedReviewDecision(input())).toThrow();
  expect(snapshots.latestDecision(fixture.versionId)).toBeUndefined();
  expect(snapshots.get(fixture.versionId)!.status).toBe('review');
  expect(job().status).toBe('waiting_approval');
});
it('rejects source/hash/owner mismatches, cancellation and archive', () => {
  const request = input();
  expect(() =>
    repo.recordGeneratedReviewDecision({
      ...request,
      characterId: randomUUID(),
    }),
  ).toThrow();
  expect(() =>
    repo.recordGeneratedReviewDecision({
      ...request,
      expectedSourceSha256: '0'.repeat(64),
    }),
  ).toThrow();
  expect(() =>
    repo.recordGeneratedReviewDecision({
      ...request,
      expectedManifestSha256: '0'.repeat(64),
    }),
  ).toThrow();
  repo.cancel(job().id);
  expect(() => repo.recordGeneratedReviewDecision(request)).toThrow();
  expect(snapshots.latestDecision(fixture.versionId)).toBeUndefined();
  new CharacterRepository(db).archive(
    fixture.characterId,
    new CharacterRepository(db).get(fixture.characterId)!.editRevision,
  );
  expect(() => repo.recordGeneratedReviewDecision(request)).toThrow();
});
