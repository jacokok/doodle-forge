import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  readFileSync,
  chmodSync,
  writeFileSync,
  unlinkSync,
  symlinkSync,
  readdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import {
  AssetRepository,
  CharacterRepository,
  migrateDatabase,
  openDatabase,
} from '@doodleforge/database';
import { originalUploadPolicy as policy } from '@doodleforge/contracts/authoring';
import { OriginalService } from './originals.js';
import { CharacterService } from './characters.js';
import { POST } from '../../routes/api/characters/[id]/originals/+server.js';
import { GET } from '../../routes/api/characters/[id]/originals/[assetId]/[kind]/+server.js';
import { readOriginalUpload } from './original-transport.js';

vi.mock('./runtime.js', () => ({ originalService: () => service }));
let root: string;
let db: ReturnType<typeof openDatabase>;
let service: OriginalService;
let characters: CharacterService;
let id: string;
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const png = () =>
  sharp({
    create: { width: 24, height: 16, channels: 4, background: '#ff0000' },
  })
    .png()
    .toBuffer();
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'doodle-original-'));
  mkdirSync(join(root, 'originals'));
  migrateDatabase(join(root, 'test.sqlite'));
  db = openDatabase(join(root, 'test.sqlite'));
  characters = new CharacterService(new CharacterRepository(db));
  id = characters.create({
    name: 'Art',
    description: '',
    bodyType: 'humanoid',
  }).id;
  service = new OriginalService(
    characters,
    new AssetRepository(db),
    join(root, 'originals'),
  );
});
afterEach(() => {
  db.close();
  rmSync(root, { recursive: true, force: true });
});
function request(bytes: Buffer, type = 'image/png', revision = 1) {
  const form = new FormData();
  form.set(
    'image',
    new Blob([new Uint8Array(bytes)], { type }),
    '../../child-art.secret',
  );
  form.set('expectedRevision', String(revision));
  return new Request(`http://localhost/api/characters/${id}/originals`, {
    method: 'POST',
    headers: { origin: 'http://localhost' },
    body: form,
  });
}
const post = (req: Request) =>
  POST({ request: req, params: { id } } as Parameters<typeof POST>[0]);
const get = (assetId: string, kind = 'preview', characterId = id) =>
  GET({ params: { id: characterId, assetId, kind } } as Parameters<
    typeof GET
  >[0]);

it.each(['png', 'jpeg', 'webp'] as const)(
  'persists immutable exact %s bytes/hash, private previews and restart references',
  async (format) => {
    const bytes = await sharp(await png())
      .toFormat(format)
      .toBuffer();
    const response = await post(request(bytes, `image/${format}`));
    expect(response.status).toBe(201);
    const character = await response.json();
    expect(character.editRevision).toBe(2);
    const assets = new AssetRepository(db);
    const asset = assets.get(character.originalAssetId)!;
    expect(asset.sha256).toBe(sha(bytes));
    expect(asset.bytes).toBe(bytes.length);
    expect(readFileSync(join(root, 'originals', asset.storageKey))).toEqual(
      bytes,
    );
    expect(
      readdirSync(join(root, 'originals')).every(
        (key) => !key.includes('child'),
      ),
    ).toBe(true);
    expect(
      Buffer.from(await (await get(asset.id, 'original')).arrayBuffer()),
    ).toEqual(bytes);
    const preview = await get(asset.id);
    expect(preview.headers.get('cache-control')).toBe('private, no-store');
    expect(preview.headers.get('cross-origin-resource-policy')).toBe(
      'same-origin',
    );
    expect(preview.headers.get('x-content-type-options')).toBe('nosniff');
    expect(
      await sharp(Buffer.from(await preview.arrayBuffer())).metadata(),
    ).toMatchObject({ width: 24, height: 16, format: 'png' });
    expect(() =>
      db.sqlite
        .prepare('UPDATE assets SET bytes = 1 WHERE id = ?')
        .run(asset.id),
    ).toThrow('immutable');
    expect(() =>
      db.sqlite.prepare('DELETE FROM assets WHERE id = ?').run(asset.id),
    ).toThrow('immutable');
    const restarted = openDatabase(join(root, 'test.sqlite'));
    try {
      expect(new CharacterRepository(restarted).get(id)?.originalAssetId).toBe(
        asset.id,
      );
    } finally {
      restarted.close();
    }
    expect(db.sqlite.pragma('foreign_key_check')).toEqual([]);
  },
);

it('orients EXIF, bounds preview dimensions, strips metadata and preserves the original', async () => {
  const bytes = await sharp({
    create: { width: 1600, height: 800, channels: 3, background: 'blue' },
  })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer();
  const character = await service.attach(
    id,
    { expectedRevision: 1 },
    bytes,
    'image/jpeg',
  );
  const image = await service.image(id, character.originalAssetId, 'preview');
  const metadata = await sharp(image.bytes).metadata();
  expect(metadata).toMatchObject({ width: 512, height: 1024 });
  for (const field of ['exif', 'icc', 'xmp', 'iptc', 'orientation'] as const)
    expect(metadata[field]).toBeUndefined();
  expect(
    (await service.image(id, character.originalAssetId, 'original')).bytes,
  ).toEqual(bytes);
});

it('rejects MIME spoofing, SVG, malformed/truncated images, APNG and animated WebP without adopting assets', async () => {
  const image = await png();
  const jpeg = await sharp(image).jpeg().toBuffer();
  const webp = await sharp(image).webp().toBuffer();
  const compressedMetadata = await sharp(image).withMetadata().png().toBuffer();
  // APNG control chunk insertion is enough for the explicit animation refusal.
  const apng = Buffer.concat([
    image.subarray(0, 33),
    Buffer.from([0, 0, 0, 0, 97, 99, 84, 76, 0, 0, 0, 0]),
    image.subarray(33),
  ]);
  const frames = Buffer.alloc(2 * 4 * 4, 255);
  frames.fill(0, 2 * 2 * 4);
  const animated = await sharp(frames, {
    raw: { width: 2, height: 4, channels: 4, pageHeight: 2 },
  })
    .webp({ loop: 0, delay: [100, 100] })
    .toBuffer();
  expect((await sharp(animated, { animated: true }).metadata()).pages).toBe(2);
  for (const [bytes, type, status] of [
    [image, 'image/jpeg', 422],
    [Buffer.from('<svg/>'), 'image/svg+xml', 415],
    [Buffer.from('not PNG'), 'image/png', 422],
    [image.subarray(0, -8), 'image/png', 422],
    [apng, 'image/png', 422],
    [animated, 'image/webp', 422],
    [jpeg.subarray(0, -2), 'image/jpeg', 422],
    [Buffer.concat([jpeg, jpeg]), 'image/jpeg', 422],
    [
      Buffer.concat([
        jpeg.subarray(0, 2),
        Buffer.from([255, 226, 0, 6, 77, 80, 70, 0]),
        jpeg.subarray(2),
      ]),
      'image/jpeg',
      422,
    ],
    [webp.subarray(0, -2), 'image/webp', 422],
    [compressedMetadata, 'image/png', 422],
  ] as const) {
    expect((await post(request(bytes, type))).status).toBe(status);
  }
  expect(db.sqlite.prepare('SELECT count(*) AS n FROM assets').get()).toEqual({
    n: 0,
  });
  expect(readdirSync(join(root, 'originals'))).toEqual([]);
});

it('rejects a header-valid but undecodable image and decoded pixel overflow', async () => {
  const bytes = await png();
  const corrupt = Buffer.from(bytes);
  const offset = corrupt.indexOf(Buffer.from('IDAT'));
  corrupt.fill(0, offset + 4, offset + 10);
  expect((await post(request(corrupt))).status).toBe(422);
  const oversized = await sharp({
    create: { width: 5000, height: 4001, channels: 3, background: 'white' },
  })
    .png()
    .toBuffer();
  expect(oversized.length).toBeLessThan(policy.maxBytes);
  expect((await post(request(oversized))).status).toBe(422);
});

it('bounds streamed bodies before multipart parsing without trusting Content-Length and cancels', async () => {
  let cancelled = false;
  let pulls = 0;
  const stream = new ReadableStream({
    pull(controller) {
      pulls++;
      controller.enqueue(new Uint8Array(1024 * 1024));
    },
    cancel() {
      cancelled = true;
    },
  });
  const req = new Request(`http://localhost/api/characters/${id}/originals`, {
    method: 'POST',
    headers: {
      origin: 'http://localhost',
      'content-type': 'multipart/form-data; boundary=test',
      'content-length': '1',
    },
    body: stream,
    duplex: 'half',
  } as RequestInit);
  expect((await post(req)).status).toBe(413);
  expect(cancelled).toBe(true);
  expect(pulls).toBeLessThanOrEqual(12);
  expect((await post(request(Buffer.alloc(policy.maxBytes + 1)))).status).toBe(
    413,
  );
  expect(readdirSync(join(root, 'originals'))).toEqual([]);
});

it('validates origin, multipart fields, revision and one-file policy', async () => {
  const req = request(await png());
  req.headers.delete('origin');
  expect((await post(req)).status).toBe(403);
  for (const revision of [0, -1, 1.5, Number.MAX_SAFE_INTEGER])
    expect(
      (await post(request(await png(), 'image/png', revision))).status,
    ).toBe(400);
  const multiple = await request(await png()).formData();
  multiple.append(
    'image',
    new Blob([new Uint8Array(await png())], { type: 'image/png' }),
  );
  const duplicate = new Request(
    `http://localhost/api/characters/${id}/originals`,
    { method: 'POST', headers: { origin: 'http://localhost' }, body: multiple },
  );
  await expect(readOriginalUpload(duplicate)).rejects.toMatchObject({
    status: 400,
  });
});

it('CAS attachment/replacement retains old bytes, rejects stale metadata/archive and concurrent attachment', async () => {
  const bytes = await png();
  const other = openDatabase(join(root, 'test.sqlite'));
  try {
    const rival = new OriginalService(
      new CharacterService(new CharacterRepository(other)),
      new AssetRepository(other),
      join(root, 'originals'),
    );
    const results = await Promise.allSettled([
      service.attach(id, { expectedRevision: 1 }, bytes, 'image/png'),
      rival.attach(id, { expectedRevision: 1 }, bytes, 'image/png'),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((r) => r.status === 'rejected')).toMatchObject({
      reason: { status: 409, code: 'stale_revision' },
    });
    const first = characters.get(id).originalAssetId!;
    expect(() =>
      characters.update(id, { expectedRevision: 1, name: 'Stale' }),
    ).toThrow('changed');
    expect(() => characters.archive(id, { expectedRevision: 1 })).toThrow(
      'changed',
    );
    const replacement = await service.attach(
      id,
      { expectedRevision: 2 },
      bytes,
      'image/png',
    );
    expect(replacement.originalAssetId).not.toBe(first);
    expect((await service.image(id, first, 'original')).bytes).toEqual(bytes);
    expect(db.sqlite.prepare('SELECT count(*) AS n FROM assets').get()).toEqual(
      { n: 4 },
    );
    characters.archive(id, { expectedRevision: 3 });
    expect((await get(first)).status).toBe(404);
    await expect(
      service.attach(id, { expectedRevision: 3 }, bytes, 'image/png'),
    ).rejects.toMatchObject({ status: 404 });
  } finally {
    other.close();
  }
});

it('rejects attachment if metadata/archive changes during decode', async () => {
  const pending = service.attach(
    id,
    { expectedRevision: 1 },
    await png(),
    'image/png',
  );
  characters.update(id, { expectedRevision: 1, name: 'Winner' });
  await expect(pending).rejects.toMatchObject({ status: 409 });
  expect(characters.get(id).originalAssetId).toBeNull();
  expect(db.sqlite.prepare('SELECT count(*) AS n FROM assets').get()).toEqual({
    n: 0,
  });
  const archived = service.attach(
    id,
    { expectedRevision: 2 },
    await png(),
    'image/png',
  );
  characters.archive(id, { expectedRevision: 2 });
  await expect(archived).rejects.toMatchObject({ status: 404 });
});

it('confines private delivery to IDs, ownership, regular nonsymlink exact hashed files', async () => {
  const attached = await service.attach(
    id,
    { expectedRevision: 1 },
    await png(),
    'image/png',
  );
  const assetId = attached.originalAssetId!;
  const stranger = characters.create({
    name: 'Other',
    description: '',
    bodyType: 'other',
  });
  expect((await get(assetId, 'preview', stranger.id)).status).toBe(404);
  expect((await get(randomUUID())).status).toBe(404);
  expect((await get('../../secret')).status).toBe(400);
  expect((await get(assetId, '../../secret')).status).toBe(400);
  const asset = new AssetRepository(db).preview(assetId)!;
  const target = join(root, 'originals', asset.storageKey);
  chmodSync(target, 0o600);
  writeFileSync(target, Buffer.alloc(asset.bytes));
  const corrupt = await get(assetId);
  expect(corrupt.status).toBe(503);
  expect(await corrupt.text()).not.toContain(root);
  unlinkSync(target);
  const outside = join(root, 'outside.png');
  writeFileSync(outside, await png());
  symlinkSync(outside, target);
  expect((await get(assetId)).status).toBe(503);
  unlinkSync(target);
  mkdirSync(target);
  expect((await get(assetId)).status).toBe(503);
});

it('rejects private root symlinks and arbitrary keys even after external DB corruption', async () => {
  const attached = await service.attach(
    id,
    { expectedRevision: 1 },
    await png(),
    'image/png',
  );
  const alias = join(root, 'alias');
  symlinkSync(join(root, 'originals'), alias);
  const unsafe = new OriginalService(
    characters,
    new AssetRepository(db),
    alias,
  );
  await expect(
    unsafe.image(id, attached.originalAssetId, 'original'),
  ).rejects.toThrow('Unsafe private storage');
  db.sqlite.exec('DROP TRIGGER assets_no_update');
  db.sqlite
    .prepare('UPDATE assets SET storage_key = ? WHERE id = ?')
    .run('../outside', attached.originalAssetId);
  expect((await get(attached.originalAssetId!, 'original')).status).toBe(503);
});
