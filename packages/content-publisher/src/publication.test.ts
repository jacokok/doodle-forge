import {
  chmodSync,
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, expect, it } from 'vitest';
import {
  canonicalJson,
  sha256,
  type CharacterManifest,
} from '@doodleforge/contracts';
import {
  migrateDatabase,
  openDatabase,
  ReleaseRepository,
  SnapshotRepository,
  type DatabaseConnection,
} from '@doodleforge/database';
import {
  PublicationService,
  ReviewService,
  type PublicationBoundary,
} from './index.js';
let root: string;
let db: DatabaseConnection;
let reviews: ReviewService;
let releases: ReleaseRepository;
const fixture = (name: string) =>
  fileURLToPath(
    new URL(`../../contracts/fixtures/${name}/v1`, import.meta.url),
  );
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'doodle-publish-'));
  migrateDatabase(join(root, 'db.sqlite'));
  db = openDatabase(join(root, 'db.sqlite'));
  reviews = new ReviewService(new SnapshotRepository(db));
  releases = new ReleaseRepository(db);
});
afterEach(() => {
  db.close();
  rmSync(root, { recursive: true, force: true });
});
async function input(name: 'sprout' | 'comet' = 'sprout') {
  const seed = await reviews.seedFixture(name);
  return {
    versionId: seed.versionId,
    expectedManifestSha256: seed.manifestSha256!,
    sourceDirectory: fixture(name),
  };
}
function publisher(
  hook?: (boundary: PublicationBoundary) => void | Promise<void>,
  repository = releases,
) {
  return new PublicationService(
    reviews,
    repository,
    join(root, 'published'),
    hook,
  );
}
it('publishes exact immutable bytes, deduplicates retries, retains ready historical references and SQL guards', async () => {
  const first = await input();
  const id = await publisher().publish(first);
  expect(releases.state().generation).toBe(1);
  expect(await publisher().publish(first)).toBe(id);
  const entry = releases.entries(id)[0]!;
  expect(releases.readyReference(entry.manifestPath)?.release.id).toBe(id);
  const index = readFileSync(
    join(root, 'published', releases.get(id)!.indexKey),
    'utf8',
  );
  expect(sha256(index)).toBe(releases.get(id)!.indexSha256);
  expect(
    readFileSync(join(root, 'published', entry.manifestPath), 'utf8'),
  ).toBe(reviews.getSnapshot(first.versionId).manifestJson);
  const next = await publisher().publish(await input('comet'));
  expect(releases.entries(next)).toHaveLength(2);
  expect(releases.get(id)?.status).toBe('ready');
  expect(() =>
    db.sqlite
      .prepare("UPDATE content_releases SET index_json='{}' WHERE id=?")
      .run(id),
  ).toThrow(/immutable/);
  expect(() =>
    db.sqlite
      .prepare('DELETE FROM content_release_entries WHERE release_id=?')
      .run(id),
  ).toThrow(/immutable/);
  expect(db.sqlite.pragma('foreign_key_check')).toEqual([]);
});
for (const boundary of [
  'validated',
  'staged',
  'package-renamed',
  'prepared',
  'index-written',
  'before-activation',
  'activated',
] as const) {
  it(`recovers interruption at ${boundary} without exposing partial content`, async () => {
    const old = await publisher().publish(await input('comet'));
    const request = await input();
    await expect(
      publisher((point) => {
        if (point === boundary) throw new Error('crash');
      }).publish(request),
    ).rejects.toThrow('crash');
    expect(releases.state().generation).toBe(boundary === 'activated' ? 2 : 1);
    expect(releases.entries(releases.state().activeReleaseId!)).toHaveLength(
      boundary === 'activated' ? 2 : 1,
    );
    if (boundary !== 'activated')
      expect(releases.state().activeReleaseId).toBe(old);
    expect(releases.get(old)?.status).toBe('ready');
    const preparing = releases.preparing();
    const report = await publisher().reconcile();
    expect(report.failed).toHaveLength(preparing.length);
    expect(releases.preparing()).toHaveLength(0);
    const id = await publisher().publish(request);
    expect(releases.get(id)?.status).toBe('ready');
    expect(releases.state().generation).toBe(2);
    expect(releases.entries(id)).toHaveLength(2);
    expect(await publisher().publish(request)).toBe(id);
  });
}
it('rechecks latest approval inside activation after staging', async () => {
  const request = await input();
  await expect(
    publisher((point) => {
      if (point === 'before-activation')
        reviews.decide({ ...request, decision: 'revoked', actorLabel: 'race' });
    }).publish(request),
  ).rejects.toThrow(/approval required/);
  expect(releases.state().activeReleaseId).toBeNull();
  const entryPath = `characters/${reviews.getSnapshot(request.versionId).characterId}/v1/character.json`;
  expect(releases.readyReference(entryPath)).toBeUndefined();
  await publisher().reconcile();
  await expect(publisher().publish(request)).rejects.toThrow(
    /approval required/,
  );
});
it('CAS loser rebuilds on the winner across connections, retaining both characters', async () => {
  const sprout = await input();
  const comet = await input('comet');
  const second = openDatabase(join(root, 'db.sqlite'));
  let winner: string | undefined;
  try {
    const other = publisher(undefined, new ReleaseRepository(second));
    const id = await publisher(async (point) => {
      if (point === 'before-activation' && !winner)
        winner = await other.publish(comet);
    }).publish(sprout);
    expect(releases.state().generation).toBe(2);
    expect(releases.entries(id)).toHaveLength(2);
    expect(releases.get(winner!)?.status).toBe('ready');
    expect(
      db.sqlite
        .prepare(
          "SELECT count(*) AS n FROM content_releases WHERE status='failed'",
        )
        .get(),
    ).toEqual({ n: 1 });
  } finally {
    second.close();
  }
});
it('deduplicates concurrent same-revision publication', async () => {
  const request = await input();
  const second = openDatabase(join(root, 'db.sqlite'));
  try {
    const ids = await Promise.all([
      publisher().publish(request),
      publisher(undefined, new ReleaseRepository(second)).publish(request),
    ]);
    expect(ids[0]).toBe(ids[1]);
    expect(releases.state().generation).toBe(1);
  } finally {
    second.close();
  }
});
it('rejects changed approved source assets and never overwrites a corrupt existing package', async () => {
  const request = await input();
  cpSync(request.sourceDirectory, join(root, 'source'), { recursive: true });
  const manifest = JSON.parse(
    readFileSync(join(root, 'source', 'character.json'), 'utf8'),
  ) as CharacterManifest;
  writeFileSync(
    join(root, 'source', Object.values(manifest.assets)[0]!.path),
    'bad',
  );
  await expect(
    publisher().publish({ ...request, sourceDirectory: join(root, 'source') }),
  ).rejects.toThrow(/hash mismatch/);
  await expect(
    publisher((point) => {
      if (point === 'package-renamed') throw new Error('stop');
    }).publish(request),
  ).rejects.toThrow('stop');
  const target = join(
    root,
    'published',
    `characters/${manifest.characterId}/v1/character.json`,
  );
  chmodSync(target, 0o644); // Simulate external disk corruption, not publisher mutation.
  writeFileSync(target, '{}');
  await expect(publisher().publish(request)).rejects.toThrow(
    /manifest hash mismatch/,
  );
  expect(readFileSync(target, 'utf8')).toBe('{}');
  expect(releases.state().generation).toBe(0);
});
it('rolls back entries/status/pointer on an activation transaction fault', async () => {
  const request = await input();
  db.sqlite.exec(
    `CREATE TRIGGER injected_activation_fault BEFORE UPDATE ON content_state BEGIN SELECT RAISE(ABORT, 'injected transaction fault'); END`,
  );
  await expect(publisher().publish(request)).rejects.toThrow(
    /injected transaction fault/,
  );
  expect(releases.state().generation).toBe(0);
  expect(reviews.getSnapshot(request.versionId).status).toBe('approved');
  expect(
    db.sqlite
      .prepare('SELECT count(*) AS n FROM content_release_entries')
      .get(),
  ).toEqual({ n: 0 });
  await publisher().reconcile();
  db.sqlite.exec('DROP TRIGGER injected_activation_fault');
  expect(releases.get(await publisher().publish(request))?.status).toBe(
    'ready',
  );
});

it('audits invisible orphans and ready-file corruption without deleting or activating', async () => {
  const request = await input();
  await expect(
    publisher((point) => {
      if (point === 'package-renamed') throw new Error('stop');
    }).publish(request),
  ).rejects.toThrow('stop');
  const report = await publisher().reconcile();
  expect(report.orphanPackages).toHaveLength(1);
  expect(releases.readyReference(report.orphanPackages[0]!)).toBeUndefined();
  const id = await publisher().publish(request);
  const index = join(root, 'published', releases.get(id)!.indexKey);
  chmodSync(index, 0o644);
  writeFileSync(index, '{}');
  expect((await publisher().reconcile()).corruptReady).toEqual([id]);
  expect(releases.get(id)?.status).toBe('ready'); // Never silently rewrite history.
  expect(releases.state().activeReleaseId).toBe(id);
});

it('preserves old ready history and inherited authorization after revocation', async () => {
  const request = await input();
  const id = await publisher().publish(request);
  reviews.decide({ ...request, decision: 'revoked', actorLabel: 'reviewer' });
  await expect(publisher().publish(request)).rejects.toThrow(
    /approval required/,
  );
  const next = await publisher().publish(await input('comet'));
  expect(releases.entries(next)).toHaveLength(2);
  expect(releases.get(id)?.status).toBe('ready');
  expect(reviews.getSnapshot(request.versionId).status).toBe('published');
});

it('fully decodes PNGs rather than trusting approved headers/hash', async () => {
  await input();
  cpSync(fixture('sprout'), join(root, 'source'), { recursive: true });
  const filename = join(root, 'source', 'character.json');
  const manifest = JSON.parse(
    readFileSync(filename, 'utf8'),
  ) as CharacterManifest;
  manifest.characterVersion = 2;
  const asset = Object.values(manifest.assets)[0]!;
  const bytes = readFileSync(join(root, 'source', asset.path)).subarray(0, 33);
  const oldPath = asset.path;
  asset.bytes = bytes.length;
  asset.sha256 = sha256(bytes);
  asset.path = `assets/${asset.sha256}.png`;
  for (const item of Object.values(manifest.assets))
    if (item.path === oldPath) Object.assign(item, asset);
  writeFileSync(join(root, 'source', asset.path), bytes);
  writeFileSync(filename, canonicalJson(manifest));
  const snapshot = await reviews.freezePackage(filename, {
    kind: 'broken-png-test',
  });
  reviews.decide({
    versionId: snapshot.id,
    expectedManifestSha256: snapshot.manifestSha256!,
    decision: 'approved',
    actorLabel: 'test',
  });
  await expect(
    publisher().publish({
      versionId: snapshot.id,
      expectedManifestSha256: snapshot.manifestSha256!,
      sourceDirectory: join(root, 'source'),
    }),
  ).rejects.toThrow();
  expect(releases.state().generation).toBe(0);
});
