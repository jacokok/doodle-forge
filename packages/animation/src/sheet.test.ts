import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { expect, it } from 'vitest';
import { packSheet } from './index.js';

async function frame(red: number, alpha = 254, size = 256) {
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: red, g: 0, b: 0, alpha: alpha / 255 },
    },
  })
    .png()
    .toBuffer();
}

it('packs deterministic row-major pixels and leaves unused cells transparent', async () => {
  const frames = await Promise.all([frame(30), frame(90), frame(180)]);
  const sheet = await packSheet(frames, 2);
  expect(sheet).toMatchObject({
    width: 512,
    height: 512,
    frameWidth: 256,
    frameHeight: 256,
    frameCount: 3,
    columns: 2,
  });
  expect(sheet.bytes).toEqual((await packSheet(frames, 2)).bytes);
  expect(sheet.sha256).toBe(
    createHash('sha256').update(sheet.bytes).digest('hex'),
  );
  const data = await sharp(sheet.bytes).ensureAlpha().raw().toBuffer();
  const pixel = (x: number, y: number) => [
    ...data.subarray((y * 512 + x) * 4, (y * 512 + x) * 4 + 4),
  ];
  expect(pixel(0, 0)).toEqual([30, 0, 0, 254]);
  expect(pixel(256, 0)).toEqual([90, 0, 0, 254]);
  expect(pixel(0, 256)).toEqual([180, 0, 0, 254]);
  expect(pixel(256, 256)).toEqual([0, 0, 0, 0]);
});

it('rejects invalid layout, empty, malformed and oversized frames', async () => {
  const valid = await frame(1);
  await expect(packSheet([], 1)).rejects.toThrow();
  await expect(packSheet(Array(65).fill(valid), 16)).rejects.toThrow();
  await expect(packSheet([valid], 0)).rejects.toThrow();
  await expect(packSheet([valid], 1.5)).rejects.toThrow();
  await expect(packSheet(Array(17).fill(valid), 1)).rejects.toThrow();
  await expect(packSheet([await frame(1, 0)], 1)).rejects.toThrow('visible');
  await expect(packSheet([await frame(1, 255)], 1)).rejects.toThrow(
    'transparency',
  );
  await expect(packSheet([await frame(1, 255, 16)], 1)).rejects.toThrow(
    '256x256',
  );
  await expect(packSheet([Buffer.from('bad')], 1)).rejects.toThrow();
  await expect(
    packSheet([Buffer.alloc(2 * 1024 * 1024 + 1)], 1),
  ).rejects.toThrow('size');
});
