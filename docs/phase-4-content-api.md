# Phase 4 — published-only content API

The studio exposes read-only game content after explicit publication. `content:seed` approves fixtures but does **not** publish them. Publication remains a service call ([publication guide](phase-4-publication.md)); there is no publication UI/CLI yet. The [Godot repository](phase-4-godot-repository.md), [runtime factory](phase-4-godot-runtime.md) and [explicit API arena mode](phase-4-godot-arena.md) prove headless published discovery/selection and fighter behavior. An [opt-in validated PNG cache](phase-4-godot-cache.md) now reuses bytes without persisting catalog authority. Arena polling uses a five-second best-effort cadence and shares manual Refresh's safe-boundary candidate replacement. The real built-studio harness now verifies post-discovery data-only character addition and playability; Phase 4 acceptance is locally verified. Phase 5 remains unauthorized.

## Routes and cache behavior

| GET route | Representation | Cache-Control |
|---|---|---|
| `/api/content/index` | Current DB-selected ready release index | `no-cache` |
| `/api/content/releases/:releaseId/index` | Historical ready release index | `public, max-age=31536000, immutable` |
| `/api/content/characters/:id/versions/:version/manifest` | Ready-referenced manifest | Same immutable policy |
| `/api/content/characters/:id/versions/:version/assets/:hash.png` | PNG declared by that exact manifest | Same immutable policy |

Each successful representation has a quoted SHA-256 ETag over exact response bytes, content length/type and `nosniff`. `If-None-Match` accepts weak tags, lists and `*`; matching GET/HEAD requests return bodyless 304. SvelteKit supplies HEAD for GET routes. Content is verified **before** evaluating the condition, so stale client validators cannot conceal server corruption. Range requests are not implemented; responses return the complete bounded representation.

Index `manifestPath` and manifest asset paths describe portable package layout, **not arbitrary HTTP URLs**. Clients validate the shared contract, pin the release, and map entry character ID/version to the manifest route, and each declared asset SHA-256 to its asset route. Never concatenate arbitrary package paths into requests or introduce a wildcard storage endpoint.

## Authority, bounds and errors

- SQLite ready releases/entries are the visibility authority. Approved-only snapshots, preparing/failed releases, staging and filesystem-only packages remain inaccessible. Current catalog updates do not remove historical ready indexes or revisions. Later approval revocation does not rewrite ready history.
- UUIDs, canonical positive safe-integer versions and lowercase 64-hex hashes are checked before lookup. An asset hash is resolved only inside the requested ready-referenced manifest, not a global hash store.
- JSON reads are capped at 1 MiB; PNG reads at their manifest-declared length (shared contract maximum 16 MiB). Regular-file checks, nonblocking/no-follow final opens, real-path root confinement, exact hashes, manifest semantics/identity and PNG byte length/header dimensions are enforced. Contract maps/index arrays remain bounded. Full PNG decoding occurs at publication; reads do not repeatedly decode unchanged hash-verified bytes.
- No active release/unknown or unpublished content: `404 content_not_found`. Invalid route parameters: `400 invalid_content_parameters`. Missing, oversized, escaped, changed or invalid ready files: `503 published_content_corrupt`. Other runtime failures: `503 content_unavailable`. Errors use `{error:{code,message}}`, `no-store`, no ETag and no paths/stack traces. Framework-level unmatched routes/method errors retain SvelteKit's response format.
- Reading an index validates that index against its DB snapshot/entries, not the health of every asset. Each requested manifest/asset is verified independently. Use the offline reconciliation audit to check all ready content. The API never silently falls back to a different release or repairs immutable bytes.

## Operator recovery

Run `pnpm content:reconcile` before resuming publication after an interruption, preferably with studio/worker stopped. It marks interrupted preparations failed, reports staging/orphans and corrupt ready release IDs, deletes nothing, and never activates or approves. Exit 0 means the audit completed with no corrupt ready releases; exit 1 means corrupt ready content or an operational/locking failure. The current active pointer/history is not changed.

All `PublicationService.publish()` calls register under `published/.publishers/<operation-uuid>/`; reconciliation atomically claims `published/.maintenance/` and refuses registered publishers. Publishers refuse maintenance. Multiple publishers remain allowed; the existing DB CAS still resolves publication conflicts. Reconciliation is deliberately **not** run automatically by studio/worker startup, which could race a separately running publisher. All processes must use the same configured local published root and this service API.

Process death can leave markers. **Never automatically expire markers by age or PID.** Stop every publisher/reconciler (including CLI/custom processes), confirm none can restart, inspect the precise marker paths, then remove only confirmed stale, empty operation directories using `rmdir`. Do not remove the parent `.publishers` directory, live markers or broad storage trees. Rerun reconciliation before restarting publishers. A maintenance-marker collision also fails closed; operators must inspect it, not force a concurrent audit.

For corrupt ready content, keep affected consumers/publication stopped as necessary, preserve the report and restore the exact immutable bytes from a known-good coordinated backup, then rerun the audit. No restore/rollback tool or destructive garbage collection is implemented. Do not overwrite history with new bytes, drop ready references, or assume republishing can repair a conflicting immutable package.

## Verification and limitations

Route-handler tests use real SQLite/files/publication, plus real built-server HTTP smoke for route matching, GET/HEAD/304, method/path/private-storage denial, history, corruption and operator-command exit behavior. Lock tests cover concurrent publishers, maintenance refusal, exceptions and stale markers. OS/power-cut and hostile concurrent filesystem mutation tests are not claimed. Storage remains trusted against external mutation during reads; local loopback operation is not authenticated hosted deployment. Aggregate HTTP rate limits/concurrency quotas remain future work; client per-request, per-load and managed disk-cache bounds are not global quotas.
