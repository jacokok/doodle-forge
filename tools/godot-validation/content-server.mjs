import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// Deterministic hostile HTTP peer, not a substitute for the real API route tests.
export async function contentServers() {
  const servers = [];
  const env = {};
  const requests = [];
  const fixture = new URL(
    '../../packages/contracts/fixtures/sprout/v1/',
    import.meta.url,
  );
  const original = JSON.parse(
    readFileSync(new URL('character.json', fixture), 'utf8'),
  );
  const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
  const modes = [
    'good',
    'hash',
    'identity',
    'unsupported',
    'oversize',
    'malformed',
    'redirect',
    'unavailable',
    'badpath',
    'duplicate',
    'indexlimit',
    'utf8',
    'assetcorrupt',
    'assetoversize',
    'dimensions',
  ];
  try {
    for (const mode of modes) {
      const manifest = structuredClone(original);
      if (mode === 'identity') manifest.characterVersion = 2;
      if (mode === 'unsupported') manifest.schemaVersion = 2;
      if (mode === 'dimensions') {
        for (const asset of Object.values(manifest.assets)) {
          const bytes = Buffer.from(readFileSync(new URL(asset.path, fixture)));
          bytes.writeUInt32BE(512, 16);
          asset.sha256 = hash(bytes);
        }
      }
      const manifestBytes = Buffer.from(JSON.stringify(manifest));
      const entry = {
        characterId: original.characterId,
        characterVersion: 1,
        manifestPath: `characters/${original.characterId}/v1/character.json`,
        manifestSha256: mode === 'hash' ? '0'.repeat(64) : hash(manifestBytes),
      };
      const index = {
        schemaVersion: 1,
        releaseId: '11111111-1111-4111-8111-111111111111',
        characters: [entry],
      };
      if (mode === 'badpath') entry.manifestPath = '../secret';
      if (mode === 'duplicate') index.characters.push(entry);
      if (mode === 'indexlimit') index.characters = Array(1001).fill(entry);
      const prefix = `/api/content/characters/${original.characterId}/versions/1/`;
      const server = createServer((req, res) => {
        requests.push({ mode, url: req.url });
        if (mode === 'redirect') {
          res.writeHead(302, { Location: '/api/content/index' }).end();
          return;
        }
        if (mode === 'unavailable') {
          res.writeHead(503).end('unavailable');
          return;
        }
        if (req.url === '/api/content/index') {
          let bytes = Buffer.from(JSON.stringify(index));
          if (mode === 'oversize') bytes = Buffer.alloc(1048577, 32);
          if (mode === 'malformed') bytes = Buffer.from('{broken');
          if (mode === 'utf8') bytes = Buffer.from([0xff]);
          res
            .writeHead(200, {
              'Content-Type': 'application/json',
              'Content-Length': bytes.length,
            })
            .end(bytes);
          return;
        }
        if (req.url === prefix + 'manifest') {
          res
            .writeHead(200, { 'Content-Type': 'application/json' })
            .end(manifestBytes);
          return;
        }
        const asset = Object.values(manifest.assets).find(
          (a) => req.url === prefix + `assets/${a.sha256}.png`,
        );
        if (asset) {
          let bytes = Buffer.from(readFileSync(new URL(asset.path, fixture)));
          if (mode === 'assetcorrupt') bytes[bytes.length - 1] ^= 1;
          if (mode === 'assetoversize') bytes = Buffer.alloc(asset.bytes + 1);
          if (mode === 'dimensions') bytes.writeUInt32BE(512, 16);
          res
            .writeHead(200, {
              'Content-Type': 'image/png',
              'Content-Length': bytes.length,
            })
            .end(bytes);
          return;
        }
        res.writeHead(404).end();
      });
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
      });
      servers.push(server);
      env[
        mode === 'good'
          ? 'DOODLEFORGE_CONTENT_TEST_URL'
          : `DOODLEFORGE_CONTENT_TEST_${mode.toUpperCase()}`
      ] = `http://127.0.0.1:${server.address().port}`;
    }
    return {
      env,
      verify() {
        const good = requests.filter((r) => r.mode === 'good');
        if (good.filter((r) => r.url === '/api/content/index').length !== 1)
          throw new Error('Catalog was fetched more than once');
        if (good.some((r) => r.url.includes('/versions/2/')))
          throw new Error('Unpinned revision requested');
        if (requests.some((r) => !r.url.startsWith('/api/content/')))
          throw new Error('Package path used as HTTP URL');
      },
      close: () =>
        Promise.all(
          servers.map(
            (server) =>
              new Promise((resolve) => {
                server.closeAllConnections();
                server.close(resolve);
              }),
          ),
        ),
    };
  } catch (error) {
    for (const server of servers) server.close();
    throw error;
  }
}
