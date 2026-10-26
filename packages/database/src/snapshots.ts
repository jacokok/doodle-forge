import { randomUUID } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import type { DatabaseConnection } from './index.js';
import {
  approvals,
  characters,
  characterVersions,
  contentReleases,
  contentReleaseEntries,
} from './schema.js';

type FrozenInput = Pick<
  typeof characterVersions.$inferInsert,
  'characterId' | 'version' | 'sourceSnapshotJson'
> & {
  manifestJson: string;
  manifestSha256: string;
};
export type ApprovalDecision = typeof approvals.$inferInsert.decision;

export class ReviewConflictError extends Error {
  constructor() {
    super('Review changed or character archived; refresh before retrying.');
  }
}

// Persistence only: the domain service validates contracts and package bytes.
export class SnapshotRepository {
  constructor(private readonly connection: DatabaseConnection) {}

  ensureFixtureIdentity(
    input: Pick<
      typeof characters.$inferInsert,
      'id' | 'name' | 'description' | 'bodyType'
    >,
  ) {
    const now = Date.now();
    this.connection.db
      .insert(characters)
      .values({
        ...input,
        fightingStyle: 'light_melee',
        specialPower: 'none',
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({ target: characters.id })
      .run();
  }

  get(id: string) {
    return this.connection.db
      .select()
      .from(characterVersions)
      .where(eq(characterVersions.id, id))
      .get();
  }

  history(characterId: string) {
    const versions = this.connection.db
      .select()
      .from(characterVersions)
      .where(eq(characterVersions.characterId, characterId))
      .orderBy(desc(characterVersions.version))
      .all();
    return versions.map((version) => ({
      version,
      decisions: this.connection.db
        .select()
        .from(approvals)
        .where(eq(approvals.characterVersionId, version.id))
        .orderBy(desc(approvals.decisionOrder))
        .all(),
      publications: this.connection.db
        .select({ release: contentReleases, entry: contentReleaseEntries })
        .from(contentReleaseEntries)
        .innerJoin(
          contentReleases,
          eq(contentReleaseEntries.releaseId, contentReleases.id),
        )
        .where(eq(contentReleaseEntries.characterVersionId, version.id))
        .all()
        .filter(({ release }) => release.status === 'ready')
        .map(({ release, entry }) => ({
          releaseId: release.id,
          publishedAt: release.publishedAt,
          manifestSha256: entry.manifestSha256,
        })),
    }));
  }

  latestDecision(id: string) {
    return this.connection.db
      .select()
      .from(approvals)
      .where(eq(approvals.characterVersionId, id))
      .orderBy(desc(approvals.decisionOrder))
      .get();
  }

  assertReviewCurrent(versionId: string, expectedDecisionOrder: number) {
    const snapshot = this.get(versionId);
    const owner =
      snapshot &&
      this.connection.db
        .select()
        .from(characters)
        .where(eq(characters.id, snapshot.characterId))
        .get();
    if (
      !owner ||
      owner.archivedAt !== null ||
      (this.latestDecision(versionId)?.decisionOrder ?? 0) !==
        expectedDecisionOrder
    )
      throw new ReviewConflictError();
  }

  freeze(input: FrozenInput) {
    return this.connection.sqlite
      .transaction(() => {
        const owner = this.connection.db
          .select()
          .from(characters)
          .where(eq(characters.id, input.characterId))
          .get();
        if (!owner || owner.archivedAt !== null)
          throw new Error('Active character required');
        const existing = this.connection.db
          .select()
          .from(characterVersions)
          .where(
            and(
              eq(characterVersions.characterId, input.characterId),
              eq(characterVersions.version, input.version),
            ),
          )
          .get();
        if (existing) {
          if (
            existing.manifestJson !== input.manifestJson ||
            existing.manifestSha256 !== input.manifestSha256 ||
            existing.sourceSnapshotJson !== input.sourceSnapshotJson
          )
            throw new Error(
              'Version already exists with different snapshot; create a new version',
            );
          return existing;
        }
        const now = Date.now();
        return this.connection.db
          .insert(characterVersions)
          .values({
            ...input,
            id: randomUUID(),
            status: 'review',
            createdAt: now,
            updatedAt: now,
          })
          .returning()
          .get();
      })
      .immediate();
  }

  recordDecision(input: {
    versionId: string;
    expectedManifestSha256: string;
    decision: ApprovalDecision;
    actorLabel: string;
    note: string;
    // Fixture seed must not silently undo a human rejection/revocation on rerun.
    onlyIfUndecided?: boolean;
    expectedDecisionOrder?: number;
  }) {
    return this.connection.sqlite
      .transaction(() => {
        const snapshot = this.get(input.versionId);
        if (
          !snapshot?.manifestJson ||
          snapshot.manifestSha256 !== input.expectedManifestSha256
        )
          throw new Error('Approval hash does not match frozen snapshot');
        const latest = this.latestDecision(input.versionId);
        if (input.expectedDecisionOrder !== undefined)
          this.assertReviewCurrent(
            input.versionId,
            input.expectedDecisionOrder,
          );
        if (input.onlyIfUndecided && latest) return latest;
        const now = Date.now();
        const result = this.connection.db
          .insert(approvals)
          .values({
            id: randomUUID(),
            decisionOrder: (latest?.decisionOrder ?? 0) + 1,
            characterVersionId: input.versionId,
            manifestSha256: input.expectedManifestSha256,
            decision: input.decision,
            actorLabel: input.actorLabel,
            note: input.note,
            createdAt: now,
          })
          .returning()
          .get();
        // Published bytes/status remain immutable, even after approval is revoked.
        if (snapshot.status !== 'published') {
          this.connection.db
            .update(characterVersions)
            .set({
              status: input.decision === 'approved' ? 'approved' : 'review',
              updatedAt: now,
            })
            .where(eq(characterVersions.id, snapshot.id))
            .run();
        }
        return result;
      })
      .immediate();
  }
}
