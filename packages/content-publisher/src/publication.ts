import { randomUUID } from 'node:crypto';
import { mkdir, open, realpath, rename, rm, readdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {
  canonicalJson,
  releaseIndexSchema,
  sha256,
  type CharacterManifest,
} from '@doodleforge/contracts';
import { ReleaseRepository, type ReleaseEntry } from '@doodleforge/database';
import { ReviewService, readBoundedFile, validateManifest } from './review.js';

export type PublicationBoundary =
  | 'validated'
  | 'staged'
  | 'package-renamed'
  | 'prepared'
  | 'index-written'
  | 'before-activation'
  | 'activated';
type FaultHook = (boundary: PublicationBoundary) => void | Promise<void>;
const syncDirectory = async (directory: string) => {
  const handle = await open(directory, 'r');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
};
async function writeDurable(filename: string, bytes: string | Buffer) {
  await mkdir(path.dirname(filename), { recursive: true });
  const file = await open(filename, 'wx', 0o444);
  try {
    await file.writeFile(bytes);
    await file.sync();
  } finally {
    await file.close();
  }
  await syncDirectory(path.dirname(filename));
}

export class PublicationService {
  constructor(
    private readonly reviews: ReviewService,
    private readonly releases: ReleaseRepository,
    private readonly root: string,
    private readonly hook: FaultHook = () => {},
  ) {}

  private async assets(
    manifest: CharacterManifest,
    directory: string,
    consume?: (relative: string, bytes: Buffer) => Promise<void>,
  ) {
    const root = await realpath(directory);
    for (const asset of Object.values(manifest.assets)) {
      const target = await realpath(path.resolve(root, asset.path));
      if (!target.startsWith(root + path.sep))
        throw new Error('Asset package escape');
      const bytes = await readBoundedFile(target, asset.bytes);
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
      if (consume) await consume(asset.path, bytes);
    }
  }

  private async verifyPackage(entry: ReleaseEntry) {
    const filename = path.join(this.root, entry.manifestPath);
    const bytes = await readBoundedFile(filename, 1_048_576);
    if (sha256(bytes) !== entry.manifestSha256)
      throw new Error('Immutable manifest hash mismatch');
    const manifest = validateManifest(JSON.parse(bytes.toString('utf8')));
    if (manifest.characterId !== entry.characterId)
      throw new Error('Package identity mismatch');
    await this.assets(manifest, path.dirname(filename));
    return manifest;
  }

  async publish(input: {
    versionId: string;
    expectedManifestSha256: string;
    sourceDirectory: string;
  }) {
    const snapshot = this.reviews.requireApproval(
      input.versionId,
      input.expectedManifestSha256,
    );
    const manifest = validateManifest(JSON.parse(snapshot.manifestJson!));
    const entry: ReleaseEntry = {
      characterId: manifest.characterId,
      characterVersionId: snapshot.id,
      manifestPath: `characters/${manifest.characterId}/v${manifest.characterVersion}/character.json`,
      manifestSha256: input.expectedManifestSha256,
    };
    await mkdir(this.root, { recursive: true });
    const stage = path.join(this.root, '.staging', randomUUID());
    await mkdir(stage, { recursive: true });
    // No async reread of source bytes after validation: stage these exact buffers.
    const written = new Set<string>();
    await this.assets(
      manifest,
      input.sourceDirectory,
      async (relative, bytes) => {
        if (!written.has(relative)) {
          await writeDurable(path.join(stage, relative), bytes);
          written.add(relative);
        }
      },
    );
    await this.hook('validated');
    await writeDurable(
      path.join(stage, 'character.json'),
      snapshot.manifestJson!,
    );
    await syncDirectory(stage);
    await this.hook('staged');
    const destination = path.dirname(path.join(this.root, entry.manifestPath));
    await mkdir(path.dirname(destination), { recursive: true });
    try {
      await rename(stage, destination);
    } catch (error) {
      if (
        !['EEXIST', 'ENOTEMPTY'].includes(
          (error as NodeJS.ErrnoException).code ?? '',
        )
      )
        throw error;
      await this.verifyPackage(entry); // Never overwrite an existing revision.
      await rm(stage, { recursive: true });
    }
    // Persist each newly created ancestor as well as both rename parents.
    await syncDirectory(path.dirname(destination));
    await syncDirectory(path.join(this.root, 'characters'));
    await syncDirectory(path.join(this.root, '.staging'));
    await syncDirectory(this.root);
    await syncDirectory(path.dirname(path.resolve(this.root)));
    await this.hook('package-renamed');
    for (let attempt = 0; attempt < 8; attempt++) {
      const state = this.releases.state();
      const inherited = state.activeReleaseId
        ? this.releases.entries(state.activeReleaseId)
        : [];
      const entries = [
        ...inherited.filter((old) => old.characterId !== entry.characterId),
        entry,
      ].sort((a, b) => a.characterId.localeCompare(b.characterId));
      const characters = [];
      for (const item of entries) {
        const verified = await this.verifyPackage(item);
        characters.push({
          characterId: item.characterId,
          characterVersion: verified.characterVersion,
          manifestPath: item.manifestPath,
          manifestSha256: item.manifestSha256,
        });
      }
      // Idempotent only if this exact selection is still active; do not resurrect
      // historical releases or silently roll back a newer active revision.
      if (
        inherited.some(
          (old) => old.characterVersionId === entry.characterVersionId,
        )
      ) {
        this.reviews.requireApproval(
          input.versionId,
          input.expectedManifestSha256,
        );
        if (this.releases.state().generation === state.generation)
          return state.activeReleaseId!;
        continue;
      }
      const id = randomUUID();
      const indexJson = canonicalJson(
        releaseIndexSchema.parse({
          schemaVersion: 1,
          releaseId: id,
          characters,
        }),
      );
      const indexKey = `releases/${id}/index.json`;
      this.releases.prepare({
        id,
        status: 'preparing',
        indexKey,
        indexJson,
        indexSha256: sha256(indexJson),
        previousReleaseId: state.activeReleaseId,
        expectedGeneration: state.generation,
        publishedAt: null,
      });
      await this.hook('prepared');
      await writeDurable(path.join(this.root, indexKey), indexJson);
      await syncDirectory(path.join(this.root, 'releases'));
      await syncDirectory(this.root);
      await this.hook('index-written');
      if (
        sha256(
          await readBoundedFile(path.join(this.root, indexKey), 1_048_576),
        ) !== sha256(indexJson)
      )
        throw new Error('Index hash mismatch');
      for (const item of entries) await this.verifyPackage(item);
      await this.hook('before-activation');
      if (this.releases.activate(id, entries, snapshot.id)) {
        await this.hook('activated');
        return id;
      }
      this.releases.fail(id); // CAS loser rebuilds the complete latest snapshot.
    }
    throw new Error('Publication contention; retry explicitly');
  }

  // Offline/startup maintenance ONLY: stop publishers first. Interrupted work
  // is logically quarantined, never auto-approved/activated or destructively GC'd.
  async reconcile() {
    const failed: string[] = [];
    for (const release of this.releases.preparing()) {
      this.releases.fail(release.id);
      failed.push(release.id);
    }
    const staging = await readdir(path.join(this.root, '.staging')).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return [];
        throw error;
      },
    );
    const packages = await readdir(path.join(this.root, 'characters')).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return [];
        throw error;
      },
    );
    const corruptReady: string[] = [];
    for (const release of this.releases.ready()) {
      try {
        const bytes = await readBoundedFile(
          path.join(this.root, release.indexKey),
          1_048_576,
        );
        if (
          sha256(bytes) !== release.indexSha256 ||
          bytes.toString('utf8') !== release.indexJson
        )
          throw new Error('Index corruption');
        releaseIndexSchema.parse(JSON.parse(bytes.toString('utf8')));
        for (const entry of this.releases.entries(release.id))
          await this.verifyPackage(entry);
      } catch {
        corruptReady.push(release.id);
      }
    }
    const orphanPackages: string[] = [];
    for (const character of packages) {
      const versions = await readdir(
        path.join(this.root, 'characters', character),
        { withFileTypes: true },
      );
      for (const version of versions.filter((item) => item.isDirectory())) {
        const manifestPath = `characters/${character}/${version.name}/character.json`;
        if (!this.releases.readyReference(manifestPath))
          orphanPackages.push(manifestPath);
      }
    }
    return {
      failed,
      staging: staging.sort(),
      orphanPackages: orphanPackages.sort(),
      corruptReady,
    };
  }
}
