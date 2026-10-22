import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  canonicalJson,
  sha256,
  type CharacterManifest,
} from '@doodleforge/contracts';
import {
  migrateDatabase,
  openDatabase,
  SnapshotRepository,
  type DatabaseConnection,
} from '@doodleforge/database';
import { readReviewPackage, ReviewService } from './index.js';

const fixture = fileURLToPath(
  new URL('../../contracts/fixtures/sprout/v1', import.meta.url),
);
let root: string;
let connection: DatabaseConnection;
let repository: SnapshotRepository;
let service: ReviewService;
let manifestPath: string;
let manifest: CharacterManifest;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'doodle-review-'));
  const database = join(root, 'test.sqlite');
  migrateDatabase(database);
  connection = openDatabase(database);
  repository = new SnapshotRepository(connection);
  service = new ReviewService(repository);
  cpSync(fixture, join(root, 'package'), { recursive: true });
  manifestPath = join(root, 'package', 'character.json');
  manifest = JSON.parse(
    readFileSync(manifestPath, 'utf8'),
  ) as CharacterManifest;
  repository.ensureFixtureIdentity({
    id: manifest.characterId,
    name: manifest.name,
    bodyType: manifest.bodyType,
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  if (connection?.sqlite.open) connection.close();
  rmSync(root, { recursive: true, force: true });
});
const freeze = () => service.freezePackage(manifestPath, { kind: 'test' });
function save() {
  writeFileSync(manifestPath, JSON.stringify(manifest));
}
function approve(
  versionId: string,
  hash: string,
  decision: 'approved' | 'rejected' | 'revoked' = 'approved',
) {
  return service.decide({
    versionId,
    expectedManifestSha256: hash,
    decision,
    actorLabel: 'test-reviewer',
  });
}

describe('frozen review and hash-bound approvals', () => {
  it('freezes canonical bytes and declared asset hashes, and requires explicit approval', async () => {
    const snapshot = await freeze();
    expect(snapshot.status).toBe('review');
    expect(snapshot.manifestJson).toBe(canonicalJson(manifest));
    expect(snapshot.manifestSha256).toBe(sha256(snapshot.manifestJson!));
    expect(() =>
      service.requireApproval(snapshot.id, snapshot.manifestSha256!),
    ).toThrow(/approval required/);
    const decision = approve(snapshot.id, snapshot.manifestSha256!);
    expect(decision.actorLabel).toBe('test-reviewer');
    expect(
      service.requireApproval(snapshot.id, snapshot.manifestSha256!).status,
    ).toBe('approved');
    expect(connection.sqlite.pragma('foreign_key_check')).toEqual([]);
  });

  it('deduplicates identical concurrent freezes without overwriting different bytes or provenance', async () => {
    const second = openDatabase(join(root, 'test.sqlite'));
    try {
      const results = await Promise.all([
        freeze(),
        new ReviewService(new SnapshotRepository(second)).freezePackage(
          manifestPath,
          { kind: 'test' },
        ),
      ]);
      expect(results[0].id).toBe(results[1].id);
      await expect(
        service.freezePackage(manifestPath, { kind: 'changed' }),
      ).rejects.toThrow(/different snapshot/);
      manifest.name = 'Changed metadata';
      save();
      await expect(freeze()).rejects.toThrow(/different snapshot/);
    } finally {
      second.close();
    }
  });

  it('rejects stale hashes and invalid decision inputs without changing state', async () => {
    const snapshot = await freeze();
    expect(() => approve(snapshot.id, '0'.repeat(64))).toThrow(
      /hash does not match/,
    );
    expect(() =>
      service.decide({
        versionId: snapshot.id,
        expectedManifestSha256: snapshot.manifestSha256!,
        decision: 'approved',
        actorLabel: '  ',
      }),
    ).toThrow(/Invalid/);
    expect(repository.latestDecision(snapshot.id)).toBeUndefined();
    expect(repository.get(snapshot.id)?.status).toBe('review');
  });

  it('uses append order rather than timestamps and persists revocation/reapproval across connections', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    const snapshot = await freeze();
    const hash = snapshot.manifestSha256!;
    approve(snapshot.id, hash);
    const second = openDatabase(join(root, 'test.sqlite'));
    try {
      const other = new ReviewService(new SnapshotRepository(second));
      other.decide({
        versionId: snapshot.id,
        expectedManifestSha256: hash,
        decision: 'revoked',
        actorLabel: 'second-reviewer',
      });
      expect(() => service.requireApproval(snapshot.id, hash)).toThrow(
        /approval required/,
      );
      expect(repository.get(snapshot.id)?.status).toBe('review');
      expect(repository.latestDecision(snapshot.id)?.decisionOrder).toBe(2);
      expect(repository.latestDecision(snapshot.id)?.createdAt).toBe(1000);
      approve(snapshot.id, hash);
      expect(other.requireApproval(snapshot.id, hash).status).toBe('approved');
      approve(snapshot.id, hash, 'rejected');
      expect(() => other.requireApproval(snapshot.id, hash)).toThrow(
        /approval required/,
      );
    } finally {
      second.close();
    }
  });

  it('requires a new approval for metadata-only changes in a new version', async () => {
    const first = await freeze();
    approve(first.id, first.manifestSha256!);
    manifest.characterVersion = 2;
    manifest.name = 'New version';
    save();
    const second = await freeze();
    expect(second.manifestSha256).not.toBe(first.manifestSha256);
    expect(() =>
      service.requireApproval(second.id, second.manifestSha256!),
    ).toThrow(/approval required/);
    expect(() => approve(second.id, first.manifestSha256!)).toThrow(
      /hash does not match/,
    );
    expect(
      service.requireApproval(first.id, first.manifestSha256!).status,
    ).toBe('approved');
  });

  it('guards frozen identity/bytes/provenance and append-only approvals against raw SQL', async () => {
    const snapshot = await freeze();
    const sql = connection.sqlite;
    for (const change of [
      "manifest_json='{}'",
      "manifest_sha256='" + '0'.repeat(64) + "'",
      'version=2',
      "source_snapshot_json='{}'",
      'created_at=0',
      'manifest_json=NULL,manifest_sha256=NULL',
    ]) {
      expect(() =>
        sql
          .prepare(`UPDATE character_versions SET ${change} WHERE id=?`)
          .run(snapshot.id),
      ).toThrow(/immutable/);
    }
    expect(() =>
      sql.prepare('DELETE FROM character_versions WHERE id=?').run(snapshot.id),
    ).toThrow(/immutable/);
    expect(() =>
      sql
        .prepare("UPDATE character_versions SET status='approved' WHERE id=?")
        .run(snapshot.id),
    ).toThrow(/approval required/);
    expect(() =>
      sql
        .prepare(
          "INSERT INTO approvals(id,decision_order,character_version_id,manifest_sha256,decision,actor_label,note,created_at) VALUES ('raw',1,?,?,'approved','raw','',0)",
        )
        .run(snapshot.id, '0'.repeat(64)),
    ).toThrow(/does not match/);
    approve(snapshot.id, snapshot.manifestSha256!);
    expect(() =>
      sql.prepare("UPDATE approvals SET note='changed'").run(),
    ).toThrow(/append-only/);
    expect(() => sql.prepare('DELETE FROM approvals').run()).toThrow(
      /append-only/,
    );
  });

  it('freezes child ability rows, including moving a child into a frozen version', async () => {
    const sql = connection.sqlite;
    sql
      .prepare("INSERT INTO abilities VALUES ('melee','melee',1,'{}','{}')")
      .run();
    sql
      .prepare(
        "INSERT INTO character_versions(id,character_id,version,source_snapshot_json,created_at,updated_at) VALUES ('draft',?,2,'{}',0,0)",
      )
      .run(manifest.characterId);
    sql
      .prepare("INSERT INTO character_abilities VALUES ('draft','melee','{}')")
      .run();
    const snapshot = await freeze();
    expect(() =>
      sql
        .prepare("INSERT INTO character_abilities VALUES (?,'melee','{}')")
        .run(snapshot.id),
    ).toThrow(/immutable/);
    expect(() =>
      sql
        .prepare(
          "UPDATE character_abilities SET character_version_id=? WHERE character_version_id='draft'",
        )
        .run(snapshot.id),
    ).toThrow(/immutable/);
  });

  it('preserves published bytes/status when approval is later revoked', async () => {
    const snapshot = await freeze();
    approve(snapshot.id, snapshot.manifestSha256!);
    // Simulates the later publisher's status transition, not a release or visibility claim.
    connection.sqlite
      .prepare("UPDATE character_versions SET status='published' WHERE id=?")
      .run(snapshot.id);
    approve(snapshot.id, snapshot.manifestSha256!, 'revoked');
    expect(repository.get(snapshot.id)?.status).toBe('published');
    expect(() =>
      service.requireApproval(snapshot.id, snapshot.manifestSha256!),
    ).toThrow(/approval required/);
    expect(() =>
      connection.sqlite
        .prepare("UPDATE character_versions SET status='review' WHERE id=?")
        .run(snapshot.id),
    ).toThrow(/immutable/);
  });

  it('seeds both explicitly approved synthetic fixtures idempotently and never reverses revocation', async () => {
    const sprout = await service.seedFixture('sprout');
    const comet = await service.seedFixture('comet');
    expect(sprout.versionId).not.toBe(comet.versionId);
    expect(await service.seedFixture('sprout')).toEqual(sprout);
    approve(sprout.versionId, sprout.manifestSha256!, 'revoked');
    expect((await service.seedFixture('sprout')).decision).toBe('revoked');
    expect(() =>
      service.requireApproval(sprout.versionId, sprout.manifestSha256!),
    ).toThrow(/approval required/);
    expect(
      service.requireApproval(comet.versionId, comet.manifestSha256!).status,
    ).toBe('approved');
  });

  it('rejects invalid semantics and unsupported schemas before persisting', async () => {
    delete manifest.animations.walk;
    save();
    await expect(freeze()).rejects.toThrow(/required animation/);
    writeFileSync(
      manifestPath,
      JSON.stringify({ ...manifest, schemaVersion: 2 }),
    );
    await expect(freeze()).rejects.toThrow();
    expect(
      connection.sqlite
        .prepare('SELECT count(*) AS count FROM character_versions')
        .get(),
    ).toEqual({ count: 0 });
  });

  it('rejects damaged assets and symlink escapes before freezing a snapshot', async () => {
    const asset = Object.values(manifest.assets)[0]!;
    const target = join(root, 'package', asset.path);
    const original = readFileSync(target);
    writeFileSync(target, Buffer.alloc(original.length));
    await expect(freeze()).rejects.toThrow(/hash mismatch/);
    unlinkSync(target);
    const outside = join(root, 'outside.png');
    writeFileSync(outside, original);
    symlinkSync(outside, target);
    await expect(freeze()).rejects.toThrow(/package escape/);
  });

  it('bounds manifest reads and rejects unsafe asset paths', async () => {
    writeFileSync(manifestPath, ' '.repeat(1_048_577));
    await expect(readReviewPackage(manifestPath)).rejects.toThrow(/size limit/);
    Object.values(manifest.assets)[0]!.path = '../outside.png';
    save();
    await expect(freeze()).rejects.toThrow(/unsafe relative/);
  });
});
