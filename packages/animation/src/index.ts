import { createHash } from 'node:crypto';
import { prepareOriginal } from '@doodleforge/image-processing';
import sharp from 'sharp';

/** Pack ordered normalized frames into a v1 row-major PNG sheet. */
export async function packSheet(frames: readonly Buffer[], columns: number) {
  if (!Array.isArray(frames) || frames.length < 1 || frames.length > 64)
    throw new Error('Expected 1–64 frames');
  if (!Number.isInteger(columns) || columns < 1 || columns > 16)
    throw new Error('Expected 1–16 columns');
  const rows = Math.ceil(frames.length / columns);
  if (rows > 16) throw new Error('Sheet exceeds maximum dimensions');
  const width = columns * 256;
  const height = rows * 256;
  const pixels = Buffer.alloc(width * height * 4);
  for (const [index, frame] of frames.entries()) {
    if (
      !Buffer.isBuffer(frame) ||
      !frame.length ||
      frame.length > 2 * 1024 * 1024
    )
      throw new Error('Invalid frame size');
    const source = await prepareOriginal(frame, 'image/png', {
      maxPixels: 256 * 256,
      previewEdge: 256,
    });
    if (source.width !== 256 || source.height !== 256)
      throw new Error('Frame must be 256x256');
    const { data, info } = await sharp(frame, {
      failOn: 'warning',
      limitInputPixels: 256 * 256,
    })
      .toColourspace('srgb')
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let visible = false;
    let transparent = false;
    const left = (index % columns) * 256;
    const top = Math.floor(index / columns) * 256;
    for (let y = 0; y < 256; y++) {
      const sourceOffset = y * 256 * info.channels;
      const targetOffset = ((top + y) * width + left) * 4;
      data.copy(pixels, targetOffset, sourceOffset, sourceOffset + 256 * 4);
      for (let x = 0; x < 256; x++) {
        const alpha = data[sourceOffset + x * 4 + 3];
        if (alpha !== 0) visible = true;
        if (alpha !== 255) transparent = true;
      }
    }
    if (!visible) throw new Error('Frame has no visible pixels');
    if (!transparent) throw new Error('Frame has no transparency');
  }
  const bytes = await sharp(pixels, { raw: { width, height, channels: 4 } })
    .png({ compressionLevel: 9, adaptiveFiltering: false, palette: false })
    .toBuffer();
  return {
    bytes,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    width,
    height,
    frameWidth: 256 as const,
    frameHeight: 256 as const,
    frameCount: frames.length,
    columns,
  };
}
