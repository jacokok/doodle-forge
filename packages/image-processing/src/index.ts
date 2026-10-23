import sharp from 'sharp';

// Transport/domain callers supply shared policy limits; no storage or HTTP here.
export async function prepareOriginal(
  bytes: Buffer,
  mediaType: string,
  policy: { maxPixels: number; previewEdge: number },
) {
  const png = bytes
    .subarray(0, 8)
    .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp =
    bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WEBP';
  const detected = png
    ? 'image/png'
    : jpeg
      ? 'image/jpeg'
      : webp
        ? 'image/webp'
        : undefined;
  if (!detected || detected !== mediaType)
    throw new Error('Image signature does not match media type');
  if (png) {
    let offset = 8;
    let ended = false;
    while (offset + 12 <= bytes.length) {
      const length = bytes.readUInt32BE(offset);
      const type = bytes.toString('ascii', offset + 4, offset + 8);
      if (type === 'acTL') throw new Error('Animated PNG is not supported');
      // Pixel limits do not bound decompressed ancillary metadata.
      if (type === 'zTXt' || type === 'iCCP')
        throw new Error('Compressed PNG metadata is not supported');
      if (type === 'iTXt') {
        const end = bytes.indexOf(0, offset + 8);
        if (end < 0 || end >= offset + 8 + length || bytes[end + 1] !== 0)
          throw new Error('Compressed or invalid PNG text');
      }
      offset += length + 12;
      if (offset > bytes.length) throw new Error('Truncated PNG');
      if (type === 'IEND') {
        ended = length === 0;
        break;
      }
    }
    if (!ended || offset !== bytes.length)
      throw new Error('Invalid PNG container');
  }
  if (webp && bytes.readUInt32LE(4) + 8 !== bytes.length)
    throw new Error('Invalid WebP container');
  if (jpeg) {
    // Sharp's JPEG reader can ignore concatenated images/MPO auxiliaries.
    // Walk markers (including stuffed entropy bytes) and require one exact EOI.
    let offset = 2;
    let ended = false;
    while (offset < bytes.length) {
      if (bytes[offset++] !== 255) continue;
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (
        marker === 0 ||
        marker === 1 ||
        (marker !== undefined && marker >= 208 && marker <= 215)
      )
        continue;
      if (marker === 217) {
        ended = offset === bytes.length;
        break;
      }
      if (marker === 216 || offset + 2 > bytes.length)
        throw new Error('Invalid JPEG container');
      const length = bytes.readUInt16BE(offset);
      if (length < 2 || offset + length > bytes.length)
        throw new Error('Truncated JPEG');
      if (
        marker === 226 &&
        bytes.toString('ascii', offset + 2, offset + 6) === 'MPF\u0000'
      )
        throw new Error('Multipicture JPEG is not supported');
      offset += length;
    }
    if (!ended) throw new Error('Truncated or multipicture JPEG');
  }
  const options = {
    limitInputPixels: policy.maxPixels,
    failOn: 'warning' as const,
  };
  const metadata = await sharp(bytes, options).metadata();
  if (
    !metadata.width ||
    !metadata.height ||
    metadata.width * metadata.height > policy.maxPixels ||
    (metadata.pages ?? 1) !== 1 ||
    metadata.pageHeight ||
    metadata.delay
  )
    throw new Error('Unsupported dimensions or multiple pages');
  // Decode all pixels with strict warning handling before deriving a smaller image.
  const decoded = await sharp(bytes, options)
    .rotate()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const preview = await sharp(decoded.data, { raw: decoded.info })
    .resize({
      width: policy.previewEdge,
      height: policy.previewEdge,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .png()
    .toBuffer({ resolveWithObject: true });
  return { width: metadata.width, height: metadata.height, preview };
}
