import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { DatabaseConnection } from './index.js';
import {
  characterVersions,
  contentReleases,
  contentReleaseEntries,
  contentState,
} from './schema.js';
import { SnapshotRepository } from './snapshots.js';

type Release = typeof contentReleases.$inferSelect;
export type ReleaseEntry = Omit<
  typeof contentReleaseEntries.$inferSelect,
  'releaseId'
>;

export class ReleaseRepository {
  constructor(private readonly connection: DatabaseConnection) {}

  state() {
    return this.connection.db
      .select()
      .from(contentState)
      .where(eq(contentState.id, 1))
      .get()!;
  }
  get(id: string) {
    return this.connection.db
      .select()
      .from(contentReleases)
      .where(eq(contentReleases.id, id))
      .get();
  }
  entries(id: string) {
    return this.connection.db
      .select()
      .from(contentReleaseEntries)
      .where(eq(contentReleaseEntries.releaseId, id))
      .all();
  }
  ready() {
    return this.connection.db
      .select()
      .from(contentReleases)
      .where(eq(contentReleases.status, 'ready'))
      .all();
  }
  preparing() {
    return this.connection.db
      .select()
      .from(contentReleases)
      .where(eq(contentReleases.status, 'preparing'))
      .all();
  }
  prepare(release: Release) {
    this.connection.db.insert(contentReleases).values(release).run();
  }
  fail(id: string) {
    this.connection.db
      .update(contentReleases)
      .set({ status: 'failed' })
      .where(eq(contentReleases.id, id))
      .run();
  }
  // Filesystem verification occurs before this short synchronous transaction.
  // All newly selected entries are authorized again while holding the write lock.
  activate(id: string, entries: ReleaseEntry[], selectedVersionId: string) {
    return this.connection.sqlite
      .transaction(() => {
        const release = this.get(id);
        const state = this.state();
        if (!release || release.status !== 'preparing')
          throw new Error('Preparing release required');
        if (
          state.generation !== release.expectedGeneration ||
          state.activeReleaseId !== release.previousReleaseId
        )
          return false;
        const snapshots = new SnapshotRepository(this.connection);
        for (const entry of entries) {
          const snapshot = snapshots.get(entry.characterVersionId);
          if (
            !snapshot ||
            snapshot.characterId !== entry.characterId ||
            snapshot.manifestSha256 !== entry.manifestSha256 ||
            !snapshot.manifestJson ||
            createHash('sha256').update(snapshot.manifestJson).digest('hex') !==
              entry.manifestSha256
          )
            throw new Error('Release snapshot mismatch');
          // Inherited ready entries retain their historical authorization, even if
          // revoked later. A newly selected revision always needs current approval.
          if (entry.characterVersionId === selectedVersionId) {
            const latest = snapshots.latestDecision(snapshot.id);
            if (
              latest?.decision !== 'approved' ||
              latest.manifestSha256 !== entry.manifestSha256
            )
              throw new Error('Matching latest unrevoked approval required');
          } else if (
            !state.activeReleaseId ||
            !this.entries(state.activeReleaseId).some(
              (old) =>
                old.characterVersionId === entry.characterVersionId &&
                old.manifestSha256 === entry.manifestSha256 &&
                old.manifestPath === entry.manifestPath,
            )
          ) {
            throw new Error('Inherited ready entry required');
          }
          this.connection.db
            .insert(contentReleaseEntries)
            .values({ ...entry, releaseId: id })
            .run();
        }
        const selected = snapshots.get(selectedVersionId);
        if (
          !selected ||
          !entries.some(
            (entry) => entry.characterVersionId === selectedVersionId,
          )
        )
          throw new Error('Selected revision required');
        if (selected.status !== 'published')
          this.connection.db
            .update(characterVersions)
            .set({ status: 'published', updatedAt: Date.now() })
            .where(eq(characterVersions.id, selectedVersionId))
            .run();
        this.connection.db
          .update(contentReleases)
          .set({ status: 'ready', publishedAt: Date.now() })
          .where(eq(contentReleases.id, id))
          .run();
        const result = this.connection.db
          .update(contentState)
          .set({ activeReleaseId: id, generation: state.generation + 1 })
          .where(eq(contentState.generation, state.generation))
          .run();
        if (result.changes !== 1) throw new Error('Activation CAS failed');
        return true;
      })
      .immediate();
  }
  // API authority: filesystem existence alone grants nothing. Bound the lookup
  // even when the same immutable revision appears in many historical releases.
  readyReference(manifestPath: string) {
    return this.connection.db
      .select({ entry: contentReleaseEntries, release: contentReleases })
      .from(contentReleaseEntries)
      .innerJoin(
        contentReleases,
        eq(contentReleaseEntries.releaseId, contentReleases.id),
      )
      .where(
        and(
          eq(contentReleaseEntries.manifestPath, manifestPath),
          eq(contentReleases.status, 'ready'),
        ),
      )
      .limit(1)
      .get();
  }
}
