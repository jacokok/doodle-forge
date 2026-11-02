import { expect, it } from 'vitest';
import sharp from 'sharp';
import { sha256 } from '@doodleforge/contracts';
import { decodePngAsset, validateReviewSheet } from './validation.js';

const animation = {
  assetId: 'sheet',
  frameWidth: 256 as const,
  frameHeight: 256 as const,
  columns: 2,
  frameCount: 1,
  fps: 8,
  loop: true,
  footAnchor: { x: 128 as const, y: 224 as const },
};
async function fixture(
  kind: 'valid' | 'empty' | 'padding' | 'clipped' | 'opaque',
) {
  const pixels = Buffer.alloc(512 * 256 * 4);
  const mark = (x: number, y: number) => {
    const offset = (y * 512 + x) * 4;
    pixels[offset] = 100;
    pixels[offset + 3] = 255;
  };
  if (kind !== 'empty') mark(128, 223);
  if (kind === 'padding') mark(384, 128);
  if (kind === 'clipped') mark(0, 128);
  if (kind === 'opaque')
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) mark(x, y);
  const bytes = await sharp(pixels, {
    raw: { width: 512, height: 256, channels: 4 },
  })
    .png()
    .toBuffer();
  return {
    bytes,
    asset: {
      path: `assets/${sha256(bytes)}.png`,
      mediaType: 'image/png' as const,
      sha256: sha256(bytes),
      bytes: bytes.length,
      width: 512,
      height: 256,
    },
  };
}
it('fully decodes exact sheet bytes and accepts visible transparent art and empty padding', async () => {
  const { bytes, asset } = await fixture('valid');
  expect((await decodePngAsset(bytes, asset)).info).toMatchObject({
    width: 512,
    height: 256,
    channels: 4,
  });
  await expect(
    validateReviewSheet(bytes, asset, animation),
  ).resolves.toBeUndefined();
  await expect(
    decodePngAsset(bytes, { ...asset, sha256: '0'.repeat(64) }),
  ).rejects.toThrow('hash mismatch');
  await expect(decodePngAsset(bytes, { ...asset, width: 256 })).rejects.toThrow(
    'dimensions',
  );
  await expect(
    validateReviewSheet(bytes, asset, { ...animation, columns: 1 }),
  ).rejects.toThrow('layout');
});
it.each([
  ['empty', 'visible art'],
  ['padding', 'Unused sheet cell'],
  ['clipped', 'clipped'],
  ['opaque', 'clipped'],
] as const)('rejects %s sheets before review freeze', async (kind, message) => {
  const { bytes, asset } = await fixture(kind);
  await expect(validateReviewSheet(bytes, asset, animation)).rejects.toThrow(
    message,
  );
});
it('rejects truncated PNG payloads even with matching declared bytes/hash', async () => {
  const source = await fixture('valid');
  const bytes = source.bytes.subarray(0, 45);
  await expect(
    decodePngAsset(bytes, {
      ...source.asset,
      sha256: sha256(bytes),
      bytes: bytes.length,
    }),
  ).rejects.toThrow();
});
