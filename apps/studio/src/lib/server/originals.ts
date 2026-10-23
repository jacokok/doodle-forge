import { randomUUID, createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { AssetRepository, type NewAsset } from '@doodleforge/database';
import {
  assetIdSchema,
  attachOriginalSchema,
  originalUploadPolicy,
  privateImageKindSchema,
} from '@doodleforge/contracts/authoring';
import { prepareOriginal } from '@doodleforge/image-processing';
import { CharacterError, CharacterService } from './characters.js';

const hash = (bytes: Buffer) =>
  createHash('sha256').update(bytes).digest('hex');
export class OriginalService {
  constructor(
    private readonly characters: CharacterService,
    private readonly assets: AssetRepository,
    private readonly root: string,
  ) {}

  private async directory() {
    const root = resolve(this.root);
    if (!(await lstat(root)).isDirectory() || (await realpath(root)) !== root)
      throw new Error('Unsafe private storage');
    return root;
  }

  private assertRevision(id: unknown, revision: number) {
    const character = this.characters.get(id);
    if (character.editRevision !== revision)
      throw new CharacterError(
        409,
        'stale_revision',
        'Character changed; reload before attaching art.',
      );
    return character;
  }

  async attach(id: unknown, input: unknown, bytes: Buffer, mediaType: string) {
    const parsed = attachOriginalSchema.safeParse(input);
    if (!parsed.success)
      throw new CharacterError(
        400,
        'invalid_input',
        'Invalid expected revision.',
      );
    const character = this.assertRevision(id, parsed.data.expectedRevision);
    if (bytes.length > originalUploadPolicy.maxBytes)
      throw new CharacterError(413, 'body_too_large', 'Image exceeds 10 MiB.');
    if (
      !(originalUploadPolicy.mediaTypes as readonly string[]).includes(
        mediaType,
      )
    )
      throw new CharacterError(
        415,
        'unsupported_media_type',
        'Use JPEG, PNG or WebP.',
      );
    let prepared: Awaited<ReturnType<typeof prepareOriginal>>;
    try {
      prepared = await prepareOriginal(bytes, mediaType, originalUploadPolicy);
    } catch {
      throw new CharacterError(
        422,
        'invalid_image',
        'Image is unsafe, malformed, animated, truncated, too large when decoded, or does not match its media type. Use a still JPEG, PNG or WebP up to 20 megapixels.',
      );
    }
    const originalId = randomUUID();
    const previewId = randomUUID();
    const original: NewAsset = {
      id: originalId,
      characterId: character.id,
      kind: 'original',
      storageKey: `${originalId}.original`,
      mediaType,
      sha256: hash(bytes),
      bytes: bytes.length,
      width: prepared.width,
      height: prepared.height,
      createdAt: Date.now(),
    };
    const preview: NewAsset = {
      id: previewId,
      characterId: character.id,
      kind: 'preview',
      sourceAssetId: originalId,
      storageKey: `${previewId}.png`,
      mediaType: 'image/png',
      sha256: hash(prepared.preview.data),
      bytes: prepared.preview.data.length,
      width: prepared.preview.info.width,
      height: prepared.preview.info.height,
      createdAt: Date.now(),
    };
    const directory = await this.directory();
    for (const [asset, data] of [
      [original, bytes],
      [preview, prepared.preview.data],
    ] as const) {
      const file = await open(
        join(directory, asset.storageKey),
        constants.O_WRONLY |
          constants.O_CREAT |
          constants.O_EXCL |
          constants.O_NOFOLLOW,
        0o600,
      );
      try {
        await file.writeFile(data);
        await file.chmod(0o400);
        await file.sync();
      } finally {
        await file.close();
      }
    }
    const directoryHandle = await open(
      directory,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
    );
    try {
      await directoryHandle.sync();
    } finally {
      await directoryHandle.close();
    }
    // Files precede DB adoption. Crashes/conflicts may leave private, unreferenced
    // files; no request ever serves these and no automatic destructive GC runs.
    const attached = this.assets.attach(
      character.id,
      parsed.data.expectedRevision,
      original,
      preview,
    );
    if (!attached) {
      this.assertRevision(character.id, parsed.data.expectedRevision);
      throw new Error('Attachment unavailable');
    }
    return attached;
  }

  async image(characterId: unknown, assetId: unknown, kind: unknown) {
    const character = this.characters.get(characterId);
    const parsedId = assetIdSchema.safeParse(assetId);
    const parsedKind = privateImageKindSchema.safeParse(kind);
    if (!parsedId.success || !parsedKind.success)
      throw new CharacterError(
        400,
        'invalid_input',
        'Invalid private image reference.',
      );
    const original = this.assets.get(parsedId.data);
    if (
      !original ||
      original.characterId !== character.id ||
      original.kind !== 'original'
    )
      throw new CharacterError(404, 'not_found', 'Image not found.');
    const asset =
      parsedKind.data === 'original'
        ? original
        : this.assets.preview(original.id);
    if (!asset) throw new CharacterError(404, 'not_found', 'Image not found.');
    // Even corrupt DB keys cannot supply paths or serve another file.
    const key = `${asset.id}${asset.kind === 'original' ? '.original' : '.png'}`;
    if (
      !assetIdSchema.safeParse(asset.id).success ||
      asset.storageKey !== key ||
      asset.bytes > originalUploadPolicy.maxBytes ||
      asset.bytes < 1
    )
      throw new Error('Invalid stored image');
    const file = await open(
      join(await this.directory(), key),
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.size !== asset.bytes)
        throw new Error('Invalid stored image');
      const bytes = Buffer.alloc(asset.bytes + 1);
      let length = 0;
      while (length < bytes.length) {
        const read = await file.read(
          bytes,
          length,
          bytes.length - length,
          null,
        );
        if (!read.bytesRead) break;
        length += read.bytesRead;
      }
      const data = bytes.subarray(0, length);
      if (length !== asset.bytes || hash(data) !== asset.sha256)
        throw new Error('Corrupt stored image');
      return { bytes: data, mediaType: asset.mediaType };
    } finally {
      await file.close();
    }
  }
}
