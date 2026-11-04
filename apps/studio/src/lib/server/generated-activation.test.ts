import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, expect, it } from 'vitest';
import {
  SnapshotRepository,
  WorkflowRepository,
  openDatabase as openCompetingDatabase,
  migrateDatabase,
  openDatabase,
} from '@doodleforge/database';
import { canonicalJson, sha256 } from '@doodleforge/contracts';
import { mockReviewFixture } from '../../../../../tools/content-cli/src/mock-review-fixture.js';

let root: string;
let db: ReturnType<typeof openDatabase>;
let repo: WorkflowRepository;
let snapshots: SnapshotRepository;
let fixture: Awaited<ReturnType<typeof mockReviewFixture>>;
let input: ReturnType<typeof activationInput>;

function activationInput() {
  const snapshot = snapshots.get(fixture.versionId)!;
  const request = {
    characterId: fixture.characterId,
    versionId: fixture.versionId,
    expectedManifestSha256: snapshot.manifestSha256!,
    expectedSourceSha256: sha256(snapshot.sourceSnapshotJson),
    expectedDecisionOrder: 1,
    idempotencyKey: `generated-publish:${randomUUID()}`,
  };
  const publishJobId = repo.enqueueGeneratedPublication(request);
  const publishStep = db.sqlite
    .prepare('SELECT id FROM generation_steps WHERE job_id=?')
    .get(publishJobId) as { id: string };
  const workerId = 'publisher-test';
  const leaseToken = 1;
  const attemptNo = 1;
  const leaseExpiresAt = Date.now() + 60_000;
  db.sqlite
    .prepare("UPDATE generation_jobs SET status='running' WHERE id=?")
    .run(publishJobId);
  db.sqlite
    .prepare(
      "UPDATE generation_steps SET status='running',attempt_count=1,lease_owner=?,lease_token=?,lease_expires_at=? WHERE id=?",
    )
    .run(workerId, leaseToken, leaseExpiresAt, publishStep.id);
  db.sqlite
    .prepare(
      "INSERT INTO generation_attempts(id,step_id,attempt_no,lease_token,worker_id,started_at,outcome) VALUES(?,?,?,?,?,?,'running')",
    )
    .run(
      randomUUID(),
      publishStep.id,
      attemptNo,
      leaseToken,
      workerId,
      Date.now(),
    );

  const manifest = JSON.parse(snapshot.manifestJson!) as {
    characterId: string;
    characterVersion: number;
  };
  const releaseId = randomUUID();
  const entry = {
    characterId: fixture.characterId,
    characterVersionId: fixture.versionId,
    characterVersion: manifest.characterVersion,
    manifestPath: `characters/${fixture.characterId}/v${manifest.characterVersion}/character.json`,
    manifestSha256: snapshot.manifestSha256!,
  };
  const indexJson = canonicalJson({
    schemaVersion: 1,
    releaseId,
    characters: [
      {
        characterId: entry.characterId,
        characterVersion: entry.characterVersion,
        manifestPath: entry.manifestPath,
        manifestSha256: entry.manifestSha256,
      },
    ],
  });
  return {
    publishJobId,
    publishStepId: publishStep.id,
    workerId,
    attemptNo,
    leaseToken,
    parentJobId: fixture.jobId,
    characterId: fixture.characterId,
    versionId: fixture.versionId,
    expectedRequestHash: repo.job(publishJobId)!.requestHash,
    expectedSourceSha256: request.expectedSourceSha256,
    expectedManifestSha256: snapshot.manifestSha256!,
    expectedDecisionOrder: 1,
    release: {
      id: releaseId,
      indexKey: `releases/${releaseId}/index.json`,
      indexSha256: sha256(indexJson),
      indexJson,
      previousReleaseId: null,
      expectedGeneration: 0,
    },
    entries: [entry],
  };
}

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'doodle-generated-activation-'));
  migrateDatabase(join(root, 'queue.sqlite'));
  db = openDatabase(join(root, 'queue.sqlite'));
  fixture = await mockReviewFixture(db, root);
  repo = new WorkflowRepository(db);
  snapshots = new SnapshotRepository(db);
  const snapshot = snapshots.get(fixture.versionId)!;
  repo.recordGeneratedReviewDecision({
    characterId: fixture.characterId,
    versionId: fixture.versionId,
    expectedManifestSha256: snapshot.manifestSha256!,
    expectedSourceSha256: sha256(snapshot.sourceSnapshotJson),
    expectedDecisionOrder: 0,
    decision: 'approved',
    actorLabel: 'test',
    note: '',
  });
  input = activationInput();
});
afterEach(() => {
  db.close();
  rmSync(root, { recursive: true, force: true });
});

it('atomically activates staged release and completes publish attempt, child and parent jobs', () => {
  expect(repo.activateGeneratedPublication(input)).toEqual({
    status: 'activated',
    releaseId: input.release.id,
  });
  expect(repo.activateGeneratedPublication(input)).toEqual({
    status: 'replay',
    releaseId: input.release.id,
  });
  expect(
    db.sqlite
      .prepare('SELECT active_release_id,generation FROM content_state')
      .get(),
  ).toEqual({
    active_release_id: input.release.id,
    generation: 1,
  });
  expect(repo.job(input.publishJobId)?.status).toBe('succeeded');
  expect(repo.job(input.parentJobId)?.status).toBe('succeeded');
  expect(repo.step(input.publishStepId)?.status).toBe('succeeded');
  expect(
    db.sqlite
      .prepare('SELECT outcome FROM generation_attempts WHERE step_id=?')
      .get(input.publishStepId),
  ).toEqual({ outcome: 'succeeded' });
});

it('rejects an expired lease without changing any publication state', () => {
  db.sqlite
    .prepare('UPDATE generation_steps SET lease_expires_at=? WHERE id=?')
    .run(Date.now(), input.publishStepId);
  expect(repo.activateGeneratedPublication(input).status).toBe('stale');
  expect(
    db.sqlite.prepare('SELECT COUNT(*) AS n FROM content_releases').get(),
  ).toEqual({ n: 0 });
  expect(repo.job(input.publishJobId)?.status).toBe('running');
});

it('fences stale attempts and a competing release activated on another connection', () => {
  expect(
    repo.activateGeneratedPublication({ ...input, leaseToken: 2 }).status,
  ).toBe('stale');
  const competing = openCompetingDatabase(join(root, 'queue.sqlite'));
  try {
    const id = randomUUID();
    const indexJson = canonicalJson({
      schemaVersion: 1,
      releaseId: id,
      characters: [],
    });
    competing.sqlite
      .prepare(
        `INSERT INTO content_releases
      (id,status,index_key,index_sha256,index_json,previous_release_id,expected_generation,published_at)
      VALUES(?, 'ready', ?, ?, ?, NULL, 0, ?)`,
      )
      .run(
        id,
        `releases/${id}/index.json`,
        sha256(indexJson),
        indexJson,
        Date.now(),
      );
    competing.sqlite
      .prepare(
        'UPDATE content_state SET active_release_id=?,generation=1 WHERE id=1',
      )
      .run(id);
    expect(repo.activateGeneratedPublication(input).status).toBe('stale');
  } finally {
    competing.close();
  }
  expect(
    db.sqlite
      .prepare('SELECT COUNT(*) AS n FROM content_releases WHERE id=?')
      .get(input.release.id),
  ).toEqual({ n: 0 });
});

it('rejects revoked approval and parent cancellation before release visibility', () => {
  const snapshot = snapshots.get(fixture.versionId)!;
  repo.recordGeneratedReviewDecision({
    characterId: fixture.characterId,
    versionId: fixture.versionId,
    expectedManifestSha256: snapshot.manifestSha256!,
    expectedSourceSha256: sha256(snapshot.sourceSnapshotJson),
    expectedDecisionOrder: 1,
    decision: 'revoked',
    actorLabel: 'test',
    note: '',
  });
  expect(repo.activateGeneratedPublication(input).status).toBe('denied');
  repo.recordGeneratedReviewDecision({
    characterId: fixture.characterId,
    versionId: fixture.versionId,
    expectedManifestSha256: snapshot.manifestSha256!,
    expectedSourceSha256: sha256(snapshot.sourceSnapshotJson),
    expectedDecisionOrder: 2,
    decision: 'approved',
    actorLabel: 'test',
    note: '',
  });
  db.sqlite
    .prepare('UPDATE generation_jobs SET cancel_requested_at=? WHERE id=?')
    .run(Date.now(), fixture.jobId);
  expect(repo.activateGeneratedPublication(input).status).toBe('denied');
  expect(
    db.sqlite.prepare('SELECT COUNT(*) AS n FROM content_releases').get(),
  ).toEqual({ n: 0 });
});

it('rolls back release visibility and both job completions on a late SQL fault', () => {
  db.sqlite
    .exec(`CREATE TRIGGER fail_parent_completion BEFORE UPDATE OF status ON generation_jobs
    WHEN OLD.id='${fixture.jobId}' AND NEW.status='succeeded'
    BEGIN SELECT RAISE(ABORT, 'injected completion failure'); END`);
  expect(() => repo.activateGeneratedPublication(input)).toThrow(
    'injected completion failure',
  );
  expect(
    db.sqlite.prepare('SELECT COUNT(*) AS n FROM content_releases').get(),
  ).toEqual({ n: 0 });
  expect(
    db.sqlite
      .prepare('SELECT COUNT(*) AS n FROM content_release_entries')
      .get(),
  ).toEqual({ n: 0 });
  expect(
    db.sqlite
      .prepare('SELECT active_release_id,generation FROM content_state')
      .get(),
  ).toEqual({ active_release_id: null, generation: 0 });
  expect(repo.job(input.publishJobId)?.status).toBe('running');
  expect(repo.job(fixture.jobId)?.status).toBe('waiting_publish');
  expect(repo.step(input.publishStepId)?.status).toBe('running');
  expect(
    db.sqlite
      .prepare('SELECT outcome FROM generation_attempts WHERE step_id=?')
      .get(input.publishStepId),
  ).toEqual({ outcome: 'running' });
});
