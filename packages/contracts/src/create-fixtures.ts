import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import { canonicalJson, sha256, type CharacterManifest } from './index.js';

const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(bytes: Buffer): number {
  let c = 0xffffffff;
  for (const b of bytes) c = crcTable[(c ^ b) & 255]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const name = Buffer.from(type);
  const size = Buffer.alloc(4);
  size.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([size, name, data, crc]);
}
function png(width: number, height: number, seed: number): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 4 + 1);
    rows[row] = 0;
    for (let x = 0; x < width; x++) {
      const on = ((x >> 4) + (y >> 4) + seed) % 3 !== 0;
      const p = row + 1 + x * 4;
      rows[p] = (seed * 53 + x) % 256;
      rows[p + 1] = (seed * 91 + y) % 256;
      rows[p + 2] = (seed * 37 + 100) % 256;
      rows[p + 3] = on ? 255 : 0;
    }
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
const animations = ['idle', 'walk', 'attack_light', 'hurt', 'knockout'];
for (const [name, seed] of [
  ['sprout', 1],
  ['comet', 2],
] as const) {
  const id =
    seed === 1
      ? '11111111-1111-4111-8111-111111111111'
      : '22222222-2222-4222-8222-222222222222';
  const dir = path.join(
    import.meta.dirname,
    '..',
    'fixtures',
    name,
    'v1',
    'assets',
  );
  await mkdir(dir, { recursive: true });
  const assets: CharacterManifest['assets'] = {};
  const anims: CharacterManifest['animations'] = {};
  for (let i = 0; i < animations.length; i++) {
    const key = animations[i]!;
    const assetId = `${key}_sheet`;
    const bytes = png(256, 256, seed + i);
    const digest = sha256(bytes);
    await writeFile(path.join(dir, `${digest}.png`), bytes);
    assets[assetId] = {
      path: `assets/${digest}.png`,
      mediaType: 'image/png',
      sha256: digest,
      bytes: bytes.length,
      width: 256,
      height: 256,
    };
    anims[key] = {
      assetId,
      frameWidth: 256,
      frameHeight: 256,
      columns: 1,
      frameCount: 1,
      fps: key === 'idle' ? 8 : 10,
      loop: key === 'idle' || key === 'walk',
      footAnchor: { x: 128, y: 224 },
    };
  }
  const manifest = {
    schemaVersion: 1,
    characterId: id,
    characterVersion: 1,
    name: name === 'sprout' ? 'Sprout' : 'Comet',
    description: `Synthetic fixture character ${name}.`,
    bodyType: 'humanoid',
    artStyle: 'cartoon',
    stats: { health: 100, moveSpeed: 180 },
    facing: 'right',
    anchors: {
      feet: { x: 128, y: 224 },
      center: { x: 128, y: 128 },
      hand: { x: 192, y: 128 },
      effect: { x: 128, y: 96 },
    },
    animations: anims,
    attacks: [
      {
        id: 'light',
        kind: 'melee',
        animation: 'attack_light',
        damage: 10,
        cooldownSeconds: 0.5,
        startupSeconds: 0.1,
        activeSeconds: 0.15,
        recoverySeconds: 0.2,
        knockback: { xSpeed: 180, depthSpeed: 30, durationSeconds: 0.2 },
        hitboxIds: ['light_hit'],
      },
    ],
    hitboxes: [
      {
        id: 'light_hit',
        rect: { x: 0, y: -180, width: 80, height: 80 },
        minElevation: 0,
        maxElevation: 40,
      },
    ],
    hurtboxes: [
      {
        id: 'body',
        rect: { x: -40, y: -160, width: 80, height: 160 },
        minElevation: 0,
        maxElevation: 40,
      },
    ],
    abilities: [
      {
        id: 'basic_melee',
        kind: 'melee',
        attackId: 'light',
        effectIds: [],
        parameters: {},
      },
    ],
    effects: [],
    assets,
  };
  await writeFile(
    path.join(dir, '..', 'character.json'),
    `${canonicalJson(manifest)}\n`,
  );
}
