import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { expect, it } from 'vitest';
import { sha256 } from '@doodleforge/contracts';
import { validateAssetBuffer } from './index.js';

const descriptor = (bytes: Buffer, width = 2, height = 2) => ({
  bytes: bytes.length,
  sha256: sha256(bytes),
  width,
  height,
});

it('accepts a fully decoded RGBA PNG and rejects length, hash and dimension mismatches', async () => {
  const bytes = await sharp({
    create: { width: 2, height: 2, channels: 4, background: '#ff000080' },
  })
    .png()
    .toBuffer();
  const asset = descriptor(bytes);
  await expect(validateAssetBuffer(bytes, asset)).resolves.toBeUndefined();
  await expect(
    validateAssetBuffer(bytes, { ...asset, bytes: bytes.length + 1 }),
  ).rejects.toThrow('Asset byte length/hash mismatch');
  await expect(
    validateAssetBuffer(bytes, { ...asset, sha256: '0'.repeat(64) }),
  ).rejects.toThrow('Asset byte length/hash mismatch');
  await expect(
    validateAssetBuffer(bytes, { ...asset, width: 3 }),
  ).rejects.toThrow('Invalid RGBA PNG dimensions/pages');
});

it('rejects non-RGBA and non-PNG images and truncated PNG data even with matching hashes', async () => {
  const rgb = await sharp({
    create: { width: 2, height: 2, channels: 3, background: '#ff0000' },
  })
    .png()
    .toBuffer();
  await expect(validateAssetBuffer(rgb, descriptor(rgb))).rejects.toThrow(
    'Invalid RGBA PNG dimensions/pages',
  );
  const jpeg = await sharp(rgb).jpeg().toBuffer();
  await expect(validateAssetBuffer(jpeg, descriptor(jpeg))).rejects.toThrow(
    'Invalid RGBA PNG dimensions/pages',
  );
  const fixture = readFileSync(
    fileURLToPath(
      new URL(
        '../../contracts/fixtures/sprout/v1/character.json',
        import.meta.url,
      ),
    ),
  );
  const manifest = JSON.parse(fixture.toString());
  const asset = Object.values(manifest.assets)[0] as {
    path: string;
    width: number;
    height: number;
  };
  const png = readFileSync(
    fileURLToPath(
      new URL(
        `../../contracts/fixtures/sprout/v1/${asset.path}`,
        import.meta.url,
      ),
    ),
  );
  const truncated = png.subarray(0, Math.floor(png.length / 2));
  await expect(
    validateAssetBuffer(
      truncated,
      descriptor(truncated, asset.width, asset.height),
    ),
  ).rejects.toThrow();
});
