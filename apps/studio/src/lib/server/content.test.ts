import {
  chmodSync,
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
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  migrateDatabase,
  openDatabase,
  ReleaseRepository,
  SnapshotRepository,
  type DatabaseConnection,
} from '@doodleforge/database';
import {
  PublicationService,
  PublishedContentService,
  ReviewService,
} from '@doodleforge/content-publisher';
import { sha256, type CharacterManifest } from '@doodleforge/contracts';
import { contentResponse } from './content-response.js';
import { GET as current } from '../../routes/api/content/index/+server.js';
import { GET as historical } from '../../routes/api/content/releases/[releaseId]/index/+server.js';
import { GET as manifestRoute } from '../../routes/api/content/characters/[id]/versions/[version]/manifest/+server.js';
import { GET as assetRoute } from '../../routes/api/content/characters/[id]/versions/[version]/assets/[hash].png/+server.js';

vi.mock('./runtime.js', () => ({ publishedContent: () => service }));
let root: string;
let db: DatabaseConnection;
let releases: ReleaseRepository;
let reviews: ReviewService;
let publisher: PublicationService;
let service: PublishedContentService;
const fixture = (name: string) =>
  fileURLToPath(
    new URL(
      `../../../../../packages/contracts/fixtures/${name}/v1`,
      import.meta.url,
    ),
  );
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'doodle-content-'));
  migrateDatabase(join(root, 'db.sqlite'));
  db = openDatabase(join(root, 'db.sqlite'));
  releases = new ReleaseRepository(db);
  reviews = new ReviewService(new SnapshotRepository(db));
  publisher = new PublicationService(
    reviews,
    releases,
    join(root, 'published'),
  );
  service = new PublishedContentService(releases, join(root, 'published'));
});
afterEach(() => {
  db.close();
  rmSync(root, { recursive: true, force: true });
});
async function seed(name: 'sprout' | 'comet' = 'sprout') {
  const result = await reviews.seedFixture(name);
  return {
    versionId: result.versionId,
    expectedManifestSha256: result.manifestSha256!,
    sourceDirectory: fixture(name),
  };
}
async function publish() {
  const input = await seed();
  const releaseId = await publisher.publish(input);
  const entry = releases.entries(releaseId)[0]!;
  const manifest = JSON.parse(
    readFileSync(join(root, 'published', entry.manifestPath), 'utf8'),
  ) as CharacterManifest;
  return {
    input,
    releaseId,
    entry,
    manifest,
    asset: Object.values(manifest.assets)[0]!,
  };
}
// Only the event fields used by these thin routes are needed by this harness.
function event(params: Record<string, string> = {}, etag?: string) {
  return {
    params,
    request: new Request('http://localhost/api/content/index', {
      headers: etag ? { 'If-None-Match': etag } : {},
    }),
  };
}
const callCurrent = (etag?: string) =>
  current(event({}, etag) as Parameters<typeof current>[0]);
const callHistory = (id: string, etag?: string) =>
  historical(
    event({ releaseId: id }, etag) as Parameters<typeof historical>[0],
  );
const callManifest = (id: string, version = '1', etag?: string) =>
  manifestRoute(
    event({ id, version }, etag) as Parameters<typeof manifestRoute>[0],
  );
const callAsset = (id: string, hash: string, etag?: string) =>
  assetRoute(
    event({ id, version: '1', hash }, etag) as Parameters<typeof assetRoute>[0],
  );

it('does not expose approved content or invent an empty release', async () => {
  const input = await seed();
  const id = reviews.getSnapshot(input.versionId).characterId;
  expect((await callCurrent('*')).status).toBe(404);
  expect((await callManifest(id)).status).toBe(404);
  expect((await callAsset(id, 'a'.repeat(64))).status).toBe(404);
});

it('serves exact published indexes, manifests and PNGs with hash ETags and cache policies', async () => {
  const { releaseId, manifest, asset, entry } = await publish();
  const responses = [
    await callCurrent(),
    await callHistory(releaseId),
    await callManifest(manifest.characterId),
    await callAsset(manifest.characterId, asset.sha256),
  ];
  for (const response of responses) {
    expect(response.status).toBe(200);
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    const bytes = Buffer.from(await response.arrayBuffer());
    expect(response.headers.get('etag')).toBe(`"${sha256(bytes)}"`);
    expect(response.headers.get('content-length')).toBe(String(bytes.length));
  }
  expect(responses[0]!.headers.get('cache-control')).toBe('no-cache');
  expect(
    responses
      .slice(1)
      .every((response) =>
        response.headers.get('cache-control')?.includes('immutable'),
      ),
  ).toBe(true);
  expect(responses[3]!.headers.get('content-type')).toBe('image/png');
  expect(
    Buffer.from(await (await callManifest(manifest.characterId)).arrayBuffer()),
  ).toEqual(readFileSync(join(root, 'published', entry.manifestPath)));
  expect(
    Buffer.from(
      await (await callAsset(manifest.characterId, asset.sha256)).arrayBuffer(),
    ),
  ).toEqual(readFileSync(join(fixture('sprout'), asset.path)));
});

it('supports weak/list/wildcard If-None-Match and bodyless 304 for each route', async () => {
  const { releaseId, manifest, asset } = await publish();
  const first = await callCurrent();
  const response = await callCurrent(`"other", W/${first.headers.get('etag')}`);
  expect(response.status).toBe(304);
  expect(await response.text()).toBe('');
  expect(response.headers.has('content-length')).toBe(false);
  expect((await callHistory(releaseId, '*')).status).toBe(304);
  expect((await callManifest(manifest.characterId, '1', '*')).status).toBe(304);
  expect(
    (await callAsset(manifest.characterId, asset.sha256, '*')).status,
  ).toBe(304);
  expect((await callCurrent('"different"')).status).toBe(200);
});

it('retains historical ready releases and revisions after a new release and later revocation', async () => {
  const { releaseId, input, manifest } = await publish();
  const before = await (await callHistory(releaseId)).text();
  await publisher.publish(await seed('comet'));
  reviews.decide({ ...input, decision: 'revoked', actorLabel: 'test' });
  expect(await (await callHistory(releaseId)).text()).toBe(before);
  expect((await (await callCurrent()).json()).characters).toHaveLength(2);
  expect((await callManifest(manifest.characterId)).status).toBe(200);
});

it('keeps an older revision addressable after a newer revision replaces it in the active catalog', async () => {
  const { releaseId, manifest, asset } = await publish();
  const oldBytes = await (await callManifest(manifest.characterId)).text();
  const source = join(root, 'v2');
  cpSync(fixture('sprout'), source, { recursive: true });
  writeFileSync(
    join(source, 'character.json'),
    JSON.stringify({
      ...manifest,
      characterVersion: 2,
      name: 'Sprout revised',
    }),
  );
  const snapshot = await reviews.freezePackage(join(source, 'character.json'), {
    kind: 'test-v2',
  });
  reviews.decide({
    versionId: snapshot.id,
    expectedManifestSha256: snapshot.manifestSha256!,
    decision: 'approved',
    actorLabel: 'test',
  });
  await publisher.publish({
    versionId: snapshot.id,
    expectedManifestSha256: snapshot.manifestSha256!,
    sourceDirectory: source,
  });
  expect(
    (await (await callCurrent()).json()).characters[0].characterVersion,
  ).toBe(2);
  expect(
    (await (await callHistory(releaseId)).json()).characters[0]
      .characterVersion,
  ).toBe(1);
  expect(await (await callManifest(manifest.characterId)).text()).toBe(
    oldBytes,
  );
  expect((await callManifest(manifest.characterId, '2')).status).toBe(200);
  expect((await callAsset(manifest.characterId, asset.sha256)).status).toBe(
    200,
  );
});

it('does not expose another ready package asset through a character without that hash', async () => {
  const { manifest } = await publish();
  const id = await publisher.publish(await seed('comet'));
  const cometEntry = releases
    .entries(id)
    .find((entry) => entry.characterId !== manifest.characterId)!;
  const comet = JSON.parse(
    readFileSync(join(root, 'published', cometEntry.manifestPath), 'utf8'),
  ) as CharacterManifest;
  const hash = Object.values(comet.assets).find(
    (asset) =>
      !Object.values(manifest.assets).some(
        (own) => own.sha256 === asset.sha256,
      ),
  )!.sha256;
  expect((await callAsset(comet.characterId, hash)).status).toBe(200);
  expect((await callAsset(manifest.characterId, hash)).status).toBe(404);
});

it('hides filesystem-complete preparing/failed releases and orphan packages', async () => {
  const input = await seed();
  const interrupted = new PublicationService(
    reviews,
    releases,
    join(root, 'published'),
    (point) => {
      if (point === 'before-activation') throw new Error('interrupted');
    },
  );
  await expect(interrupted.publish(input)).rejects.toThrow('interrupted');
  const id = releases.preparing()[0]!.id;
  const characterId = reviews.getSnapshot(input.versionId).characterId;
  expect((await callHistory(id)).status).toBe(404);
  expect((await callManifest(characterId)).status).toBe(404);
  await publisher.reconcile();
  expect((await callHistory(id)).status).toBe(404);
});

it('rejects malformed route parameters and unknown hashes/releases without private path disclosure', async () => {
  const { manifest } = await publish();
  for (const response of [
    await callHistory('../originals'),
    await callManifest(manifest.characterId, '01'),
    await callManifest(manifest.characterId, '9007199254740992'),
    await callManifest('../db'),
    await callAsset(manifest.characterId, '../secret'),
  ]) {
    expect(response.status).toBe(400);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.text()).not.toContain(root);
  }
  expect((await callHistory(randomUUID())).status).toBe(404);
  expect((await callAsset(manifest.characterId, 'a'.repeat(64))).status).toBe(
    404,
  );
});

for (const target of ['index', 'manifest', 'asset'] as const) {
  for (const corruption of [
    'missing',
    'hash',
    'oversized',
    'symlink',
  ] as const) {
    it(`fails closed on ${corruption} ready ${target}, even with a matching conditional request`, async () => {
      const { releaseId, entry, manifest, asset } = await publish();
      const filename = join(
        root,
        'published',
        target === 'index'
          ? releases.get(releaseId)!.indexKey
          : target === 'manifest'
            ? entry.manifestPath
            : join(entry.manifestPath, '..', asset.path),
      );
      if (corruption === 'missing' || corruption === 'symlink')
        unlinkSync(filename);
      if (corruption === 'symlink') {
        const outside = join(root, 'private-original.png');
        writeFileSync(outside, 'private original');
        symlinkSync(outside, filename);
      } else if (corruption !== 'missing') {
        chmodSync(filename, 0o644);
        writeFileSync(
          filename,
          corruption === 'hash'
            ? 'corrupt'
            : Buffer.alloc(target === 'asset' ? asset.bytes + 1 : 1_048_577),
        );
      }
      const response =
        target === 'index'
          ? await callCurrent('*')
          : target === 'manifest'
            ? await callManifest(manifest.characterId, '1', '*')
            : await callAsset(manifest.characterId, asset.sha256, '*');
      expect(response.status).toBe(503);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.headers.has('etag')).toBe(false);
      expect(await response.json()).toEqual({
        error: {
          code: 'published_content_corrupt',
          message:
            'Published content unavailable; operator inspection required.',
        },
      });
      if (target === 'index')
        expect((await callHistory(releaseId, '*')).status).toBe(503);
    });
  }
}

it('sanitizes unexpected repository/runtime failures', async () => {
  const response = await contentResponse(
    new Request('http://localhost'),
    async () => {
      throw new Error(`${root}/private secret`);
    },
  );
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain(root);
});
