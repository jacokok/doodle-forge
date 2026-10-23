# Phase 4 — publication service increment

Implemented in `packages/content-publisher/src/publication.ts` and `packages/database/src/releases.ts`, with additive migration `0002_absent_morg.sql`. Earlier migrations and generic gameplay are unchanged. This is a service/persistence slice, **not a content API or completed Phase 4**.

## Calling boundary

After explicit migration, construct `PublicationService(reviewService, releaseRepository, publishedRoot)` using the same database as review, and a private, absolute, local-filesystem published root. Call:

```ts
await publisher.publish({
  versionId,
  expectedManifestSha256,
  sourceDirectory,
}); // returns the active ready release UUID
```

Source directories and the storage root are trusted operator inputs, not HTTP parameters. No publisher CLI/UI, implicit publication at boot, or HTTP routes have been added. `content:seed` still approves only; it does not publish.

Publication parses the stored shared-contract snapshot, checks the latest matching approval, reads bounded/confined source files, hashes exact bytes and fully decodes PNGs with pinned Sharp 0.34.5. Dimensions, RGBA channels, page count and decoded pixel limits are checked. Exact validated buffers and canonical approved manifest bytes are written exclusively in same-root staging; files/directories are flushed before rename/activation. Existing package directories must validate identically; differing/corrupt bytes are never overwritten. Source originals are never modified.

Each index is a complete shared-contract release snapshot. After verifying its packages and index on disk, a short immediate SQLite transaction rechecks snapshot hashes/latest selected approval, inserts entries, marks the revision published/release ready, and CAS-updates the singleton generation/pointer. A CAS loser marks its preparation failed and rebuilds on the latest ready release (bounded to eight attempts). Identical active selections return the existing release; historical releases are never reactivated as an idempotency shortcut.

Ready releases/entries are SQL-immutable. A later rejection/revocation prevents selecting that revision again but does not rewrite an already-ready historical release; inherited ready entries retain their historical authorization. Removing/rolling back content requires a new release, not editing historical files.

## Visibility and recovery

`ReleaseRepository.readyReference(manifestPath)` resolves only references from ready releases. Future API handlers must resolve authorization through ready references and bounded validated reads, **never serve the published root statically**. Files, preparing releases, approved rows and orphan packages alone confer no visibility. There are currently no content routes.

Before starting publishers, with all publishing processes stopped, call `await publisher.reconcile()`. This offline/startup maintenance service:

- marks interrupted `preparing` rows `failed`, never guessing approval or auto-activating;
- reports staging directory names and packages not referenced by any ready release;
- verifies ready indexes/packages and reports corrupt release IDs without rewriting history;
- deletes nothing. Retry publication explicitly after inspection; immutable identical orphan packages can be reused.

Reconciliation is not yet wired into application startup or an operator CLI. Do not run it concurrently with publishers. Interrupted preparations are logically quarantined in the DB; orphan files remain private for operator audit. The post-activation fault case remains ready and retry-idempotent. Disk corruption after activation is reported, not silently repaired or treated as atomic success.

## Verified scope and limitations

Vitest exercises real migrated SQLite, Sharp decoding, fsynced temporary files, faults at seven publisher boundaries, transactional rollback, duplicate requests, concurrent same-revision calls, cross-connection generation conflicts, approval revocation, orphan reuse and corruption audits. These are deterministic fault injections, not machine power-cut tests. Durability was exercised on this Linux host only; other filesystem/OS semantics remain unverified. Storage is trusted against external mutation/symlink races; read-only files are accidental-mutation protection, not an authentication boundary.

Still pending: published-only bounded API/index/ETags and startup integration; Godot contract parity/repository/runtime decoder/cache/refresh; data-only second-character API playability proof. Phase 5 has not started. Phase 3 graphical/active-AI human playtesting remains deferred, **not accepted**.
