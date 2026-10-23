// Executed only by tools/smoke.mjs against its isolated migrated database/server.
import assert from 'node:assert/strict';
import { chmod, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '@doodleforge/shared/server';
import {
  openDatabase,
  ReleaseRepository,
  SnapshotRepository,
} from '@doodleforge/database';
import {
  PublicationService,
  ReviewService,
} from '@doodleforge/content-publisher';
import { sha256 } from '@doodleforge/contracts';

const config = loadConfig();
const connection = openDatabase(config.databasePath);
const request = (route: string, options?: RequestInit) =>
  fetch(`${config.origin}${route}`, options);
try {
  const reviews = new ReviewService(new SnapshotRepository(connection));
  const releases = new ReleaseRepository(connection);
  const root = path.join(config.storageRoot, 'published');
  const publisher = new PublicationService(reviews, releases, root);
  const sprout = await reviews.seedFixture('sprout');
  const characterId = reviews.getSnapshot(sprout.versionId).characterId;
  const base = `/api/content/characters/${characterId}/versions/1`;
  assert.equal((await request('/api/content/index')).status, 404);
  assert.equal((await request(`${base}/manifest`)).status, 404);
  const publish = async (name: 'sprout' | 'comet') => {
    const seed = await reviews.seedFixture(name);
    return publisher.publish({
      versionId: seed.versionId,
      expectedManifestSha256: seed.manifestSha256!,
      sourceDirectory: fileURLToPath(
        new URL(
          `../../../packages/contracts/fixtures/${name}/v1`,
          import.meta.url,
        ),
      ),
    });
  };
  const first = await publish('sprout');
  const current = await request('/api/content/index');
  assert.equal(current.status, 200);
  const index = Buffer.from(await current.arrayBuffer());
  assert.equal(current.headers.get('etag'), `"${sha256(index)}"`);
  const conditional = await request('/api/content/index', {
    headers: { 'If-None-Match': `W/${current.headers.get('etag')}` },
  });
  assert.equal(conditional.status, 304);
  assert.equal(await conditional.text(), '');
  const manifestResponse = await request(`${base}/manifest`);
  assert.equal(manifestResponse.status, 200);
  const manifest = await manifestResponse.json();
  const asset = Object.values(manifest.assets)[0] as {
    sha256: string;
    path: string;
  };
  const image = await request(`${base}/assets/${asset.sha256}.png`);
  assert.equal(image.status, 200);
  assert.equal(image.headers.get('content-type'), 'image/png');
  assert.match(image.headers.get('cache-control')!, /immutable/);
  assert.equal(sha256(Buffer.from(await image.arrayBuffer())), asset.sha256);
  const head = await request(`${base}/assets/${asset.sha256}.png`, {
    method: 'HEAD',
  });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  assert.equal(
    (await request(`${base}/manifest`, { method: 'POST' })).status,
    403,
  );
  assert.equal(
    (
      await request(`${base}/manifest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
    ).status,
    405,
  );
  for (const route of [
    '/storage/originals/private.png',
    '/published/' + releases.entries(first)[0]!.manifestPath,
    '/api/content/' + releases.entries(first)[0]!.manifestPath,
    `${base}/assets/${'a'.repeat(64)}.png`,
    `${base}/assets/${asset.sha256}.png/extra`,
  ])
    assert.equal((await request(route)).status, 404, route);
  assert.equal(
    (await request(`${base}/assets/%2e%2e%2fprivate.png`)).status,
    400,
  );
  assert.equal(
    (
      await request(
        `/api/content/characters/${characterId}/versions/01/manifest`,
      )
    ).status,
    400,
  );
  await publish('comet');
  const historical = await request(`/api/content/releases/${first}/index`);
  assert.equal(historical.status, 200);
  assert.deepEqual(Buffer.from(await historical.arrayBuffer()), index);
  assert.equal(
    (await (await request('/api/content/index')).json()).characters.length,
    2,
  );
  const filename = path.join(
    root,
    path.dirname(releases.entries(first)[0]!.manifestPath),
    asset.path,
  );
  await chmod(filename, 0o644);
  await writeFile(filename, 'external corruption');
  const corrupt = await request(`${base}/assets/${asset.sha256}.png`, {
    headers: { 'If-None-Match': '*' },
  });
  assert.equal(corrupt.status, 503);
  assert.equal(corrupt.headers.get('cache-control'), 'no-store');
  assert.equal((await corrupt.json()).error.code, 'published_content_corrupt');
  // Leave corruption for the enclosing smoke's operator-command failure check.
  console.log(
    'PASS: real HTTP published-only routes, exact bytes/ETags/HEAD/history, methods/path/private-storage denial, corrupt conditional asset 503',
  );
} finally {
  connection.close();
}
