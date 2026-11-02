import sharp from 'sharp';
import { sha256, type CharacterManifest } from '@doodleforge/contracts';

type Asset = CharacterManifest['assets'][string];
type Animation = CharacterManifest['animations'][string];

/** Shared publication/review admission: verify exact bytes and fully decode a bounded RGBA PNG. */
export async function decodePngAsset(
  bytes: Buffer,
  asset: Pick<Asset, 'bytes' | 'sha256' | 'width' | 'height'>,
) {
  if (bytes.length !== asset.bytes || sha256(bytes) !== asset.sha256)
    throw new Error('Asset byte length/hash mismatch');
  const image = sharp(bytes, {
    limitInputPixels: 4096 * 4096,
    failOn: 'warning',
    animated: true,
  });
  const metadata = await image.metadata();
  if (
    metadata.format !== 'png' ||
    metadata.width !== asset.width ||
    metadata.height !== asset.height ||
    (metadata.pages ?? 1) !== 1 ||
    !metadata.hasAlpha ||
    metadata.channels !== 4
  )
    throw new Error('Invalid RGBA PNG dimensions/pages');
  const decoded = await image.raw().toBuffer({ resolveWithObject: true });
  if (
    decoded.info.width !== asset.width ||
    decoded.info.height !== asset.height ||
    decoded.info.channels !== 4
  )
    throw new Error('PNG decode mismatch');
  return decoded;
}

/** Generated review sheets additionally require visible, transparent, unclipped frames and empty padding. */
export async function validateReviewSheet(
  bytes: Buffer,
  asset: Asset,
  animation: Animation,
) {
  if (
    asset.width !== animation.columns * animation.frameWidth ||
    asset.height !==
      Math.ceil(animation.frameCount / animation.columns) *
        animation.frameHeight
  )
    throw new Error('Sheet layout mismatch');
  const { data } = await decodePngAsset(bytes, asset);
  const cells =
    animation.columns * Math.ceil(animation.frameCount / animation.columns);
  for (let cell = 0; cell < cells; cell++) {
    let visible = false;
    let transparent = false;
    for (let y = 0; y < animation.frameHeight; y++) {
      for (let x = 0; x < animation.frameWidth; x++) {
        const left = (cell % animation.columns) * animation.frameWidth;
        const top =
          Math.floor(cell / animation.columns) * animation.frameHeight;
        const alpha = data[((top + y) * asset.width + left + x) * 4 + 3]!;
        if (cell >= animation.frameCount) {
          if (alpha !== 0)
            throw new Error('Unused sheet cell is not transparent');
          continue;
        }
        visible ||= alpha > 0;
        transparent ||= alpha < 255;
        if (
          alpha > 0 &&
          (x === 0 ||
            y === 0 ||
            x === animation.frameWidth - 1 ||
            y === animation.frameHeight - 1)
        )
          throw new Error('Review frame may be clipped');
      }
    }
    if (cell < animation.frameCount && (!visible || !transparent))
      throw new Error('Review frame must contain visible art and transparency');
  }
}
