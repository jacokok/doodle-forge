import path from 'node:path';
import { realpath } from 'node:fs/promises';
import { z } from 'zod';
import {
  canonicalJson,
  sha256,
  characterManifestSchema,
  type CharacterManifest,
} from '@doodleforge/contracts';
import {
  characterIdSchema,
  frozenVersionMutationSchema,
  reviewDecisionSchema,
} from '@doodleforge/contracts/authoring';
import {
  ReviewConflictError,
  SnapshotRepository,
  ReleaseRepository,
} from '@doodleforge/database';
import {
  PublicationService,
  ReviewService,
  readBoundedFile,
} from '@doodleforge/content-publisher';
import { CharacterError, CharacterService } from './characters.js';

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new CharacterError(
      400,
      'invalid_input',
      'Invalid frozen-version action.',
    );
  return result.data;
}

// Phase 5: bounded fixture commands only. Generated packages need Phase 6 jobs.
// No client-selected paths or sourceSnapshotJson filesystem hints are trusted.
export class ReviewActionService {
  private readonly reviews: ReviewService;
  private readonly publisher: PublicationService;
  constructor(
    private readonly characters: CharacterService,
    private readonly snapshots: SnapshotRepository,
    private readonly releases: ReleaseRepository,
    private readonly publishedRoot: string,
    private readonly fixtureRoot: string,
  ) {
    this.reviews = new ReviewService(snapshots);
    this.publisher = new PublicationService(
      this.reviews,
      releases,
      publishedRoot,
    );
  }

  private owned(characterId: unknown, versionId: unknown) {
    const owner = this.characters.get(characterId);
    const snapshot = this.snapshots.get(parse(characterIdSchema, versionId));
    if (!snapshot || snapshot.characterId !== owner.id)
      throw new CharacterError(404, 'not_found', 'Frozen version not found.');
    return this.reviews.getSnapshot(snapshot.id);
  }

  private current(input: z.infer<typeof frozenVersionMutationSchema>) {
    const snapshot = this.owned(input.characterId, input.versionId);
    if (snapshot.manifestSha256 !== input.expectedManifestSha256)
      throw new CharacterError(
        409,
        'stale_review',
        'Frozen hash changed; refresh review before retrying.',
      );
    try {
      this.snapshots.assertReviewCurrent(
        snapshot.id,
        input.expectedDecisionOrder,
      );
    } catch (error) {
      if (error instanceof ReviewConflictError)
        throw new CharacterError(409, 'stale_review', error.message);
      throw error;
    }
    return snapshot;
  }

  private assertSmall(manifest: CharacterManifest) {
    const assets = Object.values(manifest.assets);
    if (
      assets.length > 5 ||
      assets.reduce((sum, asset) => sum + asset.bytes, 0) > 2_000_000 ||
      assets.reduce((sum, asset) => sum + asset.width * asset.height, 0) >
        2_000_000
    )
      throw new CharacterError(
        409,
        'source_unavailable',
        'This package exceeds the Phase 5 fixture command limit; a worker job is required.',
      );
  }

  private async source(snapshot: ReturnType<ReviewService['getSnapshot']>) {
    const manifest = characterManifestSchema.parse(
      JSON.parse(snapshot.manifestJson!),
    );
    this.assertSmall(manifest);
    const relative = `characters/${manifest.characterId}/v${manifest.characterVersion}/character.json`;
    let directory: string;
    if (this.releases.readyReference(relative))
      directory = path.dirname(path.join(this.publishedRoot, relative));
    else {
      const fixture =
        manifest.characterId === '11111111-1111-4111-8111-111111111111'
          ? 'sprout'
          : manifest.characterId === '22222222-2222-4222-8222-222222222222'
            ? 'comet'
            : null;
      if (!fixture || manifest.characterVersion !== 1)
        throw new CharacterError(
          409,
          'source_unavailable',
          'This package needs the Phase 6 worker; no publication job was queued.',
        );
      directory = path.join(this.fixtureRoot, fixture, 'v1');
    }
    const validated = characterManifestSchema.parse(
      JSON.parse(
        (
          await readBoundedFile(
            path.join(directory, 'character.json'),
            1_048_576,
          )
        ).toString('utf8'),
      ),
    );
    if (sha256(canonicalJson(validated)) !== snapshot.manifestSha256)
      throw new CharacterError(
        409,
        'source_mismatch',
        'Source package does not match this frozen version.',
      );
    const root = await realpath(directory);
    const assetBytes: Record<string, Buffer> = {};
    for (const [key, asset] of Object.entries(validated.assets)) {
      const filename = await realpath(path.join(root, asset.path));
      if (!filename.startsWith(`${root}${path.sep}`))
        throw new Error('Frozen asset confinement');
      const bytes = await readBoundedFile(filename, asset.bytes);
      if (bytes.length !== asset.bytes || sha256(bytes) !== asset.sha256)
        throw new Error('Frozen asset corruption');
      assetBytes[key] = bytes;
    }
    return { directory, manifest: validated, assetBytes };
  }

  async decide(value: unknown) {
    const input = parse(reviewDecisionSchema, value);
    const snapshot = this.current(input);
    await this.source(snapshot); // Never approve a package whose bytes cannot be reviewed.
    try {
      return this.reviews.decide({
        ...input,
        actorLabel: 'local-studio-reviewer',
      });
    } catch (error) {
      if (error instanceof ReviewConflictError)
        throw new CharacterError(409, 'stale_review', error.message);
      throw error;
    }
  }

  async publish(value: unknown) {
    const input = parse(frozenVersionMutationSchema, value);
    const snapshot = this.current(input);
    if (this.snapshots.latestDecision(snapshot.id)?.decision !== 'approved')
      throw new CharacterError(
        409,
        'approval_required',
        'Approve this exact frozen version before publishing.',
      );
    const { directory } = await this.source(snapshot);
    const state = this.releases.state();
    const inherited = state.activeReleaseId
      ? this.releases.entries(state.activeReleaseId)
      : [];
    if (
      new Set([
        ...inherited.map((entry) => entry.characterId),
        input.characterId,
      ]).size > 8
    )
      throw new CharacterError(
        409,
        'source_unavailable',
        'This catalog requires a Phase 6 publication job.',
      );
    for (const entry of inherited)
      this.assertSmall(
        characterManifestSchema.parse(
          JSON.parse(
            this.reviews.getSnapshot(entry.characterVersionId).manifestJson!,
          ),
        ),
      );
    try {
      const releaseId = await this.publisher.publish({
        ...input,
        sourceDirectory: directory,
      });
      return { releaseId };
    } catch (error) {
      if (error instanceof ReviewConflictError)
        throw new CharacterError(409, 'stale_review', error.message);
      throw error;
    }
  }

  async preview(characterId: unknown, versionId: unknown, assetId: unknown) {
    const snapshot = this.owned(characterId, versionId);
    const { manifest, assetBytes } = await this.source(snapshot);
    const key = parse(z.string().min(1).max(80), assetId);
    const asset = manifest.assets[key];
    if (!asset)
      throw new CharacterError(404, 'not_found', 'Frozen asset not found.');
    const bytes = assetBytes[key]!;
    // Recheck ownership after asynchronous reads; archive denies future private reads.
    this.characters.get(characterId);
    return bytes;
  }
}
