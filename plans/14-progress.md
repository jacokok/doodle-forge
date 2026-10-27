# 14 — Persistent implementation progress

## Phase 6 — deterministic mock provider and running worker increment (2026-10-26)

### Scope and implementation

- User authorized the next bounded mock-worker increment. Initial Git status was clean, preserving the committed durable foundation. Read required agent/index/roadmap/live progress, plans 05/07/08/10/11 and relevant decisions; inspected worker lifecycle/config, empty AI boundary, typed workflow executor, SQLite leases and existing startup/smoke tests before implementation.
- Added `packages/ai` capability schemas/interfaces and `deterministic-mock@1`. Offline description analysis preserves explicit body/style/combat intent and returns a reproducible structured brief/palette. Bounded frame requests return real nonempty transparent 256×256 RGBA PNG candidates with distinguishable ordered frames, animation/facing variation, exact hashes, deterministic request/seed/provider provenance, zero cost and synthetic-art warnings. Sharp is the existing pinned 0.34.5; no external version upgrades, SDK, network, credentials or artwork upload.
- Added `packages/workflow/src/runner.ts`: one-second polling, default one concurrent attempt (bounded 1–4), exact registered key/version claims, 15-second heartbeats with 60-second leases, poll-based cancellation/lost-claim abort, bounded 100-step expiry sweeps, explicit safe transient classification and fixed sanitized persisted error codes. Unknown stages/versions remain queued without attempts. Job gate completion is still not inferred from computation.
- Shutdown stops polling/claims, clears heartbeat timers, aborts handlers, transactionally relinquishes owned attempts, waits at most five seconds, then runtime closes SQLite/health. Relinquishment records a cancelled attempt with `WORKER_STOPPED`, consumes attempt budget and retries with persisted backoff (or fails at budget); it is not user job cancellation. Executor abort checks reject late results even if a handler ignores abort.
- Composed the scheduler into the actual worker entry. Startup verifies workflow tables and binds health before claims; port/migration failures start no work. Only `analyze-description@1` is registered, with strict input/output/provenance validation and injected mock provider. Frame candidates remain provider-only in-memory outputs, **not worker-persisted game assets**. No HTTP generation, new public enqueue command, automatic jobs, review snapshots, progress UI or publication mutations were added. Health and Studio still honestly report full generation unavailable; combined dev banner now distinguishes the mock-analysis worker.
- Added `DOODLEFORGE_WORKER_CONCURRENCY` validation/default/example and configuration tests. Native Sharp stays an external installed worker production dependency. No new migration; original migration history remains unchanged. ADR-033 records worker/provider boundaries, shutdown budget policy and limitations; setup/workflow docs and roadmap updated.
- Added deterministic timer/SQLite tests plus real Node processes for actual entry checkpoint/restart, simultaneous scheduler competition, SIGKILL lease recovery, cross-process cancellation and persisted transient retry. Tests verify PNG decode/dimensions/transparency/hash/distinction, supported choices/bounds/no fallback, concurrency, default heartbeat cadence, sanitized errors, bounded recovery and graceful/uncooperative shutdown.
- Code review found a potential local same-step reattempt tracking hazard: an old task's finalizer could remove the new task if keyed by step ID. Active entries now use immutable **attempt IDs**; an abort-ignoring old-task/reclaimed-attempt regression verifies the new attempt remains tracked and relinquished correctly.

### Actual validation

| Executed command | Result |
|---|---|
| `mise exec -- pnpm install --no-frozen-lockfile`; `mise exec -- pnpm install --frozen-lockfile` | PASS: existing pinned packages/workspace links; no new external versions. |
| `mise exec -- pnpm exec vitest run packages/ai/src/mock.test.ts packages/workflow/src/runner.test.ts apps/worker/src/runtime.test.ts apps/worker/src/lifecycle.test.ts` | PASS at initial checkpoint: 28 tests / 4 files; later competition/recovery/tracking regressions pass in final full suite below. |
| `mise exec -- pnpm exec vitest run packages/workflow/src/runner.test.ts` | PASS: final scheduler checkpoint **17 tests**, including abort-ignoring old attempt versus reclaimed local attempt. |
| `mise exec -- pnpm test` | PASS: **279 tests / 18 files** (245 previous + 34 new). |
| `mise exec -- pnpm check`; `mise exec -- pnpm lint` | PASS: strict TS/Svelte 0 errors / 0 warnings; ESLint clean. Initial check caught the new shutdown callback needing an explicit worker type; fixed and reran. |
| `mise exec -- pnpm test:e2e` | PASS: **21 Chromium tests**, isolated migrated SQLite/storage and real built Studio; authoring/upload/review/publication regressions retained. No new factory-browser claim. |
| `mise exec -- pnpm build`; `mise exec -- pnpm test:smoke` | PASS: Studio/worker production builds and real HTTP publication/security/corruption/reconciliation/process-lifecycle checks. Rebuilt after browser suite for normal local origin. |
| `mise exec -- pnpm test:startup` | PASS: **7** isolated real launcher tests, including combined worker shutdown/port failure. |
| `mise exec -- node tools/godot-validation/run.mjs --published-api` | PASS: pinned Godot 4.7.2 and matching Linux templates; **405 assertions** (3/57/26/102/69/13/47/88), real built Studio/SQLite publication/generic-fighter regression. Existing intentional malformed PNG/Unicode diagnostics unchanged. |
| `mise exec -- pnpm db:generate`; `git diff --exit-code -- packages/database/migrations`; `mise exec -- pnpm format:check`; `git diff --check` | PASS: no schema changes/new migration, all committed migrations unchanged, formatting/whitespace clean. Final documentation formatting checks rerun after this result update. |

### Remaining boundaries / next increment

- Phase 6 remains **in progress**. Next: capture/original verification and attempt-scoped immutable artifact persistence, then mock master/pose/frame stages, normalization/sheet packing and validated frozen review snapshots. After that: persisted Studio progress, durable explicit publication jobs replacing ADR-031's bounded synchronous fixture path, selective regeneration and full two-character upload-to-game E2E.
- Analysis uses a synthetic/internal pre-frozen metadata envelope, not the finished capture-first graph. The mock silhouette is not evidence of real AI fidelity, preservation of child identity or image-quality acceptance. No PNG output is yet adopted by a worker checkpoint, registered for private review or published.
- Jitter/Retry-After, artifact cache verification, provider request reconciliation, manual retry/regeneration, frozen review/gate transitions and public job projections remain pending. Uncooperative handlers can occupy a slot until settling; graceful wait does not forcibly terminate arbitrary external resources. Same-host clocks and responsive event-loop assumptions remain.
- Phase 5 manual accessibility/screen-reader and observed child-usability acceptance remain **explicitly deferred under the user's phase-gate exception, NOT passed**. No manual accessibility/child observation, remote CI, power-loss or real-provider test ran. Luna entitlement/automation/image-tool evaluation remains separately gated; no real integration was enabled.

## Phase 6 — offline mock analysis, cleanup and master (2026-10-26)

### Scope and implementation

- Started with the prior artifact/capture increment's modified and untracked files; preserved all work, with no reset/discard/staging/commit. Read AGENTS, index/roadmap/live progress, relevant pipeline/workflow/provider/testing plans, ADRs 032/034 and current source. Continue the actual checkout baseline, not the absent ADR-033 implementation. Phase 6 remains **in progress**; Phase 5 manual accessibility/screen-reader/observed-child acceptance remains **deferred, not passed**.
- Added an offline-only `DeterministicMockProvider` in `packages/ai`: shared bounded creative-choice validation, deterministic plain-text brief, white-background cleanup and source/design/style/seed-conditioned synthetic master. Styles are mock controls, not real art-fidelity promises; analysis explicitly warns it is not moderation. No descriptions become code/SVG/tools. Candidate checks pin provider/version/capability/source/hash, strict 256×256 PNG decode, <=2 MiB and nonempty visible/transparent alpha; adapter byte buffers are cloned.
- Added typed `analyze-description`, `clean-image` and `character-master` library stages. The executor resolves declared same-job adopted checkpoints, validates owner/version/snapshot/input identity and successful attempt, and passes frozen metadata/JSON strings rather than repositories. Consumers require artifact step/attempt membership in the selected checkpoint and reverify bytes before provider execution. Only capture-adopted files feed analysis/cleanup; master joins adopted cleanup and analysis.
- Provenance persists provider/version/style/seed, request/source-content hashes and a resolved input hash including dependency checkpoint hashes. The immutable declared input hash is unchanged. Retry/restart can reconstruct identity without rewriting rows; hashes conservatively include checkpoint UUID identities and are **not** automatic cross-job cache equivalence. Mock PNG content itself excludes attempt IDs/clocks and is deterministic on identical content inputs.
- Outputs install and adopt through the existing attempt artifact protocol. No migrations, HTTP generation, production polling/enqueue, real provider, credentials, external artwork transfer, frozen/public source registration or publication change. Existing bounded fixture Studio/publication/game slice stays unchanged. Workspace links use existing pinned dependencies only.
- Added 32 tests: provider determinism/source/design/style/seed binding; strict capabilities/choices/version/bounds; malformed/hash/dimension/provenance/empty/opaque candidate rejection; no network/tools; dependency lineage/version/target/snapshot guards; pipeline actual PNGs; DB/store reopen, transient retry with untouched upstream attempts, expiry/orphan/stale-adoption rejection, cancellation/abort and corrupt upstream bytes blocking calls. Original bytes remain unchanged and no versions/approvals/releases appear.
- Updated plans 07/08/10/12, workflow docs and ADR-035. This is **not** anchor normalization or a completed generation graph: body/pose/frame capabilities and normalization/sheets remain separate increments. Production worker still truthfully reports generation unavailable.

### Actual verification

| Executed command | Result |
|---|---|
| `mise exec -- pnpm install --no-frozen-lockfile`; `mise exec -- pnpm install --frozen-lockfile` | PASS: existing workspace/dependency links only, no version upgrades. |
| `mise exec -- pnpm exec vitest run packages/ai/src/mock.test.ts packages/workflow/src/mock-stages.test.ts` | Final PASS: **32 tests / 2 files**. Initial 8 failures caught Sharp's single-resize-per-pipeline behavior producing an oversized cleanup candidate; corrected to one contain resize plus padding, preserving strict validation. |
| `mise exec -- pnpm test` | Final PASS: **298 tests / 18 files** (266 prior + 32 new). Earlier full checkpoint: 294 before four additional validation cases. |
| `mise exec -- pnpm check`; `mise exec -- pnpm lint` | PASS: TypeScript/Svelte 0 errors / warnings; ESLint clean. |
| `mise exec -- pnpm build`; `mise exec -- pnpm test:smoke` | PASS: production Studio/health-only worker, real HTTP publication/security/corruption/operator and worker/dev lifecycle regression checks. |
| `mise exec -- pnpm test:startup` | PASS: **7** isolated process/startup tests. |
| `mise exec -- pnpm format:check`; `git diff --check` | PASS; final documentation checks rerun after this entry. |

### Remaining work and known limitations

1. Next bounded increment: mock body/pose/frame stages, then deterministic anchor normalization/sheet packing with dimension/alpha/layout/hash tests, through this artifact/dependency boundary. Current dependency resolver supports one predecessor per declared stage key; explicit per-animation branch addressing needs a tested extension.
2. Production worker polling/heartbeat/shutdown/provider request bookkeeping, automatic retry classification/cache, frozen review registration, Studio progress, approval/publication gates and full two-character generation-to-game proof remain unimplemented. Completing master computation leaves the job running, never review-ready or published.
3. No Chromium or Godot suite rerun in this library-only increment. Previous browser focus/history failures remain unresolved; Godot validator previously lacked its expected binary/templates. Do not inherit prior pass totals as new evidence. No manual graphical/accessibility/child-usability, real-provider, external art transfer or remote-CI checks performed. Existing local trust/private orphan/no aggregate quota/power-loss limitations remain.

## Phase 6 — immutable artifacts and pinned original capture (2026-10-26)

### Baseline and scope

- Initial Git status clean; no reset, discard, staging or commit. Read AGENTS, index/roadmap/progress, plans 05/07/08/10/11 and ADR-032. **Handoff discrepancy:** this checkout has no ADR-033, mock worker or description analysis; AI is empty and worker health-only. Existing full-suite evidence here is 245 Vitest, not the supplied 279. Did not fabricate missing work; ADR-034 leaves 033 reserved for reconciliation.
- Phase 6 remains in progress. Phase 5 manual accessibility/screen-reader/observed-child checks remain **explicitly deferred, not passed**. No full generation/phase acceptance claim.

### Implementation

- Added `packages/workflow/src/artifacts.ts`: strict PNG references with UUID step/attempt/artifact identity, hash, bytes and dimensions; bounded confined no-follow/nonblocking reads with strict decode/dimension/hash verification. Exclusive temp writes, read-only mode, fsync, atomic no-replace hard-link installation and directory sync preserve distinct immutable files.
- Executor accepts a composition-supplied store; producing stages declare references. Files and current step/attempt membership are reverified before the existing final SQLite lease/cancellation fence. Cancelled/expired outputs remain private orphans, never selected checkpoints. Reads reverify after restart; no automatic cache or destructive cleanup.
- Added `capture.ts`: verify pinned original ID/hash/owner/kind/key, rehash original bytes, strictly decode/check dimensions, persist an oriented metadata-stripped PNG preview. Later attachment replacement cannot redirect capture; originals remain unchanged. Shared envelope schemas moved unchanged to `envelope.ts` to avoid an initialization cycle.
- References persist in checkpoint JSON, not generated-asset rows or frozen/public sources. No migrations, routes, provider calls, credentials, external artwork transfers, HTTP generation, automatic enqueue or publication changes. Added the existing image-processing workspace link only; no version upgrades. Updated plans 07/08/12, ADR-034 and `docs/phase-6-workflow.md`.
- Added 21 real-SQLite/temp-storage cases: deterministic hashes, original preservation/replacement, adopted-file reopen, abandoned-attempt restart/expiry, stale-artifact rejection/late completion, cancellation/abort after installation, pre-adoption corruption, missing/size/hash/dimension errors, traversal/symlink roots/ancestors/files, invalid original metadata/bytes, malformed PNG and size bounds. SQL immutability remains enabled; corrupt metadata is injected via a repository spy.

### Actual verification

| Executed command | Result |
|---|---|
| `mise exec -- pnpm install --no-frozen-lockfile` | PASS: workspace link only. |
| `mise exec -- pnpm exec vitest run packages/workflow/src/artifacts.test.ts` | Corrected checkpoint PASS: 18 tests; three subsequent cases included in full suite. Initial failures exposed circular imports, a closed test repository and attempts to mutate SQL-immutable test metadata; corrected without weakening guards. |
| `mise exec -- pnpm test` | PASS: **266 tests / 16 files**, including **21 new cases**. |
| `mise exec -- pnpm check`; `mise exec -- pnpm lint` | PASS including final rerun: TS/Svelte 0 errors / warnings; ESLint clean. |
| `mise exec -- pnpm build`; `mise exec -- pnpm test:smoke` | PASS: production Studio/worker, real HTTP publication/security/corruption/reconciliation and process lifecycle. Normal local build restored after browser runs. |
| `mise exec -- pnpm test:startup` | PASS: **7** isolated process/startup tests. |
| `mise exec -- pnpm test:e2e` | Initial FAIL: Chromium absent (20 launch failures, 1 HTTP pass). Installed via `mise exec -- pnpm exec playwright install chromium`. Full reruns: **20 pass / 1 fail**, then **19 pass / 2 fail**. Unchanged `characters.spec.ts:13` New-character/Name-focus failure on both; `history-review.spec.ts:77` also failed on second. No unrelated test/app assertions changed; no passing browser-suite claim. |
| `mise exec -- pnpm test:godot:api` | BLOCKED/FAIL before assertions: expected `godot` 4.7.2-stable binary/templates unavailable to validator. **No Godot assertions ran**; prior 405 assertion evidence is historical only. |

Final `mise exec -- pnpm exec vitest run packages/workflow/src/artifacts.test.ts`: **21 passed**. Final `mise exec -- pnpm install --frozen-lockfile`, `mise exec -- pnpm format:check`, `git diff --check` and normal-origin `mise exec -- pnpm build`: PASS. No application failures in artifact/capture tests; broader browser/Godot limitations above remain unresolved.

### Remaining work / limitations

1. Reconcile missing mock-worker/ADR-033 handoff with the branch before composing stages. Next: deterministic offline mock provider/image stages, then normalization/sheets, each through this boundary. Worker polling/heartbeat/shutdown composition remains absent here.
2. Cache reuse, frozen source registration/review snapshots, Studio progress, gates/durable publication, selective regeneration and full two-character upload-to-game proof remain unimplemented. Files confer no publication authority.
3. Current validation limitations: browser focus/history failures and unavailable Godot tooling. Local filesystem trust, private orphan accumulation/no aggregate quota, hard-link same-filesystem/Linux assumptions and untested power-loss/privileged directory replacement remain explicit. No real provider, remote CI or manual accessibility/child-usability acceptance performed.

## Phase 6 — durable workflow foundation (2026-10-26)

### Authorization and phase-gate exception

- User explicitly authorizes Phase 6 and defers outstanding Phase 5 manual accessibility/screen-reader and observed child-usability acceptance. This is a **phase-gate exception, NOT passed verification**. Earlier Phase 5 feature/test evidence is retained below; manual checklist remains unaccepted. Phase 6 is now **in progress**, not complete.
- Started with clean Git status. Read AGENTS, plan index/roadmap/progress, plans 05/07/08/10/11 and decisions; inspected worker health lifecycle, empty workflow/AI packages, Drizzle migration/repository boundaries and Studio/publication protocols. No existing changes discarded, staged or committed.

### Bounded implementation

- Added Drizzle migration `0004_lyrical_boom_boom.sql` and matching snapshot/journal: jobs, dependency-bearing steps and retained attempts, FK/JSON/state/lease/budget checks and scheduling/idempotency indexes. Previous migrations untouched. SQL guards make ended attempts and adopted checkpoints immutable.
- `packages/database/src/workflow.ts` owns immediate transactional enqueue/claim/heartbeat/adoption/failure/expiry/cancel operations. Claims serialize dependency readiness, create attempt records and increment fences. Adoption requires matching running step/job, worker, attempt ID, fence and strictly unexpired lease. Heartbeats extend but cannot shorten/revive leases. Defaults: 60-second lease, request budget three attempts, deterministic exponential retry delay. Expired leases record an outcome before requeue; budget exhaustion fails the job. Cancellation atomically ends in-flight attempts, cancels pending work and prevents late adoption; completed upstream checkpoints survive.
- `packages/workflow/src/index.ts` defines strict versioned shared envelopes, asset ID/hash refs, generic typed stage schemas/contracts, canonical input identities, bounded validated graph enqueue and output validation before fenced checkpoint adoption. Input/graph/implementation/parameter changes conflict with an existing idempotency key. Invalid/cyclic/cross-owner graphs cannot partially enqueue. Execution occurs outside transactions; no provider or filesystem work inside claims.
- Added temporary real-SQLite tests for fresh/Phase-5 incremental migrations, graph/idempotency/rollback, simultaneous separate-process workers, wrong attempts/owners/fences, exact expiry, heartbeat, close/reopen recovery, **SIGKILL of an owning worker**, expired attempt accounting, stale completions, retry budget/permanent errors, sibling blocking, queued/running cancellation and schema/output/abort boundaries. Fault-injected attempt insertion/finalization failures roll back claim/checkpoint mutations together.
- ADR-032 records this library-first boundary and fail-fast policy. Added `docs/phase-6-workflow.md`, roadmap and workflow plan annotations. Workflow now explicitly depends on existing database/contracts/Zod packages; no external package version upgrades.
- Production worker remains health-only; generation remains genuinely unavailable. No new HTTP generation, implicit startup migrations/enqueue, fake progress, review snapshots, approval/gate transitions or publication job claims. Computation completion alone intentionally leaves a foundation job running until snapshot/gate orchestration exists; not exposed as a working factory. Existing bounded synchronous fixture publication stays runnable until its durable replacement increment.

### Provider investigation (public documentation only)

- Direct official model guidance and API model page identify the requested Luna as **`gpt-6-luna`**, with **text/image input and text output**, not native image output. Exact public model identity is now documented, but the user's actual entitlement is **unverified**; no model is selected or substituted.
- Official authentication docs distinguish subscription ChatGPT sign-in from separately billed API keys, recommend API keys for programmatic CLI workflows, and describe admin-permitted Enterprise automation tokens. They do not verify personal subscription permission for this unattended backend or image tools. Plan 10 records source URLs and remaining terms/entitlement/image-tool/privacy/consent/budget gates.
- Search retrieval was degraded/irrelevant; relied on direct official pages instead. No credentials/configuration read, authentication performed, provider invoked, private artwork transmitted or pi SDK installed. Pi conversation persistence remains explicitly separate from SQLite durability. Real-provider integration is still gated under plan 10/Phase 7.

### Actual validation

| Executed command | Result |
|---|---|
| `mise exec -- pnpm db:generate` (initial and recheck) | PASS: additive 0004 generated; recheck says no schema changes. Prior SQL migrations unchanged via `git diff --exit-code -- packages/database/migrations/000{0,1,2,3}_*.sql`. |
| `mise exec -- pnpm install --no-frozen-lockfile`; `mise exec -- pnpm install --frozen-lockfile` | PASS: workspace links updated and frozen install verified. Initial frozen install correctly refused the changed workspace manifest before lock update. |
| `mise exec -- pnpm exec vitest run packages/workflow/src/workflow.test.ts packages/database/src/database.test.ts` | PASS at restart/SIGKILL checkpoint: **33 tests / 2 files**; two subsequent transactional-fault tests also pass in the final full suite. |
| `mise exec -- pnpm test` | PASS: **245 tests / 15 files** (218 previous + 27 new). |
| `mise exec -- pnpm check`; `mise exec -- pnpm lint` | PASS: TypeScript/Svelte 0 errors / 0 warnings; ESLint clean. |
| `mise exec -- pnpm test:e2e` | PASS: **21 Chromium tests**, built Studio and migrated temporary SQLite/storage; upload/edit/review/publication regressions unchanged. |
| `mise exec -- pnpm build`; `mise exec -- pnpm test:smoke` | PASS: production Studio/worker, built HTTP publication/security/corruption/reconciliation and worker/dev lifecycle. Build restores normal local origin after browser suite. |
| `mise exec -- pnpm test:startup` | PASS: **7** isolated startup/process tests. |
| `mise exec -- node tools/godot-validation/run.mjs --published-api` | PASS: Godot 4.7.2 and matching Linux templates verified; **405 assertions** (3/57/26/102/69/13/47/88), real built Studio/SQLite publication and generic fighter/gameplay regressions. Existing intentional malformed PNG/Unicode diagnostics retained. |
| `mise exec -- pnpm format:check`; `git diff --check` | PASS; final documentation checks rerun after progress update. |

### Next increments / known limitations

1. Compose actual worker polling/heartbeat/shutdown, provider/stage context and deterministic mock capability stages; keep all real calls disabled. Current executor surfaces errors to its future scheduler; no automatic heartbeat loop, retry classifier, jitter/Retry-After or provider request persistence API yet.
2. Implement deterministic image processing/normalization/sheets, verified attempt-scoped artifacts/cache and frozen review snapshots, then persisted Studio progress and durable explicit publication jobs. Replace ADR-031's fixture-only synchronous path only alongside tested source registration/publication recovery; do not run generation in handlers.
3. Add gate transitions, selective regeneration/manual retries and full two-character upload-to-game proof in roadmap order. A JSON checkpoint is not yet a verified image artifact; cache policy is a declaration, not implemented reuse. No Phase 6 acceptance/E2E claim.
4. No manual accessibility/screen-reader/observed-child, remote-CI, power-loss, distributed-host clock or real-provider tests ran. Same-host UTC clock assumptions, local trust/privacy limits, immutable private orphan accumulation and publication operation-marker reconciliation remain. Deferred manual acceptance is still deferred, not passed.

## Phase 5 — authorized review/publication feature increment (2026-10-26)

### Scope and implementation

- Started with clean `main...origin/main`; read required plans/progress and studio/persistence/publication/workflow/provider/testing boundaries, inspected domain/repositories/publisher/remotes/editor/browser harness. User explicitly requested completing Phase 5 review/publication before Phase 6. This authorizes those mutations, not fabrication of manual accessibility/child-usability acceptance. Phase 6 implementation has not started.
- Added shared strict frozen-version action DTOs, validated domain service and JSON/remote dispatch. Requests bind owner/version UUID, canonical manifest hash and latest decision order; actor label is server-owned `local-studio-reviewer`. Decisions append with SQLite order/active-owner CAS. Publication rechecks decision order and active owner at activation and on its already-active idempotent path. Existing CLI/fixture paths preserve their prior behavior when no UI order token is supplied. No migrations, credentials or dependencies added.
- Implemented native Cancel-first pinned version/hash confirmation for approve/reject/revoke/publish, pending overlap protection, explicit review refresh and stale/uncertain-result blocking. Unsaved authoring inputs remain untouched. Rejection/revocation never remove historical ready releases; approval alone never publishes. Preserved the current history view during query refresh so action feedback/focus are not lost to component remount.
- Added bounded private frozen-sheet delivery for supported unpublished fixture sources, with owned active version lookup, no-store/same-origin resource policy, canonical source-hash equality, confined bounded reads and asset hash verification. Public content still requires ready-release references. Sources are only server-allowlisted Sprout/Comet v1 or already-ready immutable paths; no client/source-snapshot path hints. Admission is five assets, 2 MB compressed and 2 million declared pixels per package, eight catalog identities. Unsupported/generated unpublished packages explicitly require Phase 6.
- ADR-031 records the incremental protocol exception: small Phase 5 fixture publication is a synchronous actual 200 result/release ID via existing durable atomic publisher, not a fictitious 202 job. Generated/larger publication will use Phase 6 persistent jobs. Filesystem stalls, uncertain results and interrupted-operation reconciliation remain operational limitations. No generation runs inside routes.
- Updated home/library/dev capability text, setup/authoring/accessibility docs and normative plans. Replaced two pre-existing fixture-generator explicit-any declarations with shared `CharacterManifest` asset/animation types, resolving the remaining lint errors without changing generation logic or committed fixture assets.
- Recorded requested OpenAI Codex subscription / “luna” / possible pi integration direction in plan 10. Exact model ID/entitlement/programmatic access/image capability/terms remain unverified. Read installed pi SDK persistence documentation for orientation only; no SDK dependency, provider request, credential access or private-art transfer. Persisted agent conversation context is not queue/lease/fencing durability. Phase 6 remains mock-first; real integration requires Phase 7 evaluation and a decision before implementation.

### Actual validation

| Executed command | Result |
|---|---|
| `mise exec -- pnpm exec vitest run apps/studio/src/lib/server/review-actions.test.ts` | PASS at initial checkpoint: 8 tests. Final full suite includes 12 new route/domain/source/concurrency cases. |
| `mise exec -- pnpm exec playwright test tools/browser-tests/z-review-actions.spec.ts` | Final focused checkpoint PASS: 1 test before adding pending/uncertain coverage; full suite below includes both new cases. |
| `mise exec -- pnpm test` | Final PASS: **218 tests / 14 files**. Covers private owner/path/archived access, JSON bounds/origins, invalid hashes/tokens/paths, cross-connection decision CAS, unapproved publish denial, idempotent publication, revocation preserving ready bytes, unregistered/corrupt source rejection, and decision/archive races before activation. |
| `mise exec -- pnpm test:e2e` | Final PASS: **21 Chromium tests**, built studio/temp migrated SQLite/storage. New tests cover keyboard confirmation/cancel, pending/uncertain recovery, stale competing review, unsaved input retention, explicit public-index activation, remote wrong/missing origin denial and revocation preserving release visibility. Existing upload/history/animation regressions retained. |
| `mise exec -- pnpm check` | Final PASS: TypeScript/Svelte, **0 errors / 0 warnings**. |
| `mise exec -- pnpm lint` | Final PASS, including removal of the two previously recorded fixture-generator findings. |
| `mise exec -- pnpm build`; `mise exec -- pnpm test:smoke` | PASS: production studio/worker and real HTTP publication/security/history/corruption/operator/lifecycle checks. Build restores normal local origin after browser tests. |
| `mise exec -- pnpm test:startup` | PASS: 7 isolated real dev-launcher tests, startup configuration/migrations/studio-only/combined lifecycle and cleanup. |
| `mise exec -- pnpm test:godot:api` | PASS: verified Godot 4.7.2/templates and **405 assertions** (foundation 3, gameplay 57, resources 26, hostile-peer content 102, cache 69, live addition 13, published factory 47, published arena 88). Existing expected malformed PNG/Unicode diagnostics remain; no error allowlist weakened. |
| `mise exec -- pnpm format:check`; `git diff --check` | PASS including final documentation updates. |

Initial check found relative-import resolution and nonreactive bindings; corrected with existing project import conventions and runes. Initial browser runs exposed confirmation focus timing (test now waits for Cancel/Confirm focus) and refresh remount losing action status (kept current history mounted while refreshing); reran focused and full suites successfully. Later tightened JSON route bodies to reject identity aliases and source validation to bound/hash-check manifests before asset reads; final check/test/browser/lint suites rerun successfully.

### Remaining gates and next actions

- Phase 5 feature implementation is locally verified for available supported fixture versions, **not overall accepted**. Comprehensive accessibility/screen-reader review and consenting child-usability observation remain pending. No manual graphical, observed-child, screen-reader or remote-CI tests ran. The manual checklist is `docs/phase-5-accessibility.md`; user must provide observations/acceptance or explicitly decide to defer that gate before Phase 6 advancement.
- New uploads still produce immutable originals, not generated/frozen versions. Publication is deliberately small/source-limited until persistent Phase 6 registration/jobs; no full upload-to-generation E2E claim. Local loopback trust is not authenticated multi-user ownership. Explicit reviewer audit label is not a guardian account. No aggregate quota/retention policy or new rollback UI.
- Next implementation after gate resolution: Phase 6 typed durable stages, additive job/attempt/lease persistence, fenced checkpoint adoption, deterministic mock provider and fault/restart tests. Do not replace these guarantees with pi conversation persistence or silently wire real AI/child-data transmission.

## Phase 5 — controllable multi-frame previews (2026-10-24)

### Scope and implementation

- Began with clean Git status and current progress; reread plans README/06/11/12 and accessibility guidance, then inspected animation timing, existing browser review fixtures and isolated seed harness. Continued a bounded Phase 5 increment, not approval/publication mutations or Phase 6.
- Added explicit Pause/Play for multi-frame previews. Frame stepping pauses; Restart starts from frame one without overriding reduced motion. One-shots stop at the final frame and can replay. Pause is retained across animation/version choices within an identity; opening another identity resets it. Timers stop while the review step/document is hidden, during artwork loading or after asset failure. Listeners/timers are cleaned up through existing component lifecycle.
- Fixed completed one-shot restart (explicit playback revision triggers a new timer) and shared-sheet selection stuck in loading (image load lifecycle keyed to version/animation). Both were exposed/covered by the new real multi-frame browser slice rather than single-frame fixtures.
- Added test-only `browser-motion-seed.ts`: creates a four-frame/two-row colored PNG in temporary storage, freezes, explicitly approves and publishes a distinct synthetic identity via existing services. Normal startup never calls it; no committed/generated assets, schema/migrations, delivery authority, new domain behavior or architecture decision. Reused pinned Sharp 0.34.5 as a content-CLI dev dependency, with frozen-lock install verified. No ADR required.
- Added two controlled-clock Chromium tests against real published content: pause/resume keyboard control, stepping/row positioning, loop wrap, one-shot completion/restart, reduced-motion no-autoplay/manual frames, inactive step and synthetic document-visibility cleanup/resume. Updated authoring/accessibility docs and roadmap detail without accepting pending gates.

### Actual validation

| Executed command | Result |
|---|---|
| `mise exec -- pnpm --filter @doodleforge/content-cli add -D sharp@0.34.5 --save-exact`; `mise exec -- pnpm install --frozen-lockfile` | PASS: existing pinned Sharp reused; lockfile consistent. |
| `mise exec -- pnpm exec playwright test tools/browser-tests/animation-playback.spec.ts` | Final PASS: 2 Chromium tests after correcting test seed identity creation and shared-sheet loading lifecycle. |
| `mise exec -- pnpm test:e2e` | PASS: 19 Chromium tests, built studio with temporary migrated SQLite/storage and actual publication services. |
| `mise exec -- pnpm test` | PASS: 206 tests / 13 files. |
| `mise exec -- pnpm check` | PASS: TypeScript/Svelte, 0 errors / 0 warnings. |
| `mise exec -- pnpm build` | PASS: studio/worker production builds; normal local build origin restored after browser harness. |
| `mise exec -- pnpm lint` | FAIL: only the two pre-existing explicit-any findings at `packages/contracts/src/create-fixtures.ts:68–69`, unchanged. |
| `mise exec -- pnpm format:check`; `git diff --check` | PASS including final docs. |

Initial targeted execution failed before tests because the new seed lacked an authoring identity; corrected via the existing fixture identity repository operation. Next execution failed both tests on stuck loading when animations share a sheet; fixed image lifecycle, then targeted and full browser suites passed. No test/security assertion weakened.

### Remaining acceptance and next steps

Phase 5 remains **in progress**, not accepted. Controlled-clock tests are not manual temporal/visual quality review; synthetic visibility events are not OS background-tab verification. No screen-reader/child-observation/manual/Godot/startup/smoke/remote-CI checks ran. Comprehensive accessibility and child-usability acceptance remain pending. Remaining approval/rejection/publication mutations require separately explicit scope authorization; generation/workflows remain unavailable. Next: user tryout/manual checklist feedback or explicitly scope review mutation services/UI and their gate tests. No phase advancement.

## Phase 5 — focused accessibility recovery increment (2026-10-24)

### Scope and implementation

- Inspected clean Git status, required plans/progress, studio/testing plans, authoring guide, editor/styles and browser regressions. Selected a bounded Phase 5 accessibility follow-up; no approval/rejection/publication mutations, Phase 6 generation or later phases. No dependencies, persistence, routes, domain rules or architectural decisions changed; no ADR required.
- Mutation errors focus the named error summary after controls re-enable unless metadata validation can focus the first invalid field. Added body-type error associations, upload policy description, keyboard-visible focus for programmatically focused headings/summaries, and New-character focus after archive or reload of an externally archived selection. Input retention and stale/uncertain mutation blocks remain unchanged.
- Removed live-region role from per-keystroke unsaved-input text; working/success status and failure alerts remain. Added missing animation-option each-block key, resolving that existing lint finding. Corrected stale plan 06 comparison/playback wording.
- Extended Chromium assertions for archive/removal focus recovery, stale/network/upload failure focus, upload description, hidden-panel control exclusion and current-step semantics. Added `docs/phase-5-accessibility.md` with outstanding manual keyboard/screen-reader/zoom/contrast/child-observation checks, not executed acceptance evidence.

### Actual validation

| Executed command | Result |
|---|---|
| `mise exec -- pnpm exec playwright test tools/browser-tests/characters.spec.ts tools/browser-tests/guided-flow.spec.ts` | PASS: 5 tests at initial checkpoint, before adding external-archive case. |
| `mise exec -- pnpm test:e2e` | PASS: final 17 Chromium tests against built studio and isolated migrated SQLite/storage, including new external-archive case. |
| `mise exec -- pnpm test` | PASS: 206 tests / 13 files. |
| `mise exec -- pnpm check` | PASS: final TypeScript/Svelte, 0 errors / 0 warnings. |
| `mise exec -- pnpm build` | PASS: studio/worker production builds; restores normal local build origin after browser harness. |
| `mise exec -- pnpm lint` | FAIL: only two pre-existing explicit-any findings in `packages/contracts/src/create-fixtures.ts:68–69`; unchanged. |
| `mise exec -- pnpm format:check`; `git diff --check` | PASS; final checks include documentation updates. |

### Remaining acceptance and next steps

Phase 5 remains **in progress**, not accepted. Focused browser assertions are not a comprehensive accessibility audit, screen-reader announcement review, observed child-usability acceptance or manual visual review. No startup/smoke/Godot/manual/remote-CI tests ran in this increment. Approval/rejection/publication mutations remain separately gated; generation/workflows remain unavailable. Next: execute and record manual accessibility/usability checks with user feedback, or obtain explicit scope authorization for review/publication mutations. No silent phase advancement.

## Phase 5 — reliable local studio tryout increment (2026-10-24)

### Scope and implementation

- First ran `git status --short --branch`, then inspected this progress file. Initial edits in the character editor, contracts exports/schema extraction, comparison browser test, authoring docs and plans 04/12/13/14 (plus untracked `packages/contracts/src/manifest.ts`) were preserved. No reset, discard, stage or commit. Read AGENTS, plans README/01/06/11/12/14, setup/authoring instructions and relevant recorded local-config/framework decisions; inspected home/editor boundaries, shared config, database readiness, dev supervisor and smoke/browser harnesses. Some initially guessed plan/config filenames did not exist; located and read the actual files before editing.
- Recommended the smallest usability step: make the existing app easier to start rather than adding another authoring feature. Added `pnpm dev:studio` (studio only, no worker needed for existing authoring) while retaining `pnpm dev` for studio + worker health lifecycle. Supervisor reuses root `.env`/shared server validation and enforces the documented matching loopback host/port/origin requirement, retains strict studio-port binding and child shutdown, and prints a library URL/capability summary only after the requested services pass health checks. Errors point to environment/ports and explicit migration recovery. No implicit migrations, seeds, jobs, AI, approvals, publication, dependencies or new storage/security policy. No architectural decision changed; no ADR added.
- Replaced the obsolete Phase 1-only README with accurate run/try instructions. Expanded setup troubleshooting and roadmap annotation; no Phase 5 checkbox/gate advanced. `pnpm db:migrate` remains explicit application of existing migrations, not a new migration. Setup preserves an existing `.env` and no longer requires a synthetic seed.
- Added `tools/dev.test.mjs` / `pnpm test:startup`: seven real isolated dev-launcher tests cover invalid/mismatched config before DB creation, unmigrated DB refusal, studio-only startup despite occupied worker port, empty library/no implicit seed, metadata persistence after restart, healthy combined startup, SIGINT/SIGTERM port cleanup, occupied studio port and combined worker failure cleanup. All DB/storage writes are OS-temporary test data, not local user data.

### Actual validation

| Executed command | Result |
|---|---|
| `mise exec -- pnpm test:startup` | PASS: 7 Node test-runner integration tests, real Vite/SQLite/worker processes on isolated loopback ports. |
| `mise exec -- pnpm check` | PASS: TypeScript/Svelte, 0 errors / 0 warnings. |
| `mise exec -- pnpm test` | PASS: 206 tests / 13 files (startup tests are a separate command). |
| `mise exec -- pnpm build` | PASS: production studio/worker. Rebuilt again after browser tests to restore the normal local build origin. |
| `mise exec -- pnpm test:smoke` | PASS: built HTTP publication/security/history/corruption/operator checks, worker lifecycle and actual combined dev supervisor SIGINT cleanup/readiness. |
| `mise exec -- pnpm test:e2e` | PASS: 16 Chromium tests, preserving editor/upload/history/comparison and origin/security regressions on isolated data. |
| `mise exec -- pnpm lint` | FAIL: 3 existing worktree findings: `apps/studio/src/routes/characters/+page.svelte:767` missing each-block key, and `packages/contracts/src/create-fixtures.ts:68–69` explicit-any. These paths were not changed by this increment. The startup test's initial missing-error-cause finding was corrected; final lint reports no findings in this increment's files. |
| `mise exec -- pnpm format:check`; `git diff --check` | PASS. Targeted Prettier used only on this increment's paths. |

Initial startup runs caught an incorrect root-level Vite path and a test-only occupied-port server keeping sockets open; corrected the app-local Vite path and test teardown. The first test run timed out; no leftover test/dev processes remained afterward. A subsequent worker-failure assertion used the wrong existing event spelling; corrected to `worker.start_failed` and reran all seven successfully. Failure assertions now check the actual database/port/worker cause rather than generic launcher advice alone.

### Remaining work and limits

- Phase 5 remains **in progress**, not accepted. Approval/rejection/publication mutations still require explicit authorization. Comprehensive accessibility audit and observed child-usability acceptance remain pending; automated Chromium and startup checks are not either acceptance.
- New characters can save metadata/choices and private original art but have no generated/frozen/released content. Read-only history/comparison requires existing snapshots/ready releases; startup never fabricates them. Generation/workflows remain unavailable (Phase 6 not started).
- Readiness is a bounded startup health check, not continuous monitoring or a content-integrity audit. The studio-only command still uses valid shared config (including a distinct configured worker port), but does not bind or require a worker listener. Public/hosted use remains unsupported. No Godot, manual graphical, screen-reader, observed-child or remote-CI tests ran in this increment.
- Next: try the documented local guided flow with real user feedback; separately scope accessibility/child-usability verification or explicitly authorize remaining review mutations. Keep outstanding lint findings visible without altering the preserved worktree changes.

## Browser contract import fix (2026-10-24)

- User reported a real browser runtime failure: `Cannot access "node:crypto.createHash" in client code`, with SvelteKit HMR warning. Traced it to the comparison editor importing `characterManifestSchema` from the contracts root, which also imports Node crypto/filesystem/path validators.
- Moved the exact shared schemas to `packages/contracts/src/manifest.ts`; root contracts re-exports them, preserving existing consumers. Added explicit `@doodleforge/contracts/manifest` package subpath and changed browser editor to import from it. No schema was duplicated or altered. Recorded ADR-030 and documented the client/server import boundary in plan 04.
- Validation after correction: `mise exec -- pnpm check` PASS (0 errors/warnings); `mise exec -- pnpm test` PASS (206 tests / 13 files); `mise exec -- pnpm build` PASS (studio/worker; client build no longer emits Node built-in externalization warnings); `mise exec -- pnpm test:e2e` PASS (16 Chromium tests, including comparison); `mise exec -- pnpm format:check` and `git diff --check` PASS. Production browser build and browser E2E confirm the reported `node:crypto` client failure is resolved.

## Phase 5 — side-by-side frozen animation comparison increment (2026-10-24)

### Scope and implementation

- First ran `git status --short --branch` (clean `main...origin/main`) and inspected this progress file before further reading. Preserved all worktree contents; no reset, discard, stage or commit. Read AGENTS, roadmap/progress, plans README/04/05/06, authoring/upload docs, and ADRs 026–029 (recorded in plan 13); inspected the guided editor, frozen history DTO, shared manifest animation contract, private original route, ready-release asset route and isolated Playwright/SQLite/storage harness. The requested `plans/04-character-package.md` does not exist; the applicable normative plan is `plans/04-character-asset-contract.md`.
- Added responsive current-original/frozen-art comparison to the existing Review and history step. Original artwork is fetched only from the existing owner-checked private preview route and explicitly labeled current mutable authoring art, not necessarily the source of the frozen version. Frozen sprite sheets are fetched only through the existing ready-release content route; approved-but-unreleased versions still receive no image delivery. No new route, storage access, schema, or persistence.
- Animation data is parsed with shared `characterManifestSchema`; choices, sheet geometry, frame count, FPS and loop behavior use the selected frozen manifest. Keyboard-native animation/frame/restart controls reflect those values. Automatic playback honors `prefers-reduced-motion`, follows loop/one-shot behavior and is cleaned up when the review step/version becomes inactive. Loading, unavailable and failed-image states are explicit and never substitute versions/assets. Generation/workflows remain unavailable; review and publication remain read-only.
- Added real Playwright coverage in `history-review.spec.ts` using the existing isolated migrated SQLite/storage setup: owner-vs-stranger private-preview access, ready frozen animation selection/controls, reduced-motion behavior, private/frozen preview failure, 390px no-overflow layout, and retention of unsaved text while browsing. Existing history/review and private upload regressions remain.
- Updated the Phase 5 authoring guide and roadmap. No architectural decision changed; no ADR was added.

### Actual validation

| Executed command | Result |
|---|---|
| `mise exec -- pnpm check` | PASS: TypeScript/Svelte, 0 errors / 0 warnings. |
| `mise exec -- pnpm exec playwright test tools/browser-tests/history-review.spec.ts` | PASS: 4 Chromium tests, including new comparison coverage and existing history regressions. |
| `mise exec -- pnpm test:e2e` | PASS: 16 Chromium tests against the built studio and isolated migrated SQLite/storage. |
| `mise exec -- pnpm test` | PASS: 206 tests / 13 files. |
| `mise exec -- pnpm build` | PASS: production studio and worker builds. |
| `mise exec -- pnpm format:check`; `git diff --check` | PASS. |

Initial targeted browser runs caught and corrected stale still-preview expectations, an ambiguous accessible locator, a request-interception path typo, and assertion ambiguity while loading; final targeted and full suites above passed. Build/browser emitted existing bundler notices about Node-only contract imports; no check/build failures resulted.

### Remaining acceptance / limitations

- Phase 5 remains **in progress**, not complete. Approval/rejection/publication mutation UI and its confirmation/gate tests remain unimplemented and require explicit authorization. Comprehensive accessibility audit and observed child-usability acceptance remain pending; Chromium keyboard and narrow-layout assertions are not those acceptance criteria.
- Current fixture animations each have one frame; tests verify manifest-driven selection and frame controls with existing data, not multi-frame temporal visual acceptance. No Godot, manual visual, screen-reader, child-usability or remote-CI tests were run. Generation/workflows remain Phase 6 and unavailable.

## Phase 5 — guided responsive authoring increment (2026-10-24)

### Scope and implementation

- First command was `git status --short --branch`: clean `main...origin/main`. Inspected current progress first, then AGENTS, plans README/05/06/12, authoring/upload docs and ADRs 026–029; inspected editor/remotes/domain validation, original ownership/confined reads, ready-content route and isolated browser harness. Preserved all prior evidence; no reset, discard, stage or commit commands. Phase 5 remains **in progress**.
- Added three guided steps on `/characters`: Character details → optional Private original → Review and history. New identities explicitly save metadata before later steps unlock. Step buttons/Previous/Next focus the heading; inactive panels stay mounted so text, unknown legacy choices and selected files survive. Saving is explicit, separate from uploading. No implicit save/newer-revision retry; stale/uncertain outcomes retain their existing mutation block. Server field validation focuses the first invalid field after controls re-enable.
- Added a local-input summary labeled separately from immutable snapshots, unsaved status, stacked narrow layout and wrapping hashes. Switching identities/New with unsaved fields/files requires discard confirmation; cancelling retains step/input. Leaving warns via navigation guard (native browser unload prompt where supported). This is in-memory retention, not autosave or recovery after confirmed leave.
- Private original links/previews and ready-release-only frozen still preview retain their existing routes/authority. No new delivery, storage key/path, original exposure, unpublished-art route, contracts, persistence, migration, domain mutation or policy change. No ADR required: UI-only implementation of existing boundaries. Review/approval/publication remain read-only; generation/jobs remain unavailable.
- Added `tools/browser-tests/guided-flow.spec.ts`: keyboard-only guided create/edit and unsaved step traversal at 390×844, no horizontal document overflow, local summary, selected-file/choice retention and cancelled discard/page navigation. Existing suites now traverse real panels; expanded stale-cross-step retention, pending step disablement and invalid-field focus checks. Existing upload/validation/errors/private preview/release authority tests remain real built-studio checks with isolated migrated SQLite/storage.
- Smoke initially exposed a pre-existing obsolete home-copy expectation claiming uploads were unavailable. Updated only that assertion to the actual read-only/generation boundary; did not alter home behavior or relax security assertions.

### Actual validation

| Executed command | Result |
|---|---|
| `mise exec -- pnpm check` | PASS: TypeScript/Svelte, 0 errors / 0 warnings. |
| `mise exec -- pnpm test` | PASS: 206 tests / 13 files. |
| `mise exec -- pnpm test:e2e` | PASS: 15 Chromium tests, real built studio and isolated migrated SQLite/storage. Initial run: 14 passed, 1 new keyboard test raced async heading focus; added a focus wait, then full suite passed on subsequent runs. |
| `mise exec -- pnpm build` | PASS: production studio and worker builds. |
| `mise exec -- pnpm test:smoke` | Initial FAIL on obsolete home-copy assertion; after correcting the expectation, PASS: published-only HTTP/security/history/corruption/operator and process lifecycle checks. |
| `mise exec -- pnpm lint` | FAIL only on existing explicit-any errors at `packages/contracts/src/create-fixtures.ts:68–69`; unchanged. |
| `mise exec -- pnpm format:check`; `git diff --check` | PASS. Targeted `mise exec -- pnpm exec prettier --write` used on changed code/test paths. |

### Exactly what remains for Phase 5 acceptance

1. Genuine side-by-side original/frozen artwork comparison and generated-animation playback. This increment retains a published-only still and adds no unpublished art delivery; broader delivery needs separate authorization/design.
2. Real approval/rejection/publication UI mutations and their browser gate/confirmation tests, **only with explicit user authorization**. Current authoritative review/history/release presentation remains read-only; Phase 5's real review/publish interaction acceptance is not met.
3. Comprehensive accessibility verification and observed child-usability review of the guided flow, including broader responsive/manual/screen-reader evidence. Focused Chromium keyboard and 390px layout checks do not constitute either acceptance.

Generation/persisted job progress/retry/cancel remain unavailable and belong to Phase 6. No workflow, AI, offline, Godot, manual graphical, remote CI, screen-reader or observed child-usability tests ran here. Browser unload warnings are platform-dependent, not a durable draft mechanism. Known lint findings remain; no new blocker to a separately authorized bounded Phase 5 follow-up.

## Phase 5 — verified read-only review/history UI increment (2026-10-24)

### Scope and implementation

- Began with `git status --short --branch`: `main...origin/main` plus the already-modified authoring/remotes/contracts/database/docs/plan/browser paths and untracked contract/browser tests. Preserved the worktree; no reset, discard, stage or commit command was run. During this task, `HEAD`/`origin/main` advanced to `f4f604f` (`Latest`), which contains those initially modified paths; the current remaining diff is this increment. Read the requested plans and Phase 4/5/setup docs, then inspected the existing editor/remotes, history service/repository, review/publication services, private-original and published-content boundaries, and browser harness before implementation.
- Added read-only review presentation to frozen history: latest manifest-hash-bound decision and optional note, append-only decision history, and ready-release membership are displayed independently. Approval without ready membership is explicitly not published. No approval/rejection/publication controls or domain mutations were added.
- Added a minimal still preview only when the frozen manifest is listed in at least one ready release. Its first animation asset is requested through the existing published-content route, which resolves membership and validated bytes; no storage key/path, private original, or unpublished asset is delivered. Approved-but-unpublished versions explicitly have no preview. No migration or ADR change; this implements the existing policy.
- Editor explicitly states generation/jobs are unavailable until Phase 6 and that no job is queued/running and retry/cancel are unavailable. The browser harness now seeds isolated synthetic review fixtures (approved Comet without a release; Sprout v1/v2 with ready release membership) for deterministic browser checks.
- Added service coverage for empty/missing/archived identity history, ownership, immutable frozen snapshot display, and approval-versus-ready-publication membership. Added real Chromium coverage for keyboard version selection, immutable snapshot metadata, approved-unpublished versus published, validated published preview load, empty/archive history, pending/errors, and retaining unsaved authoring values while browsing.
- Updated authoring/setup documentation and roadmap annotations. Phase 5 remains **in progress**. No generation/workflow, fake actions, manual child-usability claims, migration or broader asset-delivery route was added.

### Actual validation

| Executed command | Result |
|---|---|
| `mise exec -- pnpm exec vitest run apps/studio/src/lib/server/characters.test.ts` | PASS: 32 tests. One initial run exposed the test service missing its optional history repository; corrected setup and reran. |
| `mise exec -- pnpm check` | PASS: TypeScript/Svelte, 0 errors / 0 warnings. Initial check found template narrowing errors; corrected and reran. |
| `mise exec -- pnpm exec playwright test tools/browser-tests/history-review.spec.ts` | PASS: 3 Chromium tests. Initial iterations caught test keyboard/locator assumptions; corrected and reran. |
| `mise exec -- pnpm test` | PASS: 206 tests / 13 files. |
| `mise exec -- pnpm test:e2e` | PASS: 13 Chromium tests, real built studio and isolated migrated SQLite/storage. |
| `mise exec -- pnpm build` | PASS: production studio and worker builds. |
| `mise exec -- pnpm test:smoke` | PASS: real built HTTP publication/security/history/corruption/operator and process-lifecycle checks. |
| `mise exec -- pnpm format:check`; `git diff --check` | PASS. |
| `mise exec -- pnpm lint` | FAIL only on the two existing explicit-any findings at `packages/contracts/src/create-fixtures.ts:68–69`; unchanged. |

The first full browser run with six workers had one intermittent upload-input failure while all tests shared the suite database. The harness uses one isolated database with fixed review fixtures, so Playwright now runs serially (`workers: 1`); the final 13-test suite passed. This is a test-isolation adjustment, not a product behavior change.

### Remaining Phase 5 acceptance / limitations

- A full responsive creation wizard and genuine side-by-side original/generated comparison are not implemented. Frozen generated-art preview is intentionally unavailable for unpublished review snapshots; delivery remains strictly through the existing ready-release authority. The published preview is a single still, not animation playback.
- Full accessibility audit and observed child-usability review remain pending; automated keyboard interactions are not evidence of either. No manual graphical, Godot, remote-CI or Phase 6 generation/job tests were run.
- No approval or publication mutation controls exist in this increment; users can inspect authoritative decisions/releases only. Phase 5 remains in progress and its broader acceptance is not inferred.

## Phase 5 — read-only frozen-version history increment (2026-10-23)

- Preserved the pre-existing worktree changes (creative-choice increment and browser tests); did not reset, discard or stage unrelated work. Read requested plans/docs and inspected snapshot/approval/release persistence, publication authority, private asset confinement and existing editor/remotes.
- Added same-app history remote query. The domain service validates identity ownership and excludes archived/missing identities. Repository returns frozen versions ordered newest-first with append-only decisions and only ready-release membership. UI explicitly selects a frozen version and displays its manifest hash, immutable manifest metadata, decision history and ready release IDs/times; authoring inputs remain independent. Empty, loading/error, corrupt snapshot and no-ready-release states are honest. Labels separate mutable authoring metadata/private original fixture from frozen content; no frozen binary delivery, approval/publication mutations or public file exposure added.
- The history view uses frozen manifest metadata as persisted; review approval and ready release membership are independent. No schema/migration/ADR change.
- Frozen manifests are rendered only when their stored SHA-256 matches; absent/corrupt bytes are explicitly unavailable. No filesystem paths/storage keys are returned. The editor's original preview remains private mutable authoring content, not a frozen/generated preview. No approval or publication mutation, migration, public binary route or ADR change.
- Actual validation: `mise exec -- pnpm check` PASS (0 errors / 0 warnings); `mise exec -- pnpm test` PASS (205 tests / 13 files); `mise exec -- pnpm test:e2e` PASS (10 existing Chromium tests); `mise exec -- pnpm build` PASS (studio and worker); `mise exec -- pnpm format:check` PASS; `git diff --check` PASS. A first check found Svelte const placement; fixed before passing check. Browser suite did not yet add assertions for history selection, empty/error states or unsaved-draft preservation while browsing; the passing 10 tests are existing coverage, not those new behaviors.

## Phase 5 — supported creative-choice editing increment (2026-10-23)

### Implementation and policy

- Read AGENTS, plans README/04/05/06/08/11/12/14, setup/authoring/upload docs and ADRs 026/027/028; inspected executable melee contracts, authoring schemas, catalog tables/seed/snapshots, repositories/migrations, CharacterService, remotes/JSON APIs, upload/private delivery and isolated SQLite/browser harnesses. Initial `git status --short` was clean. No unrelated work discarded, commits or resets.
- Recorded ADR-029 **before implementation**: fighting style accepts `unselected` or `light_melee`; power accepts `none` only. Runtime implements light melee, no special-power executor; ability tables are scaffolding, not supported powers. Choices are authoring intent, not new combat semantics or automatic manifest mapping. No arbitrary executable configuration, generated art, versions, version abilities, jobs, approvals or releases created.
- Shared browser-safe definitions/strict validation extend existing create/update schemas without changing manifest metadata schemas. Metadata-only create clients retain `unselected`/`none` defaults. Choice-only/mixed PATCH uses the same conditional identity update/revision as metadata/archive/upload. Omitted choices are preserved. Existing text columns suffice: **no migration**, earlier migrations unchanged.
- Existing editor reuses its body-type input, adds labeled keyboard-native fighting-style/power selects and explicit authoring/runtime limitation copy. Unknown legacy stored strings are labeled unsupported, never normalized; unchanged choice fields are omitted from edits, so metadata-only edits preserve them. Deliberate replacement requires a supported value. Existing thin remotes and JSON API remain intact.
- Pending/validation/transport/stale handling retains choices as well as text. No silent newer-revision retry. Deliberate reload replaces local choices with the current snapshot. Upload keeps unsaved creative intent without submitting it; stale attachment preserves local choices. Immutable original/preview bytes and archive/publication isolation remain unchanged.
- Updated authoring guide, plan 06, roadmap annotations and ADR-029. Phase 5 remains **in progress**, not accepted. Live progress contains a newer historical Phase 3 manual-acceptance entry than the supplied summary; preserved it and all older deferred evidence unchanged. This increment runs no graphical/active-AI test and infers no new manual acceptance.

### Actual validation

| Executed command | Actual result |
|---|---|
| `mise exec -- pnpm test` | PASS: **205 tests / 13 files** (185 prior + 20 new). Strict allowed/unsupported/unknown/type/configuration validation, defaults, choice-only/mixed persistence/restart, legacy preservation/replacement, separate-connection edit/archive CAS, upload/choice conflict in both directions including decode-time mutation, immutable originals and frozen approved/published snapshot isolation. |
| `mise exec -- pnpm check` | PASS including final rerun: strict TS/Svelte **0 errors / 0 warnings**. |
| `mise exec -- pnpm test:e2e` | PASS on both runs: **10 Chromium tests** against real built studio and migrated temporary SQLite/storage. Choice selection/save/reload, single body input, keyboard navigation through selects, tampered unsupported-power server validation/field error/local retention, pending/error selection retention, stale metadata/archive/upload and deliberate reload; prior private preview/origin/bounds tests retained. |
| `mise exec -- pnpm build`, `mise exec -- pnpm test:smoke` | PASS: production studio/worker builds and real HTTP publication/security/history/corruption/operator/lifecycle regressions. |
| `mise exec -- pnpm content:schema`, `git diff --exit-code -- packages/contracts/schema packages/database/migrations` | PASS: generated game schemas and all migrations unchanged. |
| `mise exec -- pnpm lint` | FAIL only the **two pre-existing explicit-any errors** at `packages/contracts/src/create-fixtures.ts:68–69`; no new findings. |

Final `mise exec -- pnpm format:check` and `git diff --check`: PASS. Final `mise exec -- pnpm test` rerun: PASS, 205 tests / 13 files. No application test/tooling blocker or failed application test run in this increment. Targeted Prettier formatting performed on changed paths.

### Remaining acceptance / next actions

- Full Phase 5 remains incomplete: accessible full wizard/child-usability review, version/history/side-by-side/generated-animation previews, seeded review/approval/publication UI, job UI boundaries and broader a11y acceptance. Next bounded increment can address read-only seeded version/review presentation before deliberate approval/publication controls.
- Special power is deliberately limited to None. More styles/powers require explicit catalog/runtime policy and matched executable contracts/executor tests, not speculative presets. Legacy unknown strings remain authoring data, not executable capabilities.
- No new Godot, manual graphical/active-AI, remote CI, real AI, workflow/generation or offline tests run. No upload-to-generation E2E/full factory/Phase 5 acceptance claim. Build/runtime ORIGIN must still match; built adapter still needs `BODY_SIZE_LIMIT=10551296`. Browser harness leaves ignored build output configured for its test origin; rebuild for normal local use. Existing local trust/privacy/orphan/aggregate-quota limitations and lint findings remain.

## Phase 3 — manual playtest acceptance recorded (2026-10-23)

- Updated the Phase 3 manual checklist from the user-confirmed observations already recorded in `docs/phase-3-playtest.md` and historical playtest notes: shadow/jump presentation, Y-sort, movement/facing/attack feedback, recovery/hit behavior, both fixtures, restart/KO, and completion of both active-AI waves. No new playtest or code change is claimed in this documentation update.
- Marked the Phase 3 roadmap verification item complete. Human shadow/Y-sort/feel review and active-AI playthrough are accepted based on those documented confirmations.
- Retained limitations: airborne/elevated-target miss was not visually exercised because enemies did not jump; exact engine/platform details were not reported. Initial difficult-combat feedback and later improvement remain documented. No tuning was made.
- Validation: documentation consistency review; no application tests run (documentation-only update).

## Phase 5 — safe private original upload/preview increment (2026-10-23)

### Implementation and policy

- First command was `git status --short --branch`. Preserved all initially observed tracked/untracked paths, including metadata UI/remotes, browser harness and Phase 3 feedback. No reset, discard or commit. Read AGENTS, plans README/04/05/06/08/11/12/14, setup, authoring guide and ADRs (especially 026/027); inspected UI/remotes/services/repositories/schema/migrations/storage/helpers/routes/test harnesses before stating the bounded approach.
- Shared upload policy/input schemas; explicit binary route caps actual streamed bytes before bounded in-memory multipart parsing (10 MiB file + 64 KiB envelope framing). Sharp verifies magic/MIME and full strict decode up to 20 megapixels; container checks additionally reject concatenated/MPO JPEG images that a single-image decoder might ignore. Rejects spoofing, malformed/truncated/undecodable/oversized images, animation/multipage/APNG and compressed PNG ancillary metadata (pixel bounds cannot bound metadata decompression).
- Additive `0003_boring_black_cat.sql`/Drizzle snapshot adds immutable asset/source records, selected original reference and ownership/immutability guards. Earlier SQL migrations untouched. Exclusive generated keys, exact original bytes/SHA-256, flushed/read-only files before transactional adoption; separate EXIF-oriented metadata-stripped PNG preview within 1024×1024 without enlargement. Crashes/conflicts can leave inaccessible private orphan files; no destructive GC.
- ADR-028 settles replacement: shared authoring revision CAS adopts both assets plus selection atomically; previous pairs retained. Metadata/archive/concurrent attachment cannot silently overwrite one another. Upload does not submit unsaved text, alter publication or fabricate versions/jobs. Archive hides private authoring access without deleting originals/revoking published content (ADR-027).
- Private image routes resolve original ID plus owning non-archived character, follow the immutable preview source, reject arbitrary keys/paths/unsafe roots/symlinks/nonregular files/size/hash corruption. Private no-store/nosniff/same-origin/sandbox delivery; no public/static storage exposure. Metadata remotes/JSON APIs remain intact (ADR-026 binary exception). Native Sharp stays external as a production dependency.
- Editor now supports keyboard attach/replace, real preview/original link and preview errors. Pending prevents overlap; validation/stale/uncertain errors retain text/file selection. Success retains unsaved metadata and updates the actual revision/selection. Stale/uncertain results require deliberate reload. Creative choices, generation, versions/review/publishing remain explicitly unavailable.
- Added `docs/phase-5-uploads.md`, setup/authoring/plan 06 policy updates and ADR-028. Adapter-node needs `BODY_SIZE_LIMIT=10551296` in its process environment for the intended envelope; env example, built command and isolated browser harness updated. Default 512K remains safe but more restrictive; matching build/runtime ORIGIN still required.

### Actual validation

| Executed command | Actual result |
|---|---|
| `mise exec -- pnpm db:generate` (initial and recheck) | PASS: additive 0003 generated; recheck reports no schema changes. Prior SQL migrations unchanged. |
| `mise exec -- pnpm --filter @doodleforge/image-processing add sharp@0.34.5 --save-exact`, studio workspace/Sharp additions, `mise exec -- pnpm install --frozen-lockfile` | PASS: existing pinned Sharp reused; no external version upgrades. |
| `mise exec -- pnpm exec vitest run apps/studio/src/lib/server/originals.test.ts` | PASS at initial focused checkpoint: **11 tests**; final suite has **12 upload tests** after extra confinement coverage. Real migrated temporary DB/storage and Sharp. |
| `mise exec -- pnpm test` | Final PASS: **185 tests / 12 files**. Limits/MIME/animation/truncation/decoded overflow, exact original bytes/hashes, preview orientation/dimensions/metadata, SQL immutability, confinement/corruption/restart and separate-connection concurrent/stale attachment/edit/archive cases; publication/metadata regressions retained. |
| `mise exec -- pnpm check` | Final PASS: strict TS/Svelte, **0 errors / 0 warnings**. |
| `mise exec -- pnpm test:e2e` | Final PASS: **9 Chromium tests**, real built studio/migrated temporary DB/storage. Keyboard upload, preview/replacement/history/private bytes, preview failure, unsaved text/file retention, stale attachment, pending/uncertain failures and built HTTP origin/adapter/route bounds. All six prior browser tests retained. |
| `mise exec -- pnpm build`, `mise exec -- pnpm test:smoke` | PASS after native externalization fix: studio/worker production builds and real HTTP publication/security/history/corruption/operator/lifecycle regression. Browser harness additionally rebuilds for its isolated origin. |
| `mise exec -- pnpm lint` | Final FAIL only the **two pre-existing explicit-any errors** at `packages/contracts/src/create-fixtures.ts:68–69`; unrelated findings preserved. |
| `mise exec -- pnpm format:check`, `git diff --check`, `git diff --exit-code -- packages/database/migrations/0000_zippy_lord_hawal.sql packages/database/migrations/0001_dusty_wind_dancer.sql packages/database/migrations/0002_absent_morg.sql` | PASS: formatting/whitespace and prior SQL migration preservation. |

Initial failures corrected: test Sharp dependency resolution/Blob typing, identical animation fixture frames optimized away, incorrect archive test DTO, and historical baseline test using today's schema-bound seed (test now uses historical SQL and retains upgrade/history/FK assertions, plus checks null original reference). Built smoke exposed bundled Sharp native resolution; externalized as a production dependency and rebuilt/reran smoke/browser successfully. Built HTTP oversized upload initially returned 503 because adapter stream status 413 became an unknown failure; mapped only that size status to structured 413, then reran all nine browser tests, checks and 185 Vitest tests successfully. New test formatting lint issue fixed. No weakened origin protection/error allowlist.

### Remaining acceptance and limitations

- Phase 5 remains **in progress**, not accepted. Remaining: creative choices/wizard; version/history/generated-animation/side-by-side previews; seeded review/approval/publication UI; real job boundaries and broader a11y/child-usability review. No Phase 6 generation/workflows, real AI or Phase 8 offline work advanced; no upload-to-generation E2E claim.
- Phase 3 manual graphical/active-AI acceptance remains deferred, **not passed by this increment**; previous feedback/evidence preserved below. No new Godot/manual/remote CI/power-cut/other-platform tests run.
- No browser/tooling blocker. Local loopback trust only, no hosted authentication/ownership; per-request bounds are not aggregate quotas. Compressed PNG metadata is restricted. Private orphan cleanup/retention remains unimplemented. Set ORIGIN and adapter limit explicitly. Existing lint findings remain.

## Phase 5 — metadata library/editor UI increment (2026-10-23)

### Implementation and boundaries

- First command: `git status --short --branch`; initial tracked edits in `docs/phase-3-playtest.md` and this progress file preserved. No reset, discard or commit. Read AGENTS, plans README/04/05/06/08/11/12/14, setup, authoring guide and ADRs (especially 026/027); inspected studio shell/config, contracts, CharacterService/repositories, API tests/routes and browser harness before stating the small implementation approach.
- Added `/characters`, linked from home: metadata-only library, create/edit form for name/description/body type, persisted revision labels and deliberate two-step archive with Cancel-first keyboard focus. No fabricated version/job/publication status. Creative choices, upload/preview, generation, versions/review and publishing remain explicitly unavailable in this UI. Archive still does not revoke published content; service/repositories/JSON API unchanged.
- Enabled pinned Svelte experimental async and Kit remote functions. Thin library query and metadata commands dispatch to CharacterService; shared contracts remain schema source and supply body-type options. Structured validation/domain errors retain input; stale edit/archive conflicts block resubmission until deliberate reload/reselection. Reload explicitly discards selected local edits, never silently retries against a new revision. Pending controls prevent overlapping actions; transport failures retain input, explain uncertain commit status and require deliberate reload before retry. Query failures preserve input and permit recovery.
- Verified installed framework APIs. Initial real-browser failures exposed adapter-node 6 ignoring runtime ORIGIN and defaulting inferred protocol to HTTPS. Configured Kit 3 build-time `paths.origin` from validated local config; origin protections remain enabled. Builds explicitly require the intended ORIGIN at build and runtime; documented compatibility in ADR-026/setup. No dependency, migration or publication-policy changes.
- Browser harness builds for the test origin, migrates a fresh OS-temporary DB/storage tree and cleans it on shutdown. Added structured-result unit tests and real Chromium tests for persistence, escaped text, keyboard create/edit/archive, validation, cancel/confirmation, stale edit/archive, pending controls, uncertain transport failure, query recovery and wrong/missing origin rejection. Updated shell smoke expectation for the now-available metadata UI.

### Actual validation

| Executed command | Actual result |
|---|---|
| `mise exec -- pnpm check` | PASS: strict TS/Svelte, **0 errors / 0 warnings**. Initial attempts exposed import resolution and persisted body-type typing; corrected without schema duplication. |
| `mise exec -- pnpm test` | PASS: **173 tests / 11 files**, including 3 new structured-result tests and existing real-DB authoring/API/publication regressions. |
| `mise exec -- pnpm test:e2e` | PASS: final **6 Chromium tests**, real built studio and migrated temporary SQLite/storage. Earlier runs failed on origin compatibility and a test focus-timing assumption; corrected config/test synchronization, then reran all successfully. No browser tooling blocker. |
| `mise exec -- pnpm build` | PASS: production studio/worker builds. Browser harness additionally rebuilds studio for test origin. |
| `mise exec -- pnpm test:smoke` | PASS: real HTTP publication/security/history/corruption/operator and studio/worker lifecycle regression. Initial run failed only on obsolete shell copy assertion; updated to honest metadata UI availability text and reran successfully. |
| `mise exec -- pnpm lint` | FAIL: final only two pre-existing explicit-any errors at `packages/contracts/src/create-fixtures.ts:68–69`. Initial run also caught new navigation/each-key lint issues; corrected those, leaving unrelated findings untouched. |
| `mise exec -- pnpm format:check` and `git diff --check` | PASS. Targeted formatting only; initial playtest/progress evidence preserved. |

### Remaining acceptance / next actions

- Phase 5 remains **in progress**, not accepted. Remaining: creative choices/wizard; bounded decoded upload/private previews/immutable originals; version/history/animation previews; seeded review/approval/publication UI; real job UI boundaries and broader accessibility coverage. Choose a separate bounded follow-up; do not advance to workflow/generation, real AI or offline bundles.
- Automated Chromium keyboard/interactions are verified, not a complete a11y audit, manual child-usability review, factory E2E or graphical/game acceptance. Phase 3 manual graphical/active-AI acceptance remains deferred and **not passed**. No new Godot/manual/remote-CI tests run; prior Phase 4 evidence below is retained.
- No blocking dependency for another bounded Phase 5 increment identified. Known limitations: origin-specific builds must be rebuilt after changing ORIGIN; local loopback trust only; selecting another entry/New replaces local input (documented); unknown mutation results require checking the library before retry, especially create. Existing lint findings remain.

## Phase 5 — authorized; metadata authoring API increment (2026-10-23)

### Scope and implementation

- First command was `git status --short --branch`. Preserved all pre-existing tracked and untracked Phase 4 proof/docs and Phase 3 playtest changes; no reset, discard or commit. Read AGENTS, plans README/04/05/06/08/11/12/14, setup and decisions, then inspected studio shell/config/routes, review/publication/domain services, repositories/schema/migrations, contracts and test conventions before stating a bounded approach.
- User explicitly authorized Phase 5 following locally verified Phase 4 acceptance, including the data-only second-character live-addition proof. Phase 3 manual graphical shadow/Y-sort/feel and human active-AI acceptance remain deferred and **not passed**.
- Implemented metadata-only character create/list/get/edit/archive JSON API. Shared browser-safe authoring schemas own name/description/body type and revision inputs; manifest metadata reuses the same fields without changing generated content schemas. Domain service owns validation/defaults/conflict classification; repositories own conditional edit/archive persistence; routes only dispatch through bounded transport/error handling. No migration required.
- New identities have unselected fighting style/no power, not fabricated executable abilities. Creative-choice catalog/inputs are intentionally incomplete. Archive is non-destructive and never unpublishes; frozen snapshots/approvals/ready membership are unchanged (ADR-027). The API implements the planned JSON protocol, not same-app UI fetching; remote-function/async UI remains future work under ADR-026.
- Mutations require exact same origin and JSON; strict shared schemas, a 16 KiB streamed body limit, fatal UTF-8/JSON rejection, safe revision bounds, no-store/nosniff responses and sanitized structured errors with request IDs. Added 27 real migrated-SQLite route/domain tests, including two-connection CAS conflicts, no resurrection, unchanged historical content, chunked body cancellation, validation and mutation protection. Updated setup and `docs/phase-5-authoring.md`; Phase 5 checklist remains incomplete.

### Actual validation

| Executed command | Actual result |
|---|---|
| `mise exec -- pnpm install --lockfile-only`, then `mise exec -- pnpm install --frozen-lockfile` | PASS: workspace manifest/lock links updated for explicit runtime contracts/Zod imports; no external version upgrades. |
| `mise exec -- pnpm exec vitest run apps/studio/src/lib/server/characters.test.ts packages/contracts/src/contracts.test.ts packages/database/src/database.test.ts` | PASS: final **43 tests / 3 files** (initial run before the last two tests: 41). |
| `mise exec -- pnpm check` | PASS: final TypeScript/Svelte, **0 errors / 0 warnings**. Initial check failed on exact optional properties and partial test event typings; corrected the new code/tests, then reran successfully. |
| `mise exec -- pnpm test` | PASS: **170 tests / 10 files**. |
| `mise exec -- pnpm build` | PASS: production studio and worker builds. |
| `mise exec -- pnpm test:smoke` | PASS: existing real built HTTP publication/security/history/corruption/operator and studio/worker lifecycle regression; not a new authoring browser E2E. |
| `mise exec -- pnpm content:schema`, then `git diff --exit-code -- packages/contracts/schema` | PASS: generated content schemas unchanged after metadata reuse. |
| `mise exec -- pnpm lint` | FAIL: only existing explicit-any errors in `packages/contracts/src/create-fixtures.ts:68–69`; left unchanged. |

### Remaining acceptance and blockers

- Phase 5 is **in progress**, not accepted. Remaining: creative choices; bounded decoded upload/private previews/immutable originals; library/wizard/editor; version/history/animation previews; seeded review/approval/publication UI; honest unavailable job UI boundaries; Playwright keyboard/a11y/mutation coverage. Next bounded slice can add same-app library/editor UI over this service or separately implement upload persistence/limits.
- No new browser, manual, graphical, Godot or remote CI tests run in this increment. Prior Phase 4 verification remains recorded below; Phase 3 manual acceptance is still deferred. No claim of full CRUD UI, upload-to-generation E2E or Phase 5 acceptance.
- No blocking dependency for the next metadata UI slice identified. Existing lint failures remain. Factory/job execution, real AI and offline bundles are explicitly not implemented or advanced (Phases 6/7/8).
- Final `mise exec -- pnpm format:check` and `git diff --check`: PASS. Targeted Prettier formatting was run only on this increment's code/docs paths. Final Git status still contains all initially observed tracked/untracked paths; `docs/phase-3-playtest.md` also gained further external changes during this session and was not edited by this increment.

## Phase 4 — data-only second-character live-addition proof (2026-10-23)

### Scope and implementation

- Inspected initial `git status --short --branch` first. At that point the working tree had existing edits to arena/game tests, Phase 4 docs/plans, setup and plan 06. Preserved them without reset/discard. During validation those previously modified paths became part of the observed `HEAD` (`726795a Finalising phase 4`, also at `origin/main`); this session did not run a commit command. The final status also contains a separate `docs/phase-3-playtest.md` modification, preserved and not made or modified as part of this task. This task's implementation changes are the test-only seed/harness, one new test, and Phase 4 docs/roadmap/progress.
- Read AGENTS, plans README/03/04/09/11/12/14, Phase 4 API/publication/repository/runtime/arena/cache guides, and ADR-019–026. Inspected source fingerprint coverage, real built-studio publication harness, arena polling/Refresh, fixtures and existing hostile-peer/cache/published arena regressions. Approach: start isolated real SQLite/studio with only Sprout published, then add/publish Comet after the arena has discovered its one-entry catalog, invoke the exact production poll/candidate activation path, and prove selection plus gameplay while unchanged game source fingerprints are checked.
- Test-only runtime seeding now has an `add-comet` action; initial harness setup publishes Sprout only. New `apps/game/tests/published_addition.gd` checks initial one-entry discovery/playability, old catalog retention before polling, release/catalog replacement after Comet publication, selectable generic-fighter load, movement, starting a match against Sprout, data-driven damage, and shared pinned release. It is deterministic and bounded; it calls the poll handler directly rather than sleeping for the five-second timer. The actual periodic cadence and busy-tick policies remain covered in the existing arena suite.
- The real built-studio harness runs addition proof before the existing published-factory and published-arena regressions. Subsequent existing regressions start with both members and retain hostile-peer/cache and real published arena coverage. Fingerprints verify gameplay/project/scene sources unchanged through publication/tests. No gameplay implementation, fixture asset, contract or policy changed; no ADR change required. Marked the Phase 4 and plan 09 second-character checklist items complete and updated arena documentation. Phase 5 remains unauthorized.

### Actual validation

| Executed command | Actual result |
|---|---|
| `mise exec -- pnpm test:godot:api` | PASS: builds studio/worker, then verifies Godot 4.7.2.stable.arch_linux.ed1daf0bf and matching official Linux templates. Startup 3 + gameplay 57 + resources 26 + hostile-peer content 102 + cache 69 + live-addition 13 + real published factory 47 + published arena 88 = **405 assertions**. Real built studio/SQLite approval/publication; source fingerprint check passed; existing cache, hostile-peer and arena regressions retained. |
| `mise exec -- pnpm test` | PASS: 143 tests / 9 files. |
| `mise exec -- pnpm check` | PASS: TypeScript/Svelte, 0 errors / 0 warnings. |
| `mise exec -- pnpm format:check` | PASS. |
| `git diff --check` | PASS. |

An initial live-addition test attempt exposed test assumptions about the pre-load label and the arena replacing its player on Start; corrected only the test to identify Comet by contract ID and reacquire the active player after Start. The final complete integration run above passed. Existing expected native malformed-PNG and malformed-Unicode diagnostics are still emitted by their negative tests; no broad Godot error allowlist was added.

### Status and limits

- Phase 4 checklist acceptance is now verified locally, including adding new catalog membership after discovery (not merely revising an existing member). This does not authorize Phase 5; wait for explicit user phase authorization.
- Phase 3 manual graphical shadow/Y-sort/feel and active-AI human playthrough remain deferred and **not passed**. No offline bundle/export or manual visual acceptance is claimed. Existing lint findings are unrelated and were not changed.

## Studio framework guidance update (2026-10-23)

- Updated plan 06 and `docs/setup.md` to prefer Svelte experimental async support and remote functions for same-app studio loading, queries and mutations wherever applicable. Kept stable public HTTP contracts and unsupported streaming/binary interactions on explicit routes; documented experimental API compatibility/testing cautions.
- Added ADR-026. No application code or framework configuration changed; remote functions are guidance, not an implemented feature claim.
- Validation: documentation review; `mise exec -- pnpm format:check` PASS; `git diff --check` PASS. No application tests run because no code/config changed.

## Latest Phase 4 increment — safe-boundary automatic catalog polling (2026-10-23)

### Policy and implementation

- First command was `git status --short --branch`: clean `main` tracking `origin/main`. Preserved the existing manual-refresh increment; no reset, discard or commit. Read AGENTS, plans README/03/04/09/11/12/13/14, all requested Phase 4 guides and ADR-019–024, then inspected arena, repository, built-studio harness and current refresh tests. Stated the bounded approach before editing.
- API mode now polls every five seconds using an arena-owned Timer. Timer ticks outside gameplay physics and are best-effort: if loading or a match is active, that tick is dropped, not queued. The existing repository snapshot is never mutated. Eligible poll and explicit Refresh share the independent candidate repository/factory/catalog/player preparation and atomic safe-boundary activation path; the shared loading gate rejects overlap.
- Empty catalogs and candidate errors retain prior repository/release/catalog/selection/player and report an explicit error; no fallback or revision substitution. A subsequent eligible tick or explicit Refresh can retry. Fixed cadence is used (no exponential backoff); timer lifetime ends with the arena. Default fixture mode and opt-in cache unchanged.
- Updated API/repository/arena docs, plan 09, roadmap and ADR-025. Targeted integration assertions cover five-second cadence, poll/manual rejection during loading and combat, failure retention through the real built-studio catalog-corruption path, and initial polling failure without fixture fallback. Both fixture characters remain prepublished: this does not prove adding a new character to an active catalog.

### Actual validation

| Executed command | Actual result |
|---|---|
| `mise exec -- node tools/godot-validation/run.mjs --published-api` | PASS: Godot 4.7.2.stable.arch_linux.ed1daf0bf and matching official Linux templates; 3 startup + 57 gameplay + 26 resources + 102 hostile-peer content + 69 cache + 47 real published factory + 88 real published arena assertions (392 total by sum). Built studio/SQLite/publication and existing cache/hostile-peer and real arena regressions retained. |
| `mise exec -- pnpm test` | PASS: 143 tests / 9 files |
| `mise exec -- pnpm check` | PASS: TypeScript/Svelte; 0 errors / 0 warnings |
| `mise exec -- pnpm format:check` | PASS |
| `git diff --check` | PASS |

### Remaining status

- Polling/manual-refresh coordination is implemented and headless tested; broader data-only live-addition proof remains unchecked. Phase 4 remains incomplete; Phase 5 unauthorized. Phase 3 graphical/active-AI acceptance remains deferred, not passed. No offline bundle, fallback, authoring UI or unrelated combat/lint work.

## Previous Phase 4 increment — coordinated manual catalog refresh (2026-10-23)

### Policy and implementation

- Initial `git status --short --branch` was clean on `main`; preserved repository contents and made no commits/resets. Read project instructions, roadmap/progress, plans 03/04/09/11, requested Phase 4 guides and ADR-019–023; inspected API repository pinning/cache, factory/resource lifecycle, arena gates/match lifetime, hostile-peer suite and built-studio publication harness. Stated the approach before editing.
- Added API-mode-only Refresh control. Permitted in idle practice, after loss, or after completion; rejected while active combat or any arena load is in progress. Start/reset/retry and errors do not refresh. No polling.
- Refresh uses an independent candidate repository/factory and candidate catalog. It reconciles selection by character ID (otherwise first entry), then fully creates the replacement player in a hidden staging node so candidate PNGs pass all admission, network/cache integrity and native decoding checks before activation. Empty candidate catalogs and catalog/resource errors retain the prior repository, release, catalog, selection, and fighter; status reports explicit failure. A successful synchronous boundary installs candidate references/catalog/release/player together and then frees the prior fighter. Existing repository snapshots are never mutated. ADR-024 records safe-boundary, lifetime and failure policy.
- Updated arena/repository/API docs and roadmap. Default fixture mode, opt-in cache policy, generic fighter/combat implementation unchanged. This proves replacement of an active catalog after publication but does **not** claim the separately scoped data-only second-character live-addition acceptance: harness publication modifies Sprout revision with both characters already present.

### Actual validation

| Executed command | Actual result |
|---|---|
| `mise exec -- node tools/godot-validation/run.mjs --published-api` | PASS: 3 startup + 57 fixture gameplay + 26 resources + 102 hostile-peer content + 69 cache + 47 built-studio published factory + **86 published arena assertions**. Real built studio/SQLite/publication; verifies refresh rejection during loading and active match, selection reconciliation, successful resource-ready replacement, previous-state retention and explicit error on corrupted candidate index; existing cache/hostile-peer and arena regressions retained. |
| `mise exec -- pnpm test` | PASS: 143 tests / 9 files |
| `mise exec -- pnpm check` | PASS: strict TS and Svelte, 0 errors / 0 warnings |
| `mise exec -- pnpm format:check` | PASS |
| `git diff --check` | PASS |
| `mise exec -- pnpm lint` | NOT RUN in this increment; previous known lint issue remains two explicit-any errors in `packages/contracts/src/create-fixtures.ts:68–69`. |

### Remaining status

- Manual refresh/catalog replacement slice verified. Automatic polling remains a distinct pending follow-up. Broader data-only second-character live-addition proof remains unverified; no second character was added to an already discovered catalog in this harness.
- Phase 4 remains incomplete; Phase 5 not authorized. Phase 3 graphical/active-AI acceptance remains deferred, not passed. No fallback, offline bundle, authoring UI, or unrelated combat/lint work.

## Current phase
**Phase 5 — explicitly authorized and in progress; metadata API/remote-function guided three-step editor, immutable private uploads/previews, conservative creative-choice editing, frozen history and read-only review/publication presentation locally verified. Side-by-side current-original/ready-release frozen-animation comparison is implemented with focused browser coverage (latest entries above); authorized approval/publication mutations and comprehensive accessibility/child-usability acceptance remain incomplete. No unpublished frozen-art delivery is added.** Phase 4 acceptance remains locally verified, including data-only live addition after catalog discovery. Phase 3 manual shadow/Y-sort/feel and human active-AI acceptance are recorded complete; elevated-target behavior remains an untested limitation (plan 14; docs/phase-3-playtest.md). Phases 0–2 retain their previously recorded local status.

## Phase-gate exception — explicit user authorization
The latest user instruction explicitly authorizes **Phase 5**, preserving the deferred Phase 3 acceptance requirements. The following records the earlier Phase 4-only authorization, not the current gate.

The user explicitly authorized starting **Phase 4 only** while deferring Phase 3 manual graphical playtesting. This supersedes the earlier “Do not begin Phase 4” instructions below, not Phase 3 acceptance requirements. Manual shadow/Y-sort/feel review and a human active-AI playthrough remain unchecked in [docs/phase-3-playtest.md](../docs/phase-3-playtest.md). **Phase 5 is not started.**

## Latest Phase 4 increment — opt-in bounded validated PNG disk cache (2026-10-23)

### Scope and implementation

- First command: `git status --short --untracked-files=all`. Preserved all existing tracked/untracked changes; no reset, discard or agent commit. Read AGENTS, plans README/03/04/09/11/12/13/14, all requested Phase 4 guides and ADR-019–022. Inspected repository/validator/resource builder/factory, arena lifetime/loading/retries and hostile-peer/real built-studio harnesses before stating the bounded approach. No dependencies, schemas, migrations, combat tuning or phase expansion.
- Added `scripts/content/asset_disk_cache.gd`: opt-in 16-slot direct-mapped PNG byte cache, fixed confined names, 16 MiB maximum payload, 64-byte hash tag, bounded header/payload reads, no runtime directory enumeration, same-directory complete temp/flush/close/rename installs. Exclusive synchronous operation lock, bounded interrupted-temp cleanup, explicit corruption/FS failures, symlink/directory refusal. ADR-023 documents layout/policy tradeoffs and trusted ordinary-local-file limitations; [cache guide](../docs/phase-4-godot-cache.md) specifies disk caps, reads, eviction, manual stale-lock recovery and failure behavior.
- Repository still fetches/validates online index/manifests and pins its release. Every hit is revalidated against that manifest's length/hash/PNG header/dimensions. Corrupt entries are removed and current load fails; only deliberate retry fetches exactly the same pinned asset. No automatic fallback, cache disablement, revision substitution or resource-validation bypass. Existing resource builder/admission/native decode and generic fighter unchanged. Disk eviction cannot invalidate loaded resources.
- Arena enables cache only with explicit `--content-cache` in API mode. Default fixture/API behavior and original 74-assertion real published arena regression retained. The cache does not add persistent catalog authority, polling, refresh, active swap, export packaging, offline bundles or Phase 5.
- Added **69 cache assertions**: unsafe key/name, read/write limits, exact bytes, complete atomic install, failed install preserving old entry, collision eviction, wrong-length/short/oversized/same-length hash corruption, temp interruption, stale/concurrent lock refusal, filesystem obstruction, symlink entry/root confinement, fixed slot count, real HTTP cold/hit/new-instance authority, unlisted revision refusal, deliberate retry, dimensions revalidation and runtime decode. Hostile-peer request counts prove exactly two asset downloads (initial and deliberate retry), with no hidden HTTP repair. Real built-studio factory suite retains its original 43 assertions and adds four for cold/repeated cached generic-fighter creation and pinned pixels/release.

### Actual commands and results

Runner verified Godot **4.7.2.stable.arch_linux.ed1daf0bf** and both actual matching templates **4.7.2.stable.official.ed1daf0bf**; pins unchanged. pnpm/Node commands use the existing `mise exec --` toolchain.

| Executed command | Actual result |
|---|---|
| `mise exec -- pnpm test:godot:api` | PASS after test API fixes: studio/worker rebuild and **374 assertions** (3 startup + 57 gameplay + 26 resource + 102 content + 65 cache + 47 published factory + 74 published arena), real publication/pinning/corruption/retry and unchanged source fingerprints across publication/tests |
| Final `mise exec -- node tools/godot-validation/run.mjs --published-api` | PASS: **378 assertions**, including final expanded **69 cache** assertions and all original real published arena regressions |
| `mise exec -- pnpm test` | PASS: **143 tests / 9 files** |
| `mise exec -- pnpm check` | PASS: strict TS, Svelte **0 errors / 0 warnings** |
| `mise exec -- pnpm test:smoke` | PASS: built published HTTP/security/ETag/history/corruption/operator audit and studio/worker lifecycle regressions |
| `mise exec -- pnpm lint` | FAIL: only unchanged explicit-any errors at `packages/contracts/src/create-fixtures.ts:68–69` |
| `mise exec -- pnpm format:check`, `git diff --check` | PASS |
| Manual graphical/active-AI playtest, offline bundle, export, remote CI, power-cut/other-OS/hostile concurrent filesystem mutation | NOT RUN |

Initial runner caught GDScript's reserved `namespace` parameter; renamed before successful runs. A later run caught calling non-static `DirAccess.create_link` statically in the new symlink test; corrected the test to use a directory instance. No engine diagnostic allowlist relaxed; expected existing corrupt-PNG/Unicode diagnostics remain limited to their original rejection suites.

### Remaining limitations / next actions

1. **Separate next Phase 4 follow-up:** coordinated refresh/catalog replacement; polling/manual refresh only with that explicit ownership/lifetime policy. Current arenas, resets and retries still retain their original release; no automatic refresh.
2. Data-only second-character **live-addition** proof remains unchecked: both fixtures exist before discovery, and mid-match revision publication proves retention, not active-catalog membership replacement. Phase 4 remains incomplete; Phase 5 is not authorized/started.
3. This is only encoded asset reuse, not an offline bundle/source or global resident-memory quota. Trusted local ordinary files required; Godot lacks race-free no-follow/nonblocking file opens. No power-loss durability guarantee. Stale lock requires stopping cache users and deliberate inspection; no expiry/takeover. Unknown external files are not scanned/deleted or included in the managed disk bound.
4. Phase 3 manual graphical/active-AI acceptance remains deferred, **not passed**. Existing two lint errors remain unrelated. Shutdown cancellation, schema export packaging, offline/fallback and aggregate memory enforcement remain separate work.

## Previous Phase 4 increment — pinned published-API arena discovery/selection (2026-10-23)

### Scope and implementation

- First command was `git status --short`; preserved all existing tracked/untracked published API, Node, editor/gameplay, repository/validation and runtime/factory work. No reset, discard, commit, phase expansion, engine/toolchain/dependency/migration/schema changes or combat tuning. Read AGENTS, plans README/03/04/09/11/12/13/14, all four requested API/publication/repository/runtime guides and ADR-019/020/021. Inspected arena selection/reset/waves/HUD, generic fighter, fixture loader/shared fixtures, repository/factory/resource builder, publication/review services and engine/process/API harness before stating the small implementation approach.
- `apps/game/scripts/arena.gd`: default fixture launch and existing regression tests retained; explicit `--content-api[=loopback-origin]` mode creates one repository/factory and owns one validated catalog for the entire arena lifetime. Selection resolves only catalog entries; API players and enemies use the existing generic factory. Initial labels use short IDs/version; successful selection displays validated name/version. No fixture substitution, per-character scripts/scenes, package-path URLs, or changes to fighter/combat/AI timing.
- Discovery/selection/reset/wave refills have explicit loading state/messages and disabled controls. A programmatic overlap gate rejects actions rather than queuing/superseding loads; input/AI pause while awaiting resources. Errors stop/clear the whole match, zero health, display error codes and allow explicit discovery/selection/match retry. Start does not refresh, including after errors or match completion. One pinned release covers all fighters, matches and resets within that arena; new instances may discover newer releases. ADR-022 records this deliberately narrower policy.
- Added `apps/game/tests/published_arena.gd` (**74 assertions**) to the existing real built-studio harness, retaining its **43** factory assertions. Uses the actual launch argument, migrated isolated SQLite and explicit approvals/publications of both fixtures. Exercises selection, resources/distinct art, input movement/jump, HUD, timed/deduplicated melee independent of art FPS, overlap rejection (including wave refills), bounded waves/completion/loss, reset and revision retention after actual Sprout v2 approval/publication. Separate new arena sees v2; original still uses v1. Corrupt/restored real ready catalog and Comet asset prove discovery/player/enemy errors, no partial match/fallback and explicit recovery. Test-only loopback control server only coordinates publication/corruption, never serves/proxies content. Existing source fingerprints must remain identical across publication/test. Process and await deadlines/cleanup remain bounded.
- Added [API arena guide](../docs/phase-4-godot-arena.md); synchronized current integration/API/runtime/publication guides, roadmap and decisions without deleting prior evidence. The broader data-only second-character **live-addition/refresh** checkbox remains unchecked: both fixtures existed before discovery; the later publication changes a revision, not an active catalog's membership.

### Actual commands and results

All pnpm/Node commands used the existing `mise exec --` toolchain (Node **26.12.1**, pnpm **10.34.7**). Runner verified engine **4.7.2.stable.arch_linux.ed1daf0bf** and both matching Linux export templates **4.7.2.stable.official.ed1daf0bf** before engine work; pins unchanged.

| Executed command/check | Actual result |
|---|---|
| Initial `mise exec -- pnpm test:godot:api` | Studio/worker builds and existing **231** engine/API assertions passed; new arena assertions passed but runner correctly FAILED on test teardown freeing an HTTP signal emitter in its completion stack. Fixed only test cleanup to deferred node disposal; no diagnostic allowlist relaxed. |
| Final `mise exec -- node tools/godot-validation/run.mjs --published-api` | PASS: headless import, **3 startup + 57 fixture gameplay + 26 resource + 102 content + 43 published factory + 74 published arena = 305 assertions**; real studio/SQLite/publication and unchanged publication/test source fingerprints. |
| Final `mise exec -- pnpm test:godot:api` | PASS: rebuilt studio/worker and reran all **305 assertions**, real publication/corruption/retry/pinning and source fingerprint checks |
| `mise exec -- pnpm test` | PASS: **143 tests / 9 files** |
| `mise exec -- pnpm check` | PASS: strict TS, Svelte **0 errors / 0 warnings** |
| `mise exec -- pnpm test:smoke` | PASS: built HTTP published routes/ETags/HEAD/history/privacy/corruption, operator audit and studio/worker health/restart/signals/dev cleanup |
| `mise exec -- pnpm lint` | FAIL: only unchanged known explicit-any errors at `packages/contracts/src/create-fixtures.ts:68–69` |
| `mise exec -- pnpm format:check`, `git diff --check` | PASS |
| Browser/manual graphical playtest, exported game, offline bundle, remote CI | NOT RUN |

Expected native corrupt-IDAT diagnostics remain confined to the existing resource rejection tests; existing malformed Unicode vectors still emit expected diagnostics. New real API/arena suites emit no engine/script errors.

### Remaining limitations / next task

1. Plan cache, coordinated refresh/catalog replacement and fallback separately; none added. No polling, disk cache, bundle/export packaging, shutdown cancellation or global resident-resource quota. Host must outlive awaits; development checkout and loopback API remain the supported source. An empty validated catalog stays pinned; relaunch after publication rather than interpreting Start as Refresh.
2. Broader second-character/live-update acceptance remains incomplete. This proves both prepublished fixtures selectable/playable in the arena and no mid-match revision mixing, not new-character discovery via live catalog swap. Phase 4 remains incomplete; Phase 5 has not started.
3. Phase 3 human shadow/Y-sort/feel and active-AI playthrough acceptance remains deferred, **not passed**. Wave completion here is deterministic/headless; active human playability and reported combat difficulty are not newly accepted or tuned. Existing publication/API limitations and two lint errors remain.

## Previous Phase 4 increment — bounded runtime resources and CharacterFactory (2026-10-23)

### Scope and preserved work

- First command was `git status --short`; preserved all tracked/untracked published API, Node upgrade, editor/gameplay and repository/validation work. Read AGENTS, plans README/03/04/09/11/12/13/14, publication/API/repository guides and ADR-019/020; inspected repository/validator, fixture/gameplay, shared contracts/vectors, publication/read services and existing engine/process/HTTP harnesses before stating this small approach. No phase expansion, combat tuning, dependencies, migrations, schema changes or engine changes.
- Added `character_resources.gd`: shared-schema/semantic validation and whole-package admission **before asset requests**, at most 32 MiB declared encoded bytes and 128 MiB conservative pixel working allowance charged at 16 bytes/pixel. Serial fetch/decode of all declared assets; own input snapshot across awaits. Exact length/hash/actual IHDR limits rechecked before native decoding. Bounded PNG container scan refuses APNG, malformed/trailing containers, excessive chunks, compressed metadata/unknown ancillary chunks. Native PNG decode must succeed with matching nonempty dimensions; RGBA8 ImageTextures, shared per-sheet row-major AtlasTextures and manifest FPS/count/loop SpriteFrames. ADR-021 records the deliberately stricter runtime admission/subset policy and its non-global limitations.
- Added `character_factory.gd`: repository-only boundary, serial whole loads, owned combat data, existing generic fighter scene, stats/resources/foot anchor and pinned release metadata. No fighter is instantiated until all resource work succeeds. Existing fighter/arena/fixture scripts and scenes remain **unchanged**; normal arena is still fixture-fed, not API-selectable.
- Added **26 resource assertions**: real runtime multiframe/multirow pixels and regions, shared textures, FPS/loops, factory stats/anchor/owned data, busy behavior, encoded/pixel preflight before reads/no spawn, actual IHDR limits, hash/length, compressed metadata/APNG, hash-valid corrupt IDAT native rejection and failed-native-decode no-partial-fighter behavior. Runner permits only three explicit known native PNG diagnostic messages in this negative-test suite; script and unrelated engine errors still fail.
- Added `test:godot:api` and isolated migrated SQLite/explicit fixture approval/publication/built-studio harness. **43 real API-to-Godot assertions** verify both fixtures' ImageTexture/atlas/frames, stats, distinct art, pinned release, generic scene, movement, separate jump elevation, startup/active/deduplicated melee despite changed art FPS, and unpublished revision refusal. SHA-256 fingerprints prove gameplay/project/scenes/fixture loader unchanged across publication/test. This is headless API fighter playability, **not** normal-arena selectability, live addition/refresh acceptance or the entire Phase 4 gate. Test-only seed is not a production publication CLI or startup bypass.
- New [runtime guide](../docs/phase-4-godot-runtime.md); repository/API/publication guides, plan 09, roadmap and decisions synchronized. Earlier repository evidence remains below.

### Actual commands and results

All pnpm commands used `mise exec -- pnpm <command>` on the existing Node **26.12.1** / pnpm **10.34.7** toolchain. Runner verified installed Godot **4.7.2.stable.arch_linux.ed1daf0bf** and both actual matching Linux templates **4.7.2.stable.official.ed1daf0bf** before engine work. Pin unchanged.

| Executed command/check | Actual result |
|---|---|
| `test:godot` | PASS: headless import, **3 startup + 57 gameplay + 26 resource + 102 content assertions** |
| `test:godot:api` | PASS: studio/worker build, all above engine regressions, isolated real published studio API → Godot **43 assertions**, gameplay source fingerprints unchanged |
| Final `mise exec -- node tools/godot-validation/run.mjs --published-api` after resource input-snapshot hardening | PASS: all **231 assertions** (3 + 57 + 26 + 102 + 43), real built API and source fingerprints |
| `test` | PASS: **143 tests / 9 files** |
| `check` | PASS: strict TS and Svelte **0 errors / 0 warnings** |
| `test:smoke` after built API run | PASS: real published-route/ETag/history/privacy/corruption/operator audit, studio/worker health/restart/signals/dev cleanup regressions |
| `format:check`, `git diff --check` | PASS |
| `lint` | FAIL: only known unchanged explicit-any errors at `packages/contracts/src/create-fixtures.ts:68–69` |
| `git diff --exit-code -- apps/game/project.godot apps/game/scenes apps/game/scripts/fighter.gd apps/game/scripts/fixtures.gd apps/game/scripts/arena.gd apps/game/scripts/enemy_brain.gd mise.toml .github/workflows packages/database/migrations packages/contracts/src/index.ts packages/contracts/schema` | PASS: existing gameplay/editor sources, pins, migrations, shared schemas/source unchanged |
| Browser/manual graphical playtest, exported game, offline bundle, remote CI, measured/global memory stress | NOT RUN |

No failed test run in this increment. The intentional two corrupt-IDAT tests emit native libpng/ERR_FILE_CORRUPT/ERR_PARSE_ERROR diagnostics while their rejection assertions pass; existing malformed Unicode tests also emit expected diagnostics. Initial successful integration had 20 resource assertions; expanded/hardened to 26 and reran engine/API regressions. No unrelated lint repair.

### Remaining limitations / next task

1. **Next small Phase 4 slice to plan:** wire repository/factory-backed discovery/selection into the arena without URLs in combat, explicit loading/error handling and retention of the match's pinned release. Coordinate any later catalog replacement rather than changing this repository's pin. Normal arena remains fixture-fed; the final roadmap second-character **selectability/live-update** proof is not checked off by this headless test.
2. Bounded validated disk cache, coordinated polling/manual refresh/catalog swap, fallback/error UI, shutdown cancellation, aggregate resident CPU/GPU/cache quotas, export schema packaging, offline bundles and packaging remain pending. Per-load admission is conservative, not a measured global memory guarantee; multiple factories/fighters can exceed it in aggregate. Host/parent must outlive awaits; supported source is the development checkout/loopback API.
3. Phase 3 human shadow/Y-sort/feel and active-AI acceptance remain deferred, **not accepted**. Combat feedback retained without tuning. Phase 4 incomplete; Phase 5 not started. Existing publication/API limitations and two lint errors remain.

## Previous Phase 4 increment — Godot repository/API and supported-v1 validation (2026-10-23)

### Scope and preserved work

- First command was `git status --short`. Existing published-content API changes (tracked and untracked) were present and preserved. Node upgrade and Godot editor/gameplay state were not reverted or altered. Read AGENTS, plans README/03/04/09/11/12/13/14, API/publication guides, ADR-019, existing gameplay/fixtures, shared schemas/semantics/tests and published service before implementing. This increment implements only the fourth Phase 4 roadmap item; no Phase 5 or combat tuning.
- Added `apps/game/scripts/content/{character_repository,api_character_repository,contract_validator}.gd`: RefCounted result boundary; loopback HTTPRequest adapter; one bounded request in flight, five-second timeout, redirects/gzip disabled. JSON capped at 1 MiB, assets at declared contract-bounded bytes. Exact manifest hash checked before parse; identity/semantic validation, declared asset length/hash/IHDR checked before returning bytes. All HTTP routes derive from pinned validated IDs/version/hash, never package paths. No static storage/publication inference.
- First valid full catalog is pinned for the repository lifetime; defensive copies prevent callers altering authority. Unlisted revisions cannot be requested. Validated manifests memoized within that snapshot only; no disk cache. `refresh()` explicitly unsupported, not silent catalog replacement. Gameplay/fighter/fixture loader remain unchanged and fixture-fed.
- Structural validation interprets the existing generated v1 schema keyword subset directly, failing unknown encountered keywords. GDScript mirrors shared semantic checks; release layout additionally matches publisher/API canonical paths. Pinned Zod 4.6.7 counts Unicode code points for schema strings; separate safe-path helper retains JS UTF-16 length cap. Godot converts NUL to U+FFFD, so both are conservatively rejected in paths (documented additional client restriction). ADR-020 records the incremental boundary and future export schema packaging requirement.
- Added **63 shared TS/Godot vectors** (52 manifest, 11 release) covering valid fixtures/parameters/effects/Unicode, strict fields/types/versions/kinds, references/IDs/animations/layout/elevation, paths, numeric/array/map limits and index layout/uniqueness. New Godot content suite uses real HTTPRequest against deterministic local hostile peers: exact route mapping, pinned copies, one in-flight request, missing pin/unlisted/unsafe references, bad manifest hash/identity/version, oversized/malformed/invalid UTF-8 JSON, redirect/503, bad paths/duplicate/overlimit indexes, corrupt/oversized assets and mismatched PNG dimensions. Also checks nonfinite values and correct row ceiling for native GDScript integer layout inputs. **102 content assertions**; HTTP peers are not the real studio.
- [Repository guide](../docs/phase-4-godot-repository.md), API guide, plan 09, roadmap and ADR-020 updated. No dependency, shared schema/semantic source, migration, engine pin or gameplay changes.

### Actual commands and results

All pnpm commands used `mise exec -- pnpm <command>` on Node **26.12.1** / pnpm **10.34.7**. `command -v godot` selected `/usr/bin/godot`; runner verified engine **4.7.2.stable.arch_linux.ed1daf0bf**, version marker and both actual matching Linux templates **4.7.2.stable.official.ed1daf0bf** before import/tests. Pin unchanged.

| Executed command/check | Actual result |
|---|---|
| Initial `exec vitest run packages/contracts/src/compatibility.test.ts` | PASS: initial 44 vectors; later expanded to 63 below |
| Final `test` | PASS: **143 tests / 9 files** (80 existing + 63 shared vectors) |
| Final `test:godot` | PASS: headless import, **3 startup + 57 gameplay + 102 content assertions**; expected Unicode diagnostics for intentionally malformed NUL/UTF-8 cases, rejection assertions pass |
| Final `check` | PASS: strict TS and Svelte **0 errors / 0 warnings** |
| `build`, then `test:smoke` | PASS: studio/worker builds; real built HTTP published routes/ETags/HEAD/history/path/method/privacy/corruption and operator audit regression; health/restart/signal/dev cleanup |
| `format:check`, `git diff --check` | PASS |
| `lint` | FAIL: only the known `packages/contracts/src/create-fixtures.ts:68–69` explicit-any errors, unchanged |
| `git diff --exit-code -- apps/game/project.godot apps/game/scenes apps/game/scripts/fixtures.gd apps/game/scripts/fighter.gd apps/game/scripts/arena.gd apps/game/scripts/enemy_brain.gd mise.toml .github/workflows packages/database/migrations packages/contracts/src/index.ts packages/contracts/schema` | PASS: those tracked sources/pins/schemas unchanged |
| Godot against built studio, browser/manual graphical acceptance, desktop export, remote CI | NOT RUN |

Failures found/corrected: first content runner failed because PackedByteArray has no `sha256_text()`; replaced with HashingContext. A NUL-path case exposed Godot replacement behavior; removed noisy NUL construction from every path check and documented conservative NUL/U+FFFD refusal. A Unicode parity vector exposed an incorrect initial UTF-16-length assumption: inspected installed Zod 4.6.7 checks, corrected schema length to code points and the vector expectation; final TS and Godot suites pass. No unrelated generator lint fix.

### Remaining limitations / next task

1. **Next Phase 4 slice:** bounded PNG decoding, atlas/SpriteFrames and a CharacterFactory using the existing generic fighter, with a Godot-to-real-published-API integration test. Returning verified PNG bytes here does not prove decodability or API playability. Do not expand automatically into cache/polling/refresh or Phase 5.
2. Coordinated catalog replacement/manual refresh/polling, validated bounded disk cache, error/fallback UI, shutdown cancellation, aggregate memory budgets, exported schema resource packaging, bundle implementation and data-only second-character API playability proof remain pending. The host node must outlive each operation; only development checkout resources and loopback HTTP are supported now. Shared vectors are compatibility evidence, not an exhaustive/general JSON Schema certification.
3. Phase 3 human shadow/Y-sort/feel and active-AI acceptance remain deferred, **not passed**. Difficult combat feedback is retained; no silent tuning. Phase 4 incomplete; Phase 5 not started. Existing API/reconciliation limitations and two lint errors remain.

## Previous Phase 4 increment — published-only content API (2026-10-23)

### Inspection, scope and implementation

- First command was `git status --short`: clean checkout. Existing Node upgrade/Godot editor work was already committed; no existing changes were discarded. Read AGENTS, plans README/01/04/05/06/09/11/12/13/14 and publication/review/runtime/repository implementations before implementation. Kept this increment to the third Phase 4 roadmap item and safe operator reconciliation. No Phase 5, Godot API loading, gameplay tuning, schema changes or migrations.
- `PublishedContentService` resolves only DB-ready releases/entries; JSON reads cap at 1 MiB, PNG reads at the contract-bounded declared length. Reads verify real-path confinement, regular files, exact hashes, manifest semantics/identity and PNG header dimensions. Final opens are no-follow/nonblocking (including the existing shared bounded helper). Ready-reference SQL now filters ready state and limits to one row rather than reading all historical references.
- Four thin SvelteKit GET routes expose current index, historical ready index, ready-referenced manifests and manifest-declared PNG hashes. Exact-byte SHA-256 ETags, immutable/revalidating cache policies, HEAD via SvelteKit, weak/list/wildcard conditionals and bodyless 304. Verification happens before ETag evaluation. Missing/unpublished data returns 404, bad parameters 400; corrupt ready representations return explicit sanitized 503 with `no-store`, never repair/fallback or 304. No static storage or arbitrary path route.
- `pnpm content:reconcile` is an explicit operator command, not a startup race. Shared publisher registrations and exclusive maintenance markers gate **all** service publish/reconcile calls; concurrent publishers/CAS remain supported. Refuses active or stale publisher markers before changing preparing rows. Never auto-expires markers, guesses approval, deletes content or activates history. Exit 1 on corrupt ready content/operational failure; exit 0 on clean audit. ADR-019 records read/maintenance boundaries and stale-marker tradeoffs.
- Read-only `@doodleforge/content-publisher/content` export avoids importing Sharp-dependent publication into the studio bundle. Workspace links added only; no external package/version changes. New [API/operator guide](../docs/phase-4-content-api.md); setup/publication/roadmap/plan 09 synchronized.
- **25 added tests**: 21 real-DB/filesystem route/security tests (including replacing a character revision while retaining old ready access, historical indexes/revocation, cross-package hash isolation, hidden preparations/orphans, malformed inputs and missing/hash/oversize/symlink corruption on all three representation types); three maintenance concurrency/stale-marker tests; one live-preparation service exclusion test. Built-process smoke now publishes both fixtures over real SQLite and fetches actual HTTP content, checks methods/encoded paths/private storage, simulates external corruption, and executes clean/corrupt operator audits. This is not Godot second-character runtime proof.

### Actual commands and results

All pnpm commands used **`mise exec -- pnpm <command>`**, selecting Node **26.12.1** (also verified with `mise exec -- node --version`) and pnpm **10.34.7**. No hardcoded Node 22 invocation.

| Executed command/check | Actual result |
|---|---|
| `install --lockfile-only`, `install --frozen-lockfile` | PASS; workspace links only, no external dependency/pin changes |
| `exec vitest run apps/studio/src/lib/server/content.test.ts packages/content-publisher/src/operations.test.ts packages/content-publisher/src/publication.test.ts` | PASS: **41 tests / 3 files** |
| Final `test` | PASS: **80 tests / 8 files** (55 existing + 25 added) |
| Final `check` | PASS: strict TypeScript, Svelte **0 errors / 0 warnings** |
| `build`, then `test:smoke` | PASS: studio/worker builds; real HTTP published-only GET/HEAD/304/history, exact bytes, method/path/private-storage denial, corrupt conditional asset 503; operator clean exit 0/corrupt exit 1; prior health/restart/signals/dev cleanup checks retained |
| Final `format:check`, `git diff --check` | PASS |
| `lint` | FAIL: only the existing explicit-any errors in `packages/contracts/src/create-fixtures.ts:68–69`; unrelated fixes not mixed in |
| `git diff --exit-code -- apps/game packages/contracts mise.toml .github/workflows packages/database/migrations` | PASS: Godot/editor, shared contract, Node/CI pins and migrations untouched |
| Browser tests, Godot tests, manual graphical acceptance, remote CI, power-cut/other-OS tests | NOT RUN in this API increment |

Failures caught and corrected: initial test/check exposed a missing test workspace link and unsupported `$lib` alias assumptions; used surrounding relative-import conventions and added the test dependency. First built smoke failed because root publisher imports bundled Sharp; separate read-only export fixed it. Smoke method assertion initially expected 405 for a form-like POST already rejected with 403 by SvelteKit CSRF; verified both that rejection and JSON POST 405 without weakening framework protections. One new hash-isolation test initially selected a PNG intentionally shared by both fixtures; corrected it to select a genuinely other-package-only declared hash. Final full suite passes. Formatting recheck caught and corrected one long subpath import.

### Remaining limitations and next task

1. **Next Phase 4 increment:** Godot repository interface/API adapter and supported-v1 semantic parity. Then runtime PNG/atlas/SpriteFrames, bounded validated cache, release pinning, polling/refresh/errors and data-only second-character playability proof. None implemented here; Phase 5 remains stopped.
2. Phase 3 manual shadow/Y-sort/feel review and human active-AI wave completion remain deferred, **not accepted**. Human launch/checkerboard feedback is retained below; difficult combat remains a usability concern, not silently tuned.
3. Reconciliation is deliberately manual/operator-controlled, non-destructive and fail-closed on stale operation markers. Stop all publisher/reconciler processes before removing only precise confirmed-stale empty marker directories. No automatic takeover/repair/rollback/GC. Ready-file corruption requires inspection and exact known-good backup restoration; index reads do not audit every descendant asset.
4. Local trusted filesystem/service participation only; hostile concurrent filesystem mutation, authenticated hosting, aggregate HTTP rate/concurrency quotas, other-platform durability and actual process/power-kill recovery remain unverified/unimplemented. Per-representation reads are bounded; no aggregate resource-budget claim. The two pre-existing lint errors remain separately scoped.

## Human prototype feedback — 2026-10-23

User opened the Godot game, reported that it works but combat is very difficult, and then confirmed everything works as expected after clarification that the visible checkerboard fixtures are intentional placeholder art. No missing-texture bug is confirmed. Recorded launch/expected rendering feedback in `docs/phase-3-playtest.md`; difficulty remains a usability concern. This is not evidence of each manual checklist item or human completion of both active-AI waves; those acceptance details remain pending. No code changes or new tests in this feedback-only update; Phase 3 remains not fully accepted and Phase 4 remains in progress.

## Tooling update — user-requested Node 26 (2026-10-23)

- Phase 4 remains in progress; no phase-gate or gameplay changes. Clean working tree at inspection. Read plans README/12/14, setup, CI and ADR-014 before changing tools.
- Replaced Node 22.23.3 with **26.12.1** in mise and all CI jobs; `npm view node version` returned 26.12.1 and `mise install node@26.12.1` succeeded. Root engines now allow `>=26.12.0 <27`, including the previously installed 26.12.0. pnpm remains **10.34.7**; dependency pins/lockfile unchanged. ADR-018 supersedes the old Node selection without rewriting historical evidence.
- Setup, fixture approval and playtest instructions now use ordinary `pnpm` commands. Existing terminals may need to re-enter the directory/restart so mise shell integration refreshes PATH; non-integrated shells can use `mise exec -- pnpm <command>` without a hardcoded Node version.
- The agent shell retained Node 22 in its inherited PATH: an initial plain `pnpm install --frozen-lockfile` correctly failed the new engine check. All successful validation below used `mise exec -- pnpm <command>` to select the updated project toolchain.

| Executed command | Actual result on Node 26.12.1 |
|---|---|
| `install --frozen-lockfile` | PASS; lock unchanged; existing ignored Sharp lifecycle-script warning remains, real Sharp tests pass |
| `rebuild better-sqlite3 esbuild` | PASS; native SQLite loads and all real SQLite tests pass |
| `test` | PASS: **55 tests / 6 files** |
| `check` | PASS: strict TypeScript and Svelte, 0 errors/0 warnings |
| `build`, then `test:smoke` | PASS: studio/worker builds, migrated temporary DB, actual health/private-storage checks, restart/signals/dev cleanup |
| `test:godot` (default installed engine/templates, no overrides) | PASS: engine 4.7.2.stable.arch_linux.ed1daf0bf and both official matching templates; **3 startup + 57 gameplay assertions** |
| `format:check` | PASS |
| `lint` | FAIL: only the existing two explicit-any errors in `packages/contracts/src/create-fixtures.ts:68–69`, left unchanged |

Browser tests, remote CI and manual graphical playtesting were not run. The worker's existing Node 22 build target and Node 22 type definitions remain conservative compatibility baselines; this upgrade adds no Node 26-specific application APIs. Next feature work remains the published-only API described below.

## Latest Phase 4 increment — immutable publication service (2026-10-22)

### Inspection and scope
Verified clean `main` at `2e76932`, matching local `origin/main`; no newer/unrelated changes existed. Read AGENTS and plans README/03/04/05/09/11/12/14 before implementation. Preserved all recovered progress history below. No Phase 5 work, generic fighter/gameplay edits, contract duplication, earlier migration rewrites, original-upload mutation, or engine-pin changes. This implements the existing filesystem-first/DB-activation design, not a new architectural decision.

### Implemented and verified
- `packages/content-publisher/src/publication.ts`: selected frozen snapshot/latest approval check; bounded confined asset reads and exact hash/length checks; full Sharp 0.34.5 PNG decoding with dimensions/RGBA/page/pixel limits; exclusive same-root staging writes, file/directory fsync, immutable package rename and exact-existing-package validation. The original review implementation moved unchanged except helper exports into `review.ts`; package exports remain compatible.
- Additive migration `0002_absent_morg.sql`, Drizzle schema/snapshot, `ReleaseRepository`: preparing/ready/failed releases, immutable entries/history, singleton generation/pointer, SQL immutability/state guards. Activation transaction recomputes frozen manifest hashes, rechecks latest selected approval, inserts complete entries, marks publication and CAS-activates atomically. CAS losers rebuild on latest state (eight-attempt bound), retaining both concurrent character selections. Exact active duplicate requests reuse the ready release.
- Reconciliation service, callable only with publishers stopped: marks interrupted preparations failed without approval guessing; audits staging and unreferenced packages; reports ready-file corruption; deletes nothing and never auto-activates. Explicit retry safely reuses identical orphan packages. Not yet wired to application startup/operator CLI.
- Ready-reference repository lookup is the authority boundary for future routes. No API route/static storage exposure was introduced. Later revocation blocks selecting that revision anew without rewriting historical/inherited ready releases.
- 16 new publisher tests: seven interruption boundaries, post-commit retry, transaction rollback, source corruption, immutable existing-package mismatch, header-valid but undecodable approved PNG, duplicate/concurrent requests, separate-connection CAS conflict/rebuild, activation-time revocation, orphan reuse/audit and corruption reporting. Full suite uses real SQLite, filesystem and Sharp; not an actual OS/power-cut test.
- Documentation: [publication boundary/recovery](../docs/phase-4-publication.md), review boundary updated. Second Phase 4 roadmap item checked only for this verified service/persistence slice; Phase 4 remains incomplete.

### Actual commands and results
Every pnpm command below used `mise exec node@22.23.3 -- npm exec --yes --package=pnpm@10.34.7 -- pnpm <command>`.

| Executed command/check | Actual result |
|---|---|
| `--filter @doodleforge/content-publisher add sharp@0.34.5 --save-exact`, then `install --frozen-lockfile` | PASS; exact dependency/lock updated. pnpm warns Sharp lifecycle script is ignored; installed platform binary loaded and all real decoding tests passed without enabling scripts |
| `db:generate`, then `db:generate` recheck | PASS: generated additive 0002; recheck reports no schema changes; 0000/0001 untouched |
| `test` | PASS: **55 tests / 6 files** (39 existing + 16 publisher tests) |
| `check` | PASS: strict TypeScript; Svelte 0 errors/0 warnings |
| `build`, then `test:smoke` | PASS: studio/worker builds; migrated temp DB, actual health/private-storage 404, restart/signals/dev cleanup |
| `test:godot` with documented `/tmp/doodle-godot` overrides | PASS: engine **and both actual templates** `4.7.2.stable.official.ed1daf0bf`; **3 startup + 57 gameplay assertions**. Phase 3 regression only, not Phase 4 runtime loading |
| Final `test`, `format:check`, `git diff --check` after documentation and stronger old/new release fault assertions | PASS: 55 tests/6 files; formatting/whitespace clean |
| `git diff --exit-code -- packages/database/migrations/0000_zippy_lord_hawal.sql packages/database/migrations/0001_dusty_wind_dancer.sql apps/game packages/contracts` | PASS: earlier migrations, generic gameplay and shared contracts unchanged |
| `lint` | FAIL: only existing explicit-any errors in `packages/contracts/src/create-fixtures.ts:68–69`; unrelated source untouched |
| Browser regression, manual graphical playtest, remote CI, desktop export, power-cut/other-OS durability | NOT RUN |

Initial test run: 51 passed/1 failed because the corruption test tried to overwrite a correctly read-only published file. Corrected the test to deliberately chmod before simulating external corruption; subsequent suite passed (55 tests after added rollback/audit/history coverage). No production permission relaxation was made.

### Remaining blockers / next actions
1. Published-only bounded API/index/manifests/assets, historical ready releases and ETags; wire pre-publisher reconciliation into an appropriate startup/operator path without racing active publishers. Never static-serve storage or infer visibility from file existence. Ready corruption needs an explicit API failure/recovery path, not silent repair.
2. Godot repository/API adapter and supported-v1 semantic parity, runtime PNG/atlas/SpriteFrames construction using the existing generic fighter, bounded validated cache, release pinning, refresh/polling and errors.
3. Data-only second-character publication/selectability/playability through the API, without gameplay source/scene changes. Service tests publishing both fixtures are not this runtime proof.
4. Phase 3 manual shadow/Y-sort/feel review and human active-AI playthrough remain **deferred, not accepted**. Phase 5 is not started. Existing lint errors remain separately scoped. Filesystem durability was exercised only on this Linux host; reconciliation is conservative/manual and no destructive GC is implemented.

## Retained first Phase 4 increment evidence
The following first-increment working-tree description, validation and next actions are historical; the latest publication service entry above supersedes publisher-not-yet-implemented statements.

## Phase 4 working-tree inspection and increment
Initial inspection found the existing Phase 3 changes already uncommitted: project/main/fighter/gameplay/startup, the generic fighter scene, arena/enemy/fixture scripts and UIDs, playtest notes and plans 12/14. Preserved them all. The recovered Phase 0–2 history and initial Phase 3 snapshot below remain intact; earlier clean-tree descriptions refer to the previous session, not this one.

Implemented only the first Phase 4 roadmap item:
- Additive Drizzle migration `0001_dusty_wind_dancer.sql` plus schema/snapshot metadata: frozen manifest JSON/hash, append-only hash-bound approvals and SQL guards for frozen identity/bytes/provenance, child ability rows and published versions. Baseline migration unchanged. Latest approval authority uses a monotonic per-version decision order with UUID decision IDs, avoiding timestamp ties.
- `packages/database/src/snapshots.ts`: persistence repository with immediate short write transactions, idempotent exact duplicate freezes, conflicting revision refusal and atomic decision/status updates. Existing baseline drafts/metadata survive incremental migration without fabricated approvals.
- `packages/content-publisher/src/index.ts`: review domain service using shared contract/semantic validation, bounded manifest/asset reads, hashes, PNG header/dimension checks and real-path confinement. Canonical stored manifest bytes include asset hashes; approvals require the expected exact snapshot hash. Rejection/revocation supersedes old approval, and metadata-only new revisions need new approval.
- Explicit `content:seed` CLI freezes and approves Sprout/Comet through the service. Repeat seed neither overwrites authoring edits nor reverses later rejection/revocation. Original metadata-only `db:seed` unchanged. Seeded approval is **not publication**.
- 12 new review tests plus one incremental migration test, covering gates, concurrent duplicate freezes on separate connections, conflicts, stale hashes, revocation/reapproval visibility, raw-SQL immutability, new-version reapproval, corrupted assets/symlink escape/size/path rejection and two-fixture seed idempotency. Existing contract/gameplay source and fixtures were not changed.
- Operator/service boundaries: [docs/phase-4-review.md](../docs/phase-4-review.md); setup updated. No architectural change or engine-pin change; implements existing plans 04/05/09 and ADR-004/011/015, so no new decision entry.

## Phase 4 actual validation
All commands use the exact pinned invocation shown in the Phase 3 evidence below. Godot provisioning still existed at `/tmp/doodle-godot`; engine **and both actual templates** reverified as `4.7.2.stable.official.ed1daf0bf` using the documented overrides.

| Executed command/check | Actual result |
|---|---|
| `install --lockfile-only`, then `install --frozen-lockfile` | PASS; only workspace dependency links added, no external dependency/pin changes |
| `test -- packages/content-publisher/src/review.test.ts` | PASS, 38 tests/5 files at that point; Vitest treated this invocation as the whole suite, not a targeted-only run |
| Final `test` after incremental-upgrade test | PASS: **39 tests, 5 files** (26 existing + 13 new) |
| `check` | PASS: strict TS and Svelte, 0 errors/0 warnings |
| `build` | PASS: studio adapter-node and worker |
| `test:smoke` after build | PASS: migrated temp DB, real process health/private-storage refusal, worker restart/signals and dev cleanup |
| `test:godot` with `GODOT_BIN=/tmp/doodle-godot/Godot_v4.7.2-stable_linux.x86_64`, `GODOT_TEMPLATE_DIR=/tmp/doodle-godot/templates` | PASS: **3 startup + 57 gameplay assertions**; Phase 3 regression only, no Phase 4 runtime/parity claim |
| `db:generate` (initial generation, then recheck) | PASS; recheck reports no schema changes; committed baseline left untouched |
| Isolated CLI: `db:migrate`, `content:seed`, `content:seed` with temporary storage/DB overrides | PASS: both fixtures approved, same version IDs/hashes/decisions on repeat; temporary tree cleaned |
| `format:check` / `git diff --check` | PASS |
| `lint` | FAIL: only the two pre-existing `no-explicit-any` errors in `packages/contracts/src/create-fixtures.ts:68–69`; left unrelated source untouched |
| Manual playtest, browser regression, remote CI, desktop export | NOT RUN; no claims of acceptance |

Validation failure caught and fixed during this increment: a review migration edit initially placed a table CHECK constraint before later column declarations, causing 20 tests to fail at migration setup. Moved the CHECK after all column declarations, then reran `test` (39 PASS), `check`, `db:generate`, formatting, build, smoke and the twice-run CLI seed successfully. UUID approval IDs are preserved; a separate transactional per-version sequence orders decisions. No applied baseline migration was rewritten.

## Phase 4 acceptance audit / next actions
The first Phase 4 checkbox is implemented and locally verified. Phase 4 is **not complete**. Remaining blockers/tasks, in order:
1. Fully decode/reverify approved assets, stage immutable packages, build complete release snapshots, activate via approval/hash recheck plus generation CAS, reconcile crashes; execute publisher boundary-fault/concurrency tests. Review freezes metadata, not source asset files; publisher must never trust those files without revalidation. `requireApproval()` is a check, not a reservation.
2. Implement published-only bounded immutable API/index routes, historical ready-release visibility and ETags. No content route exists yet.
3. Implement Godot supported-v1 contract parity, repository/API adapter, runtime PNG/atlas/fighter construction, validated bounded cache, pinning, polling/manual refresh and error handling. Existing gameplay remains fixture-fed and generic.
4. Prove second approved fixture becomes selectable/playable from publication with no gameplay source/scene changes. Current seed is not that proof.
5. Keep Phase 3 manual acceptance deferred (not waived); execute the existing manual checklist on a graphical host when available. Resolve unrelated contract-generator lint errors separately. Do not advance Phase 5.

---

## Retained Phase 3 milestone evidence
The following Phase 3 validation and remaining acceptance notes are retained; Phase 4 status and next actions above supersede its earlier phase-start prohibition.

## History recovery and working-tree inspection
The requested checkout is `/home/doink/projects/doodle-forge`, branch `main`, initially at `e219237` (the harness worktree is separate). Both worktrees were clean at inspection: the existing prototype was committed, not an uncommitted diff. No pre-existing files/changes were discarded. `git show fcdf5fe:plans/14-progress.md` recovered the earlier Phase 0–2 tracker, retained verbatim below apart from heading demotion. The old prototype tracker from `e219237` is also retained below. Historical “current/next/not implemented” statements in those snapshots are **not live status**.

## Phase 3 implementation increment
- Generic `apps/game/scenes/fighter.tscn`: ground collision/root, ground shadow, visual pivot and AnimatedSprite2D. No per-character scripts/scenes. Arena actor container is Y-sorted; ground positions clamp to bounds; fixed camera and floor.
- `scripts/fixtures.gd`: two explicit trusted Phase 2 development fixture paths; actual PNG textures, row-major atlas frames, manifest FPS/loop/foot anchors. This is **not** a public package validator or repository implementation; no API, release, cache, publication or bundle work. Full Godot contract parity remains Phase 4.
- `fighter.gd`: normalized movement, independent elevation/visual offset/shadow scale, mirrored facing, idle/walk/jump/attack/hurt/KO states, ground-only light melee. Timing/cooldown and referenced rectangular hit/hurt boxes come from manifest data, never sprite frame counts. Timed rectangle queries own combat rather than renderer/Area overlap events. Includes interval-window overlap, team/depth/elevation filtering, deduplication, interrupt/recovery, manifest knockback, clamped HP and terminal one-shot KO.
- `enemy_brain.gd` approaches/aligns depth/faces/attacks; `arena.gd` wires actions, fixture selection/reset, signal-bound HP HUD and bounded deterministic waves (2 then 3 enemies; cap 2), completion and player-loss stopping. Optional `--fixture=comet` command-line selection.
- Expanded deterministic runner: **57 gameplay assertions**, plus **3 startup assertions**. Actual input dispatch, real textures/atlas/anchor/animation states, both fixture movement, diagonal normalization, bounds, jump root/visual/shadow, legal windows/filters/cooldown/dedup, art-independent combat, knockback/hurt recovery/interrupt, KO, health binding, selection, AI damage, wave cap/progression/completion and loss. Wave completion uses normal player melee against controlled targets; active AI is exercised separately, not a claim of automated human-quality playthrough.
- Manual instructions/checklist: [docs/phase-3-playtest.md](../docs/phase-3-playtest.md). Fixture animations are currently one frame each; no smooth multi-frame-art claim.
- No new architectural decision: this implements the existing plan 03/ADR-008/017 fixture prototype boundary; no version/contract/repository change.

## Actual validation this session
All pnpm commands use:

```sh
mise exec node@22.23.3 -- npm exec --yes --package=pnpm@10.34.7 -- pnpm <command>
```

This host initially had no node_modules, pinned Node installation, Godot binary or templates. Frozen install installed Node/dependencies successfully. First `test:godot` failed with “Expected 4.7.2.stable binary: godot”; this was not a skipped/pass test. Provisioned the documented official 4.7.2 release engine ZIP/templates TPZ and SHA512-SUMS.txt in `/tmp/doodle-godot`; both archive SHA-512 checks PASS. Template download timed out once and resumed successfully; unzip was unavailable, so Python standard-library zipfile extracted only engine and Linux templates (tooling only, no application dependency).

Exact successful engine validation invocation:

```sh
GODOT_BIN=/tmp/doodle-godot/Godot_v4.7.2-stable_linux.x86_64 \
GODOT_TEMPLATE_DIR=/tmp/doodle-godot/templates \
mise exec node@22.23.3 -- npm exec --yes --package=pnpm@10.34.7 -- pnpm test:godot
```

Engine and both actual template executables report `4.7.2.stable.official.ed1daf0bf` (same pinned engine/commit, official instead of historical Arch build; no version change). Temporary provisioning paths must be recreated or overridden on another host.

| Command | Actual result |
|---|---|
| `install --frozen-lockfile` | PASS, 13 workspace projects/214 packages, native SQLite tooling succeeded |
| `test:godot` with overrides above | PASS: headless import, 3 startup + 57 gameplay assertions |
| `check` | PASS: strict TS and Svelte, 0 errors/0 warnings |
| `test` | PASS: 4 files, 26 tests |
| `build` | PASS: studio adapter-node + worker |
| `test:smoke` | PASS: migrated temp DB, actual processes/private-storage refusal/restart/signals/dev cleanup |
| `format:check` | PASS |
| `git diff --check` | Initial check found a trailing blank line in restored history; removed, final check PASS |
| `lint` | FAIL: existing `packages/contracts/src/create-fixtures.ts:68–69` explicit-any errors; unrelated contract source left untouched |
| Manual graphical playtest | NOT RUN: no DISPLAY or WAYLAND_DISPLAY; shadow/Y-sort feel/readability and a human wave playthrough remain unverified |

Earlier engine failures caught/fixed: startup assertions ran before the scene entered readiness (deferred runner); dynamically dispatched empty Array arguments mismatched typed Array parameters (Array boundary adjusted); tests incorrectly expected Comet speed 210 (both existing manifests define 180; fixtures unchanged). Final reported assertions passed after fixes.

## Acceptance audit / remaining blockers
| Phase 3 criterion | Status |
|---|---|
| Two different fixture art sets, defined speeds, generic reusable fighter | Headless verified |
| Ground movement/normalization/bounds, jump root separation | Headless verified |
| Depth sorting and jump/shadow rendering | Y-sort setup/transforms verified; **manual appearance/feel pending** |
| Legal melee windows/depth/team/elevation, damage/dedup/knockback/one-shot KO | Headless verified |
| Input, animation state resources, camera/HUD/selection | Headless verified; manual usability pending |
| Enemy approach/attack, bounded waves and completion | Deterministic assertions verified; human active-AI playthrough pending |
| Combat independent of art; no per-character script/scene | Implemented and tested; no Phase 4 work |

Not every Phase 3 acceptance requirement is met: manual shadow/Y-sort/feel review remains a gate. Repository lint also has the two pre-existing errors noted above. Remote CI, browser regression and desktop export were not run this session. No claim of Godot full schema/security parity, API loading, publishing, generation or offline release.

## Previous Phase 3 next actions (phase-start prohibition superseded above)
1. Run/record the manual checklist on a graphical host with the pinned engine; fix any visual/gameplay issues and rerun headless tests.
2. Resolve the existing contract-generator lint errors in an explicitly scoped follow-up (not silently mixed into Phase 3).
3. Only accept the final Phase 3 checkbox after actual manual evidence. **Do not start Phase 4.**

---

## Historical snapshot A — recovered from fcdf5fe (Phases 0–2)
The following is preserved historical evidence, not live current status.

### 14 — Persistent implementation progress

#### Purpose
Record verified milestones, current work, decisions, tests, blockers and next actions across agent sessions.

#### Scope
All phases. Update after every meaningful implementation milestone. Planning completion is not application completion.

#### Technical approach
Keep phase status and task checkboxes consistent with plan 12. For every milestone report files/behavior changed, exact executed validation and outcome, limitations and next actions. Never turn an unavailable test into a pass.

#### Architecture and responsibilities
Implementing agent maintains this file and records architectural changes in plan 13. Agents must read this tracker, plan index and roadmap before implementation. Plans specify intended behavior; this file records actual state.

#### Key design decisions
- Existing Git repository remains the project root; no nested repository/reinitialization.
- SvelteKit is UI/API; independent TypeScript worker; SQLite/Drizzle metadata and filesystem images.
- Node 22.23.3 maintenance LTS/pnpm 10.34.7/TypeScript 6.0.3 and exact dependency pins verified together (ADR-014). SvelteKit 3 configuration/API conventions are used, not Kit 2 scaffolding.
- Godot 4.7.2-stable binary and actual official Linux x86_64 debug/release templates verified before project creation; no version change (ADR-007 addendum).
- Baseline persistence is intentionally incremental: four tables now, contract/asset/publication/workflow additions through new migrations in consuming phases (ADR-015).
- Seed is deterministic synthetic authoring metadata only. It cannot produce game-visible/approved content. Phase 2 now defines the contract and authored fixture packages; approval/publication remain Phase 4 work.
- Phase 2 uses strict Zod 4 schemas as the source of truth, generated draft-2020-12 JSON Schema, semantic validators, deterministic canonical JSON/hash helpers, and package-relative asset verification (ADR-016).
- Hash-bound approval, immutable revisions, filesystem-first publication/transactional active release, API development and offline bundle release designs remain unchanged and unimplemented.
- Deterministic mock workflow still precedes real provider selection and paid calls.

#### Dependencies
Phase 0 review and explicit Phase 1 authorization were supplied by the user. Toolchain and Linux template prerequisites are now verified. Phase 2 requires review of this foundation and the contract specification; real providers remain a Phase 7 dependency.

#### Implementation tasks
##### Current phase
**Phase 2 — Character contract complete locally (2026-10-22).** Contract schemas, semantic/package validation, reproducible JSON Schema, CLI validation, and two synthetic packages are implemented and tested. Godot parity is intentionally deferred to Phase 4 loader work; no Phase 3 gameplay has started.

##### Completed tasks
###### Phase 0 (retained history)
- [x] Inspected existing Git root/initial README, wrote root navigation/AGENTS, plan index, all fifteen numbered plans and docs index.
- [x] Specified contract, database, workflow, approval/publication and phase ordering; reviewed links/required sections/architectural consistency.
- [x] Selected Godot stable from official archive; local installation was intentionally unverified at planning time.
- [x] Phase 0 documentation review accepted; user authorized Phase 1.

###### Phase 1 increments
- [x] **Workspace/toolchain:** `mise.toml`, exact private manifests/exports for apps/packages/tools, `pnpm-lock.yaml`, strict root/studio TS, lint/format, engine/peer enforcement, ignored build/runtime artifacts. Later-feature packages export empty modules with explicit phase ownership, not pretend implementations.
- [x] **Config/persistence:** server-only Zod environment checks, checkout-relative storage/DB roots and `.env.example`; Drizzle baseline migration/snapshot, WAL/FK/busy timeout, migration exclusion lock, character repository optimistic edits and deterministic metadata-only seed. Tested empty/repeat migrations, FK/unique/JSON constraints, rollback, cross-connection persistence/stale edits and real writer contention.
- [x] **Process skeleton:** Svelte 5/Tailwind/adapter-node studio shell plus `/api/health`; independent Node worker `/health`, truthful generation-unavailable status, signals and clean DB shutdown. Neither process implicitly migrates. Root dev supervisor terminates both children on shutdown/failure.
- [x] **Godot:** native Compatibility project, main scene and headless assertion runner; engine and actual debug/release template version enforcement, bounded imports/tests, source `.gd.uid` identity file.
- [x] **Verification/docs:** Vitest, built-process/restart/signal smoke, Chromium keyboard/shell test; CI split into TS/browser/Godot jobs; `docs/setup.md`, README, agent navigation and ADR-014/015 updated. All nine Phase 1 roadmap items synchronized with executed local evidence below.

##### Tasks in progress
None. Phase 2 contract boundary is complete. Phase 3 is explicitly not started.

##### Blocked tasks
No Phase 2 local acceptance blocker remains. Godot contract parity awaits the Phase 4 runtime loader. The mise pnpm binary download timed out; exact pnpm was obtained via the npm-registry fallback documented below. Remote CI execution remains unverified.

##### Phase status
| Phase | Status | Evidence |
|---|---|---|
| 0 planning | Complete and reviewed | Original 19 Markdown files; structure/link/manual consistency review |
| 1 foundation | Complete, locally verified | Frozen clean-snapshot install, strict checks/build, 18 tests, process smoke, 1 Chromium test, 3 Godot assertions; setup/CI definitions added |
| 2 contract | Complete locally | `packages/contracts`: v1 character/release Zod schemas, semantic/path/hash/PNG validation, draft-2020-12 JSON Schema, CLI validator, two five-animation synthetic fixture packages. Godot parity remains Phase 4. |
| 3 game prototype | Not started | Native engine skeleton only; no movement/combat |
| 4 dynamic loading | Not started | Publisher package boundary only; no approval/content API/repository |
| 5 studio | Not started | Foundation shell only; no authoring/uploads/review |
| 6 factory | Not started | Worker lifecycle only; no scheduling/generation/Sharp behavior |
| 7 real AI | Not started | No providers, credentials or paid calls |
| 8 offline/release | Not started | Templates installed, no bundles/exported game |

##### Test results
All Phase 1 pnpm commands below were executed as:

```sh
mise exec node@22.23.3 -- npm exec --yes --package=pnpm@10.34.7 -- pnpm <command>
```

This selects the actual pinned Node and pnpm without depending on the machine's globally active Node 26/pnpm 12. The repository's mise pnpm install attempt timed out; the registry fallback succeeds.

| Executed command/check | Actual result |
|---|---|
| Tool/registry inspection: `node --version`, `pnpm --version`, `mise ls node`, `godot --version`, `pnpm view ... engines/peerDependencies/version` | Installed LTS and compatible exact dependency versions selected; initial global tools were not assumed to be pins |
| `install --frozen-lockfile` | PASS in working checkout and a clean source snapshot `/tmp/doodleforge-clean-1S9Rnn` without node_modules/build/DB/caches; 13 workspace projects, 214 packages, native SQLite install succeeded |
| `check` | PASS, strict TS plus svelte-check: 0 errors/0 warnings; also passed from clean snapshot before build |
| `lint` / `format:check` | PASS |
| `test` | PASS: 3 files, **18 tests** (config, migrated SQLite/seed/concurrency, worker lifecycle) |
| `build` | PASS: adapter-node studio and bundled worker; also passed from clean snapshot |
| `test:smoke` | PASS: temporary empty DB migration; actual built studio/worker health; private storage 404; worker restart; clean SIGTERM exits; actual dev supervisor boot and SIGINT child cleanup/ports closed. Also passed from clean snapshot |
| `exec playwright install chromium` | Succeeded; Arch is not officially supported, so Playwright used its Ubuntu fallback build |
| `test:e2e` | PASS: **1 Chromium test**, shell heading/unavailable state/keyboard focus/real health API. Not full factory E2E |
| Official template archive + `SHA512-SUMS.txt`, `sha512sum -c` | PASS for downloaded 4.7.2 template archive; archive SHA-256 recorded in setup; extracted only Linux x86_64 debug/release/version files |
| Engine and both template `--headless --version` | Engine `4.7.2.stable.arch_linux.ed1daf0bf`; both templates `4.7.2.stable.official.ed1daf0bf` |
| `test:godot` | PASS: bounded headless import, scene instantiate/structure/Compatibility renderer, JSON `status:passed`, **3 assertions**. No gameplay/export claim |
| `db:migrate`, `db:seed`, `db:seed` | PASS on default ignored local DB: synthetic identity inserted once, repeat reports `inserted:0`; no version/approval/release created |
| `db:generate` + before/after SHA-256 inventory of migration files | PASS: no schema changes, migration inventory unchanged |
| `git diff --check`, `git check-ignore ...` | PASS: runtime DB/storage, build/dist, .godot, .env, node_modules and browser results ignored; synthetic fixture PNG path is not globally ignored |
| Inline Node Markdown validation | PASS: all 20 Markdown files, relative links/code fences and ten required sections in numbered plans |
| `content:validate`, `content:bundle` | Expected failure verified: both exit 1 with explicit not-implemented message |
| `GODOT_BIN=/does/not/exist node tools/godot-validation/run.mjs` | Expected failure verified: invalid engine exits 1 rather than skipping checks |
| Final frozen install with `.npmrc` engine/peer enforcement | PASS; no remaining studio/worker/dev smoke processes |

Failures caught and resolved during increments:
- First strict check failed because the root manifest lacked ESM type; fixed `type:module`.
- Initial build/check revealed Kit 3 removed legacy `svelte.config.js` and changed TS/config/environment conventions. Used installed Kit interfaces, moved config into Vite, adopted `$app/tsconfig` / `$app/env`, reran successfully.
- Lint caught navigation needing `resolve()` and one unused import; fixed and reran.
- After formatting, raw HTML smoke string matching failed on line-wrapped whitespace. Normalize HTML whitespace in that assertion; rerun and final full regression passed.

Phase 0 evidence retained: initial inventory confirmed README-only application state; inline Node documentation checks over 19 Markdown files passed sequential plan/required-section/relative-link/code-fence checks; `git diff --check` and manual contract/publication/workflow/phase-order review passed. No application tests were claimed in Phase 0.

##### Known issues and limitations
- Foundation only: no public character schemas, asset validation, ability catalog, immutable publication guards, content API, authoring, durable generation, gameplay or offline bundle/export exists yet. Additive migrations must implement those before the respective phase acceptance.
- `content:validate` and `content:bundle` intentionally exit nonzero; no fake validator/export.
- Built server/worker require the checkout and installed native dependency; no standalone deployment artifact/support claim.
- CI YAML exists but remote GitHub Actions has **not** run. No manual graphical Godot editor/playtest or exported desktop game test was performed. Headless scene checks do not establish visual feel.
- Verified engine/template host is Linux x86_64 only. Playwright warns about unsupported Arch and uses its Ubuntu fallback; the actual local browser test passed.
- Drizzle kit brings deprecated transitive esbuild-kit packages; no install/test failure observed. Native SQLite may require compiler/make/Python tooling. No Python application/runtime dependency was added.
- Migration locks after SIGKILL require deliberate operator inspection/removal; see setup. Automated backup/orphan tooling remains future work.
- Real provider terms/cost/privacy/animation quality remain unevaluated. Initial operation is loopback-only, not secure public multi-user hosting.

##### Next actions
1. Keep Phase 3 stopped as requested; no gameplay implementation was started.
2. On future Phase 3 authorization, read plan 03 and inspect the v1 fixture content boundary.
3. Phase 4 must add Godot parity/runtime loading and publication services; fixtures are not approved releases.

#### Phase 2 implementation evidence (2026-10-22)
- `packages/contracts/src/index.ts`: strict v1 character/release contracts, bounds, semantic reference/animation/window/path checks, safe package file resolution, byte/hash/PNG IHDR checks, canonical JSON and SHA-256 helpers; unsupported schema versions and unknown fields fail closed.
- `packages/contracts/schema/*.schema.json`: generated through Zod 4 `toJSONSchema` for draft 2020-12. `content:schema` formats output deterministically; two consecutive generations produced identical SHA-256 inventories.
- `packages/contracts/fixtures/{sprout,comet}/v1/`: two visually distinct, small authored transparent PNG character packages; each contains real hash/byte/dimension metadata and all five required animations.
- `tools/content-cli`: `content:validate <manifest>` now validates package bytes; `content:schema` emits committed schemas. No Phase 2 DB migration was needed; contract source/fixtures are package-owned and Phase 1 baseline history remains untouched.
- Exact local commands (Node 22.23.3, pnpm 10.34.7 via npm-registry fallback): `pnpm content:schema` twice + SHA-256 `diff` PASS; `pnpm content:validate packages/contracts/fixtures/comet/v1/character.json` PASS; `pnpm check` PASS (0 Svelte errors/warnings); `pnpm test` PASS (4 files, 26 tests); `pnpm format:check` PASS; `git diff --check` PASS.
- Not run: remote CI; Godot parity/runtime loading, deliberately deferred until Phase 4. Phase 2 fixture validation does not establish approval/publication or gameplay.

#### Acceptance criteria
Progress reflects only completed and verified work, links to plan decisions, explicitly names unrun tests and leaves a clear next task. Phase boundaries require review; foundation/contract completion does not imply application completion.

#### Risks and limitations
Checkbox drift can mislead future agents; synchronize roadmap at each milestone. A researched version is not a tested toolchain and a fixture/shell test is not full generation E2E.

#### Future considerations
Append concise dated/milestone entries during implementation, retaining major test failures/recovery evidence and referencing detailed logs without committing sensitive runtime artifacts.


---

## Historical snapshot B — retained from e219237 (initial Phase 3)
The following is preserved historical evidence, superseded by the live Phase 3 entry above.

### 14 — Persistent implementation progress

#### Current phase
**Phase 3 — Godot prototype, in progress.** Phase 2 remains locally verified. Do not begin Phase 4.

#### Phase 3 increment (2026-10-23)
Added a generic `CharacterBody2D` fighter script (`apps/game/scripts/fighter.gd`), replaced the foundation scene with a minimal Y-sorted arena/player/enemy/camera/HUD scene, and added a headless gameplay test reading the Sprout Phase 2 manifest. The script loads speed, health and light-attack timing/damage/range from manifest data; supports normalized ground movement, separate jump elevation, facing, attack windows, team/depth/elevation filters, target deduplication, damage and one-shot KO signaling. Updated Godot runner to execute gameplay assertions as well as startup validation. Recorded the limited prototype boundary in ADR-017.

**Executed:** `mise exec node@22.23.3 -- npm exec --yes --package=pnpm@10.34.7 -- pnpm test:godot` — PASS; startup report 3 assertions, gameplay report 5 assertions, Godot 4.7.2 binary and both templates verified. Initial bare `pnpm` attempt failed as expected because active Node is 26.12.0, not pinned Node 22.23.3. An attempted combined Godot/check invocation stopped at an outdated foundation assertion after scene replacement; updated startup assertion and reran `test:godot` successfully. `pnpm check` and broad suite not yet rerun. `git diff --check` not reached in combined command.

#### Phase status
| Phase | Status |
|---|---|
| 0 planning | Complete/reviewed |
| 1 foundation | Complete, locally verified |
| 2 contract | Complete, locally verified |
| 3 Godot prototype | In progress; first movement/jump/melee test slice only |
| 4–8 | Not started; do not advance Phase 4 |

#### Known limitations / remaining Phase 3 work
No SpriteFrames/fixture art runtime rendering, player input loop, shadow/elevation visual, functional HUD health binding, enemy AI/wave director, or full wave-completion/manual playtest yet. Test covers fixture configuration, movement, jump ground separation, attack damage and deduplication only. Combat tests call deterministic methods directly; not full physics/input integration. No Godot contract parity claim. Existing working-tree changes predated this increment; avoid unrelated edits.

#### Next actions
Continue Phase 3 only: bind input/state and rendered sprite animation from fixture; implement enemy approach/attack and bounded waves; bind health HUD/selection; extend deterministic tests and record manual visual limitations. Then run Godot and broad relevant checks. Do not start Phase 4.

## Phase 3 manual acceptance — user-confirmed checkpoint

- The user launched the pinned Godot project and confirmed Sprout's idle checkerboard artwork and foot alignment looked as expected. This records only that observation; remaining visual/gameplay checks, including both active-AI waves, remain unverified.
- No code changed and no tests were run. Existing working-tree changes were preserved.

- Additional manual confirmation: user reports Comet's sprite is visible and looks different from Sprout. Foot alignment and other Comet animation states were not confirmed.

- Additional manual confirmation: user reports Comet changes draw order appropriately when passing vertically in front of and behind an enemy.

- Additional manual confirmation: user confirms a standing Space jump raises and lands the fighter while the shadow remains beneath the ground position and shrinks.

- Additional manual confirmation: user reports Comet visibly changes from idle to walk and back when moved and stopped.

- Additional manual confirmation: user reports Comet visibly shows its attack state when J is pressed.

- Additional manual confirmation: user reports diagonal movement appears about as fast as straight movement.

- Additional manual confirmation: user reports Comet's sprite faces left and right when turned in each direction.

- Additional manual confirmation: user reports attacks reach in front of Comet facing either direction and jump direction works.

- Additional manual confirmation: user reports moving while jumping does not cause unintended depth drift.

- Additional manual confirmation: user confirms light attack is prevented while Comet is airborne.

- Additional manual confirmation: user reports Comet's health bar is visible and readable during the fight.

- Additional manual confirmation: user reports enemy AI approaches Comet and attacks at close range.

- Additional manual feedback: user reports visible changes during combat exchanges; the individual attack/hit cues were not described separately.

- Manual acceptance concern: user reports active combat is very difficult, almost impossible to win. No combat tuning or code changes were made. Wave-completion acceptance remains unverified.

- Manual acceptance blocker: user reports they could not get past wave one, and describes combat as very difficult/almost impossible to win. Neither wave completion nor a complete two-wave run is confirmed. No tuning or code change.

- Additional manual confirmation: user reports restarting returns Comet to full health and wave one.

- Additional manual confirmation: user reports pressing Space during the active run jumps without triggering Start or restarting.

- Additional manual confirmation: user reports an enemy hit decreases Comet's health and produces a hurt response.

- Additional manual confirmation: user reports reaching zero health shows the loss/knockout state and restart option.

- Manual active-AI progress: user reports completing wave one and reaching wave two after restart. Wave-two completion remains unverified; full run is not yet accepted.

- Manual active-AI update: user reports combat works better now but says they could not defeat both; the exact wave-two outcome and full-run completion are not confirmed. Keep wave-two/full-run acceptance unchecked.

- Additional manual confirmation: user reports Comet stops ordinary movement during an attack and resumes afterward.

- Additional manual confirmation: user reports enemy-hit knockback is understandable and Comet regains control afterward.

- Additional manual confirmation: user reports Comet's attack misses an enemy clearly separated in ground depth.

- Additional manual confirmation: user reports a hit during an attack interrupts it with the hurt response.

- Additional manual confirmation: user reports holding J produces separate attack cycles rather than continuous damage from one attack.

- Additional manual confirmation: user reports damage appears limited to the visible attack, not startup or recovery.

- Manual active-AI acceptance: user explicitly confirms defeating the wave-two enemies and seeing the run-complete message after initially reporting they could not get past wave one. Both waves are now human-confirmed complete. Earlier report of very high difficulty is retained; later the user said combat worked better, with no code tuning.

- Additional manual confirmation: user reports Sprout changes from idle to walk and back when moved/stopped, consistent with Comet.

- User requested skipping the remaining Sprout-equivalent visual/gameplay questions and marking those items confirmed, reporting they work the same as Comet. Recorded this as user-reported rather than individually observed. Sprout idle/foot alignment, walk and attack state have direct confirmations; Comet foot alignment and remaining global checklist items are still unverified.

- Additional manual confirmation: user confirms Comet's idle sprite is aligned at its feet with the ground.

- Additional manual confirmation: user reports all four diagonal movement directions work.

- Additional manual confirmation: user reports never seeing more than two active enemies during the waves.

- Additional manual confirmation: user reports switching from Comet to Sprout resets the run to wave one with full health.

- Manual checklist update: confirmed both-fixture rendering/state presentation (Sprout equivalent checks user-reported per explicit request), jump/shadow/elevation and Space behavior, facing/attack direction and restrictions, HUD/KO/restart/fixture switching/spawn cap, and both active-AI waves with completion. All four diagonal directions confirmed. Still unchecked: all eight-direction/depth-sort grouping as a complete item, elevated-target miss, and exact engine/platform details. The initial very-difficult feedback remains recorded; user later said combat worked better. No code changes or tests run. Phase 3 manual acceptance remains incomplete because checklist items remain unchecked.

- Manual limitation: user reports enemies did not jump; attack behavior against an airborne/elevated enemy was not visually exercised and remains unchecked.

- Additional manual confirmation: user confirms Comet moves correctly in all four cardinal directions. With the earlier explicit confirmation of all four diagonals and Y-sort, the full eight-direction/Y-sort checklist item is now checked.
