import { constants } from 'node:fs';
import { open, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  canonicalJson,
  characterManifestSchema,
  pngDimensions,
  sha256,
  validateManifestSemantics,
  type CharacterManifest,
} from '@doodleforge/contracts';
import {
  SnapshotRepository,
  type ApprovalDecision,
} from '@doodleforge/database';

const manifestLimit = 1_048_576;

export async function readBoundedFile(filename: string, limit: number) {
  const file = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > limit)
      throw new Error('File exceeds size limit or is not regular');
    const bytes = Buffer.alloc(limit + 1);
    let length = 0;
    while (length < bytes.length) {
      const result = await file.read(
        bytes,
        length,
        bytes.length - length,
        null,
      );
      if (result.bytesRead === 0) break;
      length += result.bytesRead;
    }
    if (length > limit) throw new Error('File exceeds size limit');
    return bytes.subarray(0, length);
  } finally {
    await file.close();
  }
}

export function validateManifest(value: unknown): CharacterManifest {
  const manifest = characterManifestSchema.parse(value);
  const errors = validateManifestSemantics(manifest);
  if (errors.length) throw new Error(errors.join('\n'));
  return manifest;
}

// Review validates declared PNG headers/hashes. Full decoding is additionally
// required at publication; this service does not make any files game-visible.
export async function readReviewPackage(manifestPath: string) {
  const absolute = path.resolve(manifestPath);
  const root = await realpath(path.dirname(absolute));
  const raw = await readBoundedFile(absolute, manifestLimit);
  const manifest = validateManifest(JSON.parse(raw.toString('utf8')));
  for (const [id, asset] of Object.entries(manifest.assets)) {
    const target = await realpath(path.resolve(root, asset.path));
    if (!target.startsWith(`${root}${path.sep}`))
      throw new Error(`assets.${id}: package escape`);
    const bytes = await readBoundedFile(target, asset.bytes);
    if (bytes.length !== asset.bytes || sha256(bytes) !== asset.sha256)
      throw new Error(`assets.${id}: byte length/hash mismatch`);
    const dimensions = pngDimensions(bytes);
    if (
      dimensions?.width !== asset.width ||
      dimensions?.height !== asset.height
    )
      throw new Error(`assets.${id}: PNG dimensions mismatch`);
  }
  return manifest;
}

export class ReviewService {
  constructor(private readonly snapshots: SnapshotRepository) {}

  async freezePackage(
    manifestPath: string,
    sourceSnapshot: Record<string, unknown>,
  ) {
    const manifest = await readReviewPackage(manifestPath);
    return this.freezeValidated(manifest, sourceSnapshot);
  }

  private freezeValidated(
    manifest: CharacterManifest,
    sourceSnapshot: Record<string, unknown>,
  ) {
    const manifestJson = canonicalJson(manifest);
    const sourceSnapshotJson = canonicalJson(sourceSnapshot);
    if (
      Buffer.byteLength(manifestJson) > manifestLimit ||
      Buffer.byteLength(sourceSnapshotJson) > manifestLimit
    )
      throw new Error('Snapshot exceeds size limit');
    return this.snapshots.freeze({
      characterId: manifest.characterId,
      version: manifest.characterVersion,
      manifestJson,
      manifestSha256: sha256(manifestJson),
      sourceSnapshotJson,
    });
  }

  getSnapshot(versionId: string) {
    const snapshot = this.snapshots.get(versionId);
    if (
      !snapshot?.manifestJson ||
      sha256(snapshot.manifestJson) !== snapshot.manifestSha256
    )
      throw new Error('Missing or corrupt frozen snapshot');
    validateManifest(JSON.parse(snapshot.manifestJson));
    return snapshot;
  }

  decide(input: {
    versionId: string;
    expectedManifestSha256: string;
    decision: ApprovalDecision;
    actorLabel: string;
    note?: string;
  }) {
    const actorLabel = input.actorLabel.trim();
    const note = input.note ?? '';
    if (
      !actorLabel ||
      actorLabel.length > 120 ||
      note.length > 2000 ||
      !/^[a-f0-9]{64}$/.test(input.expectedManifestSha256) ||
      !['approved', 'rejected', 'revoked'].includes(input.decision)
    )
      throw new Error('Invalid approval decision');
    this.getSnapshot(input.versionId);
    return this.snapshots.recordDecision({ ...input, actorLabel, note });
  }

  requireApproval(versionId: string, expectedManifestSha256: string) {
    const snapshot = this.getSnapshot(versionId);
    const latest = this.snapshots.latestDecision(versionId);
    if (
      snapshot.manifestSha256 !== expectedManifestSha256 ||
      latest?.decision !== 'approved' ||
      latest.manifestSha256 !== expectedManifestSha256
    )
      throw new Error('Matching latest unrevoked approval required');
    return snapshot;
  }

  // Explicit development fixture operation, not an implicit boot/production gate
  // bypass. A repeat preserves any later rejection/revocation and authoring edits.
  async seedFixture(name: 'sprout' | 'comet') {
    if (name !== 'sprout' && name !== 'comet')
      throw new Error('Unknown development fixture');
    const manifest = await readReviewPackage(
      fileURLToPath(
        new URL(
          `../../contracts/fixtures/${name}/v1/character.json`,
          import.meta.url,
        ),
      ),
    );
    this.snapshots.ensureFixtureIdentity({
      id: manifest.characterId,
      name: manifest.name,
      description: manifest.description,
      bodyType: manifest.bodyType,
    });
    const snapshot = this.freezeValidated(manifest, {
      kind: 'synthetic-development-fixture',
      fixture: name,
    });
    this.getSnapshot(snapshot.id);
    const approval = this.snapshots.recordDecision({
      versionId: snapshot.id,
      expectedManifestSha256: snapshot.manifestSha256!,
      decision: 'approved',
      actorLabel: 'development-fixture-seed',
      note: `Explicitly approved synthetic ${name} fixture; no original child artwork.`,
      onlyIfUndecided: true,
    });
    return {
      versionId: snapshot.id,
      manifestSha256: snapshot.manifestSha256,
      decision: approval.decision,
    };
  }
}
