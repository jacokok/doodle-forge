# Phase 6 mock workflow

The worker now executes explicit **CLI-only offline mock generation** through a frozen, unapproved review snapshot (ADR-051). Studio cannot enqueue or track these jobs or preview/approve/publish their generated sources yet. This is not the complete upload-to-game factory, real AI, or Phase 6 acceptance.

## Try the explicit CLI

1. Run `pnpm db:migrate` explicitly. Create a character and attach a private original in Studio. Select **Light melee** and **None**; unselected/unsupported gameplay intent fails closed.
2. Obtain the character UUID and current `editRevision` from its JSON API (`GET /api/characters/<uuid>`). Save authoring changes before capturing the revision.
3. Start the worker with `pnpm dev` (or `node apps/worker/dist/index.js` after `pnpm build`). Studio alone does not start a worker.
4. In another terminal, explicitly enqueue using the current revision, a unique idempotency key, art style and unsigned 32-bit seed:

```sh
pnpm factory:enqueue <character-uuid> <editRevision> demo-generation-001 pixel 17
# Outputs factory.queued, jobId and reserved characterVersion.
pnpm factory:status <job-uuid>
```

Styles are `original`, `cartoon`, `pixel`; these are mock hash/resampling policies, not real art fidelity. No startup path creates jobs, migrates, seeds, approves or publishes. A running worker will resume supported queued jobs. Worker `/health` reports `generation: 'mock-cli'`; Studio `/api/health` still reports `'unavailable'` for its unwired generation feature. `factory:status` reports only job state/version ID and completed/total/failed counts, not private text, paths or artwork. `27/27` with `waiting_approval` means frozen review, **not** approval, publication or overall job success.

Repeat the **same command/key** to recover its original job/version even after authoring changes or cancellation. Changed parameters with that key conflict. A new key captures current saved state and allocates a new version; it does not retry or selectively regenerate the old graph. Missing/archived owners, stale revisions, missing originals, invalid seeds/styles and unsupported choices create no job. This developer CLI uses the existing local-trust model; it is not an authenticated remote job API.

## Selected graph and providers

`mock-factory@1` captures authoring name/description/body/choices, selected immutable original ID/hash, revision, style and seed. All 27 step envelopes pin its canonical SHA-256 and reserved character version:

- `capture-artwork` → parallel-ready `analyze-captured-description` / `clean-image` → `character-master` → `determine-body-type` (analysis is also a dependency).
- Five explicit targets `idle`, `walk`, `attack`, `hurt`, `ko`: pose → three raw frames → normalization → `build-sheet` (two columns).
- `generate-metadata` joins analysis/all sheets using the fixed contracts-owned `light-melee@1` catalog; `validate-review` joins metadata/all sheets and freezes under its lease fence.

Graph configuration and catalog identity are fixed/versioned, not client-supplied graphs or combat numbers. Changes that would reinterpret this persisted protocol require a new identity. Later authoring edits or replacement uploads never change queued inputs. The selected source is retained in job request JSON; it is not reconstructed from mutable authoring rows during execution.

`@doodleforge/ai` provides capture-first analysis/cleanup/master with strict candidate verification. `@doodleforge/ai/capabilities` provides the separately typed metadata/frame interface. No credentials, network, real model fallback, SDK or private-art transmission is enabled. Cleanup is a near-white heuristic; master/frames are synthetic. Frame provenance records pose lineage but current pixels are not pose-conditioned. Text analysis is not moderation. Temporal consistency and art/identity fidelity remain unverified.

The legacy `analyze-description@1` metadata handler remains supported. The alternate library `pack-sheet`/`assemble-manifest`/`validate-assets` protocols (ADRs 043–046/050) remain intact but **unregistered** in the actual worker. Their explicit gameplay/timing and `sheetOutputSchema` (`sourceSha256s`, columns in inputs, mock parameters) must not be confused with `buildSheetOutputSchema` (`sourceHashes`, columns in parameters). Existing persisted rows are never silently rewritten. Registered stages still validate their own schemas; inspect/reconcile old internal graphs before restarting the worker. No unknown stage/version fallback is provided.

## Atomic reservation and persistence

`enqueueMockGeneration` validates public command inputs. `WorkflowRepository.enqueueGeneration` uses one immediate SQLite transaction to check idempotency, capture the active owner's expected revision and immutable attachment, reserve a version and enqueue the validated graph. Its callback performs only bounded graph validation/hashing/serialization—no filesystem, provider or network work under the write lock.

The reservation high-water mark is the maximum across existing character versions **and retained job-step version envelopes**. Enqueued/failed/cancelled graphs continue reserving their numbers; no placeholder review/draft row or migration is needed. Concurrent processes cannot allocate the same number. Transaction failure leaves no partial job/steps or reservation; separate explicit snapshot writers can still cause a later version conflict, which fails rather than overwrites. Do not delete retained steps as a cleanup strategy; a future retention scheme must preserve reservation high-water marks.

`characterVersionId` stays null until the validated frozen version is adopted. Same-key retries return the original job; they do not recapture a changed owner or allocate a second version. Idempotency is bound to the normalized command and `mock-factory@1` protocol. Stage-input, graph, implementation and source hashes retain the existing immutable checkpoint semantics.

## Scheduling, retries and cancellation

The actual runtime polls each second, defaults to one concurrent attempt (configurable `DOODLEFORGE_WORKER_CONCURRENCY=1..4`), uses 60-second leases with 15-second heartbeats and sweeps at most 100 expired leases per poll. Shared stage keys have explicit animation-target dispatch; no duplicate registry entries or per-character code. Unknown versions/stages remain unclaimed. Stage handlers execute outside transactions; the repository checks worker/attempt/fence, unexpired lease and uncancelled job at adoption.

Default budget is three attempts (bounded to ten), with deterministic 2/4-second transient backoff. Known-safe mock provider transient failures are classified; persisted errors use fixed sanitized runner codes, not raw provider messages. Failed permanent/budget-exhausted work fails the job and blocks pending/cancels sibling in-flight attempts. Completed checkpoints survive. Cancellation prevents adoption even if a handler ignores abort. Shutdown stops claims, aborts/relinquishes work and waits at most five seconds before health/SQLite close; signal handlers are installed before the readiness event. A relinquished attempt consumes budget. No manual retry UI, jitter/Retry-After, cache reuse, paid-call reconciliation or selective regeneration is implemented.

## Immutable artifact protocol

Worker artifacts live privately at `storage/generated/attempts/<stepId>/<attemptId>/<artifactId>.png`, separately from originals and releases. References contain validated UUIDs, hashes, byte sizes and dimensions, never arbitrary paths or inline artwork. Reads require real confined directories and no-follow/nonblocking regular-file descriptors, bounded exact size, hash and strict PNG decode. Admission is at most 10 MiB compressed, 20 million decoded pixels, 4096 per edge and 100 declared new artifacts per stage. No aggregate storage quota exists.

Writes validate/decode bytes, create an exclusive temp file, make it read-only, fsync, install with a no-replace atomic hard link, remove the temp name and fsync directory/parents. The executor rechecks newly produced artifact ownership and bytes before checkpoint adoption. Orphans after cancel/crash/stale attempts remain private and are retained, never selected just because they exist. Same-volume Linux/local filesystem trust and same-host UTC clock/event-loop assumptions apply; privileged directory replacement and power-loss durability are not established by process tests. No destructive cleanup is added.

Capture reads a pinned immutable original ID/hash/owner/key and preserves exact upload bytes. It strictly decodes and derives an oriented metadata-stripped preview under the upload policy. Normalization rejects edge-clipped/empty frames, fits without enlargement and aligns the bounding-box bottom center to (128,224); this is a **provisional foot heuristic**, not anatomical measurement. Independent fitting can affect temporal consistency. Pixel style uses nearest-neighbor; others use Lanczos.

## Metadata and review freeze

Sheets record ordered normalized source hashes, 256×256 frame/layout, style, target anchor and resolved input identity. Metadata maps `attack`/`ko` to public `attack_light`/`knockout`; idle is 8 FPS, others 10 FPS, only idle/walk loop. Fixed catalog gameplay is independent of art/text. Canonical manifest UTF-8 bytes/hash and private sheet bindings persist as checkpoint JSON; no package directory or manifest file is installed.

`validate-review@1` rechecks all selected checkpoints/attempts, schema/semantics/hash and publication-shared full PNG decode, then rejects empty/opaque/clipped frames and nontransparent unused cells. Its pure `reviewSnapshot` projection is passed by the executor to `completeReview`: frozen snapshot, typed `workflow-artifacts@1` source registry, checkpoint/attempt, version link and `waiting_approval` state commit in one fenced transaction. Every other graph step must have succeeded. A final lease check after snapshot insertion rolls back everything on expiry; cancellation/archive/version conflict or gate failure cannot leave partial review authority. Waiting holds no lease. Cancelling afterward preserves immutable history without granting approval.

The source registry binds manifest asset IDs to selected attempt artifacts plus validation/metadata step and source/checkpoint hashes. It is not a filesystem hint, public route or asset-table insertion. Future generated-source readers must verify adopted job/checkpoint/owner, cancellation/gate state and bytes. Current Studio fixture commands reject generated sources; private generated previews, approval/waiting-publish synchronization, durable explicit publication, selective regeneration and upload-to-game acceptance remain incomplete. Existing fixture approval/publication stays separate and unchanged.

## Verification

```sh
pnpm exec vitest run apps/worker/src/factory.test.ts apps/worker/src/runtime.test.ts
pnpm test
pnpm check
pnpm test:startup
```

Factory tests use real migrated SQLite/storage, competing CLI processes, actual mock providers, restart/resume, cancellation, preserved original hashes and the real worker entry from explicit CLI enqueue to unapproved review. This is not a Playwright upload/approve/publish or Godot gameplay E2E, real-provider evaluation, manual accessibility/child-usability acceptance, or remote-CI claim. Phase 6 remains in progress.
