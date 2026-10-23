import { realpath } from 'node:fs/promises';
import path from 'node:path';
import {
  characterManifestSchema,
  releaseIndexSchema,
  sha256,
  pngDimensions,
} from '@doodleforge/contracts';
import { ReleaseRepository } from '@doodleforge/database';
import { readBoundedFile, validateManifest } from './review.js';

export class ContentError extends Error {
  constructor(
    public readonly status: 400 | 404 | 503,
    public readonly code: string,
  ) {
    super(code);
  }
}
export type ContentFile = {
  bytes: Buffer;
  hash: string;
  mediaType: 'application/json' | 'image/png';
  immutable: boolean;
};
const missing = () => new ContentError(404, 'content_not_found');
const invalid = () => new ContentError(400, 'invalid_content_parameters');

export class PublishedContentService {
  constructor(
    private readonly releases: ReleaseRepository,
    private readonly root: string,
  ) {}

  private async read(key: string, limit: number, hash: string) {
    const root = await realpath(this.root);
    const filename = await realpath(path.resolve(root, key));
    if (!filename.startsWith(root + path.sep))
      throw new Error('Package escape');
    const bytes = await readBoundedFile(filename, limit);
    if (sha256(bytes) !== hash) throw new Error('Content hash mismatch');
    return bytes;
  }

  private async verified<T>(read: () => Promise<T>) {
    try {
      return await read();
    } catch (error) {
      if (error instanceof ContentError) throw error;
      throw new ContentError(503, 'published_content_corrupt');
    }
  }

  async index(releaseId?: string): Promise<ContentFile> {
    if (
      releaseId !== undefined &&
      !releaseIndexSchema.shape.releaseId.safeParse(releaseId).success
    )
      throw invalid();
    const id = releaseId ?? this.releases.state().activeReleaseId;
    if (!id) throw missing();
    const release = this.releases.get(id);
    if (!release || release.status !== 'ready') {
      if (releaseId === undefined)
        throw new ContentError(503, 'published_content_corrupt');
      throw missing();
    }
    return this.verified(async () => {
      if (release.indexKey !== `releases/${id}/index.json`)
        throw new Error('Invalid index key');
      const bytes = await this.read(
        release.indexKey,
        1_048_576,
        release.indexSha256,
      );
      if (bytes.toString('utf8') !== release.indexJson)
        throw new Error('Index mismatch');
      const index = releaseIndexSchema.parse(
        JSON.parse(bytes.toString('utf8')),
      );
      const entries = this.releases.entries(id);
      if (
        index.releaseId !== id ||
        entries.length !== index.characters.length ||
        !index.characters.every(
          (item) =>
            item.manifestPath ===
              `characters/${item.characterId}/v${item.characterVersion}/character.json` &&
            entries.some(
              (entry) =>
                entry.characterId === item.characterId &&
                entry.manifestPath === item.manifestPath &&
                entry.manifestSha256 === item.manifestSha256,
            ),
        )
      )
        throw new Error('Index entries mismatch');
      return {
        bytes,
        hash: release.indexSha256,
        mediaType: 'application/json',
        immutable: releaseId !== undefined,
      };
    });
  }

  private async package(id: string, version: string) {
    if (
      !characterManifestSchema.shape.characterId.safeParse(id).success ||
      !/^[1-9][0-9]{0,15}$/.test(version) ||
      !Number.isSafeInteger(Number(version))
    )
      throw invalid();
    const key = `characters/${id}/v${version}/character.json`;
    const reference = this.releases.readyReference(key);
    if (!reference) throw missing();
    return this.verified(async () => {
      const bytes = await this.read(
        key,
        1_048_576,
        reference.entry.manifestSha256,
      );
      const manifest = validateManifest(JSON.parse(bytes.toString('utf8')));
      if (
        manifest.characterId !== id ||
        manifest.characterVersion !== Number(version)
      )
        throw new Error('Manifest identity mismatch');
      return { bytes, manifest, key, hash: reference.entry.manifestSha256 };
    });
  }

  async manifest(id: string, version: string): Promise<ContentFile> {
    const result = await this.package(id, version);
    return {
      bytes: result.bytes,
      hash: result.hash,
      mediaType: 'application/json',
      immutable: true,
    };
  }

  async asset(id: string, version: string, hash: string): Promise<ContentFile> {
    if (!/^[a-f0-9]{64}$/.test(hash)) throw invalid();
    const result = await this.package(id, version);
    const asset = Object.values(result.manifest.assets).find(
      (asset) => asset.sha256 === hash,
    );
    if (!asset) throw missing();
    return this.verified(async () => {
      const bytes = await this.read(
        path.posix.join(path.posix.dirname(result.key), asset.path),
        asset.bytes,
        hash,
      );
      const dimensions = pngDimensions(bytes);
      if (
        bytes.length !== asset.bytes ||
        dimensions?.width !== asset.width ||
        dimensions?.height !== asset.height
      )
        throw new Error('Asset metadata mismatch');
      return { bytes, hash, mediaType: 'image/png', immutable: true };
    });
  }
}
