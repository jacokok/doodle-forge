import { expect, it } from 'vitest';
import sharp from 'sharp';
import { normalizeFrame } from './index.js';

async function image(rect: {
  x: number;
  y: number;
  width: number;
  height: number;
  alpha?: number;
}) {
  const pixels = Buffer.alloc(256 * 256 * 4);
  for (let y = rect.y; y < rect.y + rect.height; y++)
    for (let x = rect.x; x < rect.x + rect.width; x++) {
      const offset = (y * 256 + x) * 4;
      pixels[offset] = 200;
      pixels[offset + 3] = rect.alpha ?? 255;
    }
  return sharp(pixels, { raw: { width: 256, height: 256, channels: 4 } })
    .png()
    .toBuffer();
}

it('deterministically aligns all visible pixels to the target foot anchor without enlarging', async () => {
  const input = await image({ x: 30, y: 40, width: 40, height: 80 });
  const a = await normalizeFrame(input, 'pixel');
  const b = await normalizeFrame(input, 'pixel');
  expect(a.bytes).toEqual(b.bytes);
  expect(a.sourceBounds).toEqual({ x: 30, y: 40, width: 40, height: 80 });
  expect(a.placedBounds).toEqual({ x: 108, y: 144, width: 40, height: 80 });
  expect(a.footAnchor).toEqual({ x: 128, y: 224 });
  const decoded = await sharp(a.bytes)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  expect(decoded.info).toMatchObject({ width: 256, height: 256, channels: 4 });
  expect(decoded.data[(223 * 256 + 108) * 4 + 3]).toBe(255);
  expect(decoded.data[(224 * 256 + 108) * 4 + 3]).toBe(0);
});

it('scales oversized content into the available area and retains faint nonzero alpha', async () => {
  const input = await image({ x: 5, y: 5, width: 240, height: 240, alpha: 1 });
  const result = await normalizeFrame(input, 'pixel');
  expect(result.placedBounds).toEqual({
    x: 24,
    y: 16,
    width: 208,
    height: 208,
  });
  const decoded = await sharp(result.bytes).ensureAlpha().raw().toBuffer();
  expect(decoded[(16 * 256 + 24) * 4 + 3]).toBe(1);
});

it('rejects empty, edge-clipped, invalid and incorrectly sized frames', async () => {
  await expect(
    normalizeFrame(
      await image({ x: 2, y: 2, width: 1, height: 1, alpha: 0 }),
      'pixel',
    ),
  ).rejects.toThrow('no visible pixels');
  await expect(
    normalizeFrame(await image({ x: 0, y: 1, width: 4, height: 4 }), 'pixel'),
  ).rejects.toThrow('clipped');
  await expect(
    normalizeFrame(Buffer.from('not png'), 'pixel'),
  ).rejects.toThrow();
  const small = await sharp({
    create: { width: 16, height: 16, channels: 4, background: '#ff0000ff' },
  })
    .png()
    .toBuffer();
  await expect(normalizeFrame(small, 'pixel')).rejects.toThrow('256x256');
});
