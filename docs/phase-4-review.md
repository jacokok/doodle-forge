# Phase 4 — frozen fixture review (first increment)

This implements review snapshots and approval persistence only. It does **not** publish a release, expose a content API, or load API characters in Godot. Phase 4 remains in progress; Phase 5 has not started.

## Explicit development seed

From the checkout, use the pinned commands:

```sh
mise exec node@22.23.3 -- npm exec --yes --package=pnpm@10.34.7 -- pnpm db:migrate
mise exec node@22.23.3 -- npm exec --yes --package=pnpm@10.34.7 -- pnpm content:seed
```

`content:seed` validates both synthetic contract fixtures (Sprout and Comet), creates missing authoring identities, freezes canonical manifests, and records explicit `development-fixture-seed` approvals bound to those manifest hashes. Each manifest includes all declared asset hashes. It prints version IDs, manifest hashes and latest decisions; no original drawings are used. This command is opt-in, not a server boot action. A repeat preserves existing authoring edits and any later rejected/revoked decision. Different bytes for the same revision fail rather than being overwritten.

The original `db:seed` is unchanged: foundation authoring metadata only. Storage/DB overrides, migration locking and backup precautions remain in [setup.md](setup.md). The CLI seed path was exercised twice against isolated temporary storage, not a production DB.

## Service and persistence boundaries

- `packages/content-publisher/src/index.ts`: `ReviewService.freezePackage()` validates the shared contract/semantics and bounded package file reads, asset lengths, hashes, PNG headers/dimensions, and real-path confinement. Canonical UTF-8 manifest bytes are stored in SQLite; review never exposes files publicly. Full PNG decoding is still required in the upcoming publisher.
- `ReviewService.decide()` requires a version ID, expected exact manifest hash, decision and actor label. Decisions are append-only; the latest per-version decision order determines authority (decision IDs remain UUIDs), not wall-clock timestamps or status alone. Reject/revoke removes authorization; a later explicit approval can restore it.
- `ReviewService.requireApproval()` verifies the stored snapshot and latest hash-bound approval. It is not a reservation: the publisher must recheck approval/hash inside its future activation transaction to prevent races.
- `packages/database/src/snapshots.ts`: transactional persistence; exact duplicate freezes reuse the revision, conflicts require a new version. New reviews cannot inherit approval from another revision. SQL triggers protect frozen snapshot bytes/identity/provenance, frozen ability children, append-only approvals, and published version rows. Revoking a published revision does not rewrite its immutable history.
- Migration `0001_dusty_wind_dancer.sql` is additive; the baseline is untouched. Legacy draft records remain intact and unapproved. Repository/domain APIs, not direct SQL, validate contract semantics and calculate hashes.

Review freezes manifest/hash metadata, **not source asset files**. The future publisher must reread, fully decode and verify assets, write immutable packages first, and atomically activate a ready release. An approval alone never implies game visibility. Local filesystem access is trusted; this is not an authenticated public service.

## Remaining gates

Publisher staging/reconciliation/fault/concurrency tests, immutable API/ETags, Godot contract parity/repository/runtime decoding/cache/refresh, and data-only second-character publication proof remain unimplemented.

Phase 3 manual graphical review and a human active-AI playthrough remain deferred by explicit user authorization, **not accepted**; see [phase-3-playtest.md](phase-3-playtest.md).
