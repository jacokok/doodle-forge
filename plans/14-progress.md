# 14 — Persistent implementation progress

## Phase 6 — canonical metadata join increment

- Added library-only `generate-metadata@1`: joins all five adopted sheet branches and capture-first analysis, checks selected artifact identity and branch/style, revalidates PNG files, maps provider attack/KO names to shared-v1 names and adopts a canonical manifest/hash with private source-sheet bindings. The contracts-owned versioned light-melee catalog supplies fixed trusted gameplay values and rejects unselected/unsupported intent. ADR-044 records timing/catalog and authority boundaries. Existing uncommitted sheet-packing work was preserved; no migrations, dependencies or real-provider changes added in this increment.
- Executed `mise exec -- pnpm exec vitest run packages/contracts/src/gameplay-catalog.test.ts packages/workflow/src/metadata.test.ts`: PASS, 10 tests. Covers catalog bounds/override rejection, deterministic five-sheet metadata across reopen, exact hash/source binding, required branches, branch/style/corrupt/stale source rejection, cancellation and lease expiry/replacement. Synthetic upstream producers isolate this boundary; not generation E2E. Initial focused run exposed an invalid test assumption about independent claim order; corrected producers to dispatch by the actual claimed key/target and reran successfully.
- Executed `mise exec -- pnpm test`: PASS, 367 tests / 25 files. `mise exec -- pnpm check`: PASS, 0 Svelte errors/warnings. `mise exec -- pnpm lint` and `mise exec -- pnpm build`: PASS (Studio/worker). No browser, Godot, manual, real-provider or upload-to-game E2E tests ran.
- Next: revalidate assembled assets and freeze/register review sources with cancellation/lease-fenced adoption, then production graph composition and persisted gates/progress. Current metadata is a private checkpoint, not a frozen review, approval or release; no manifest package file or production registration is created. Phase 6 remains incomplete; deferred Phase 5 manual accessibility/child-usability checks remain unaccepted.

## Phase 6 — durable sprite sheet packing increment

- Added library-only `build-sheet@1`, explicitly addressed to an adopted normalization branch. It revalidates selected attempt identities and ordered PNGs, packs deterministic row-major sheets, and installs an attempt-scoped artifact for fenced adoption. Checkpoints include strict dimensions/layout, ordered normalized source hashes, style, provisional target anchor and resolved input identity. ADR-043 records the boundary. No production worker registration, cache reuse, metadata, review or publication changes.
- `mise exec -- pnpm install --no-frozen-lockfile`: PASS (workspace animation dependency/link added, no external version upgrades). `mise exec -- pnpm exec vitest run packages/workflow/src/mock-stages.test.ts`: PASS, 32 tests including four new sheet tests. `mise exec -- pnpm test`: PASS, 357 tests / 23 files. `mise exec -- pnpm check`: PASS, 0 Svelte errors/warnings; `mise exec -- pnpm lint`: PASS. Initial typecheck exposed the test graph's overly narrow inferred parameter type; widened its test envelope and reran successfully. No browser, Godot, upload-to-game E2E or manual tests ran.
- Next: assemble shared-contract metadata from all required sheet branches, validate/freeze review snapshots, then compose the production graph and explicit gates. Phase 6 remains incomplete; Phase 5 manual accessibility and observed child-usability remain deferred, not passed. Provisional normalization/anchor limitations and private orphan retention remain unchanged.

## Phase 6 — generated asset validation increment

- Added library-only `validate-assets@1`: joins the selected manifest and five sheet checkpoints, checks identity, canonical hash, provenance and metadata, re-reads private PNGs and applies the publisher's shared full byte/hash/decode validation before fenced checkpoint adoption. Publisher continues staging the same validated buffers. ADR-046 records the boundary. No review freeze, production registration, approval or publication changes.
- `mise exec -- pnpm test`: PASS, 372 tests / 27 files. `mise exec -- pnpm check`: PASS, 0 Svelte errors/warnings; `mise exec -- pnpm lint` and `git diff --check`: PASS. Tests include selected provenance, corrupt assets, cancellation and expired lease/retry. No browser, Godot or manual tests ran.
- The requested private freeze remains blocked on a safe database visibility/approval boundary: existing review snapshots appear in Studio history and can receive decisions, and ordinary checkpoint completion must not bypass atomic freeze. A validation checkpoint does not guarantee later file integrity; freeze must revalidate. Phase 6 remains incomplete; Phase 5 manual accessibility and observed child-usability remain deferred, not passed.

## Phase 6 — fenced manifest checkpoint increment

- Added library-only `assemble-manifest@1`: joins five selected sheet branches, checks attempt identity, style, layout and anchor, re-reads verified PNGs and produces canonical manifest metadata and sheet provenance under the existing executor fence. Asset paths are hash-addressed; no files are installed as a package. Gameplay and timing remain explicit. ADR-045 records the boundary. No production registration, review freeze, approval or publication changes.
- `mise exec -- pnpm exec vitest run packages/workflow/src/manifest.test.ts packages/workflow/src/manifest-integration.test.ts packages/contracts/src/assembly.test.ts`: PASS, 7 tests / 3 files. `mise exec -- pnpm test`: PASS, 365 tests / 26 files. `mise exec -- pnpm check`: PASS, 0 Svelte errors/warnings; `mise exec -- pnpm lint`: PASS. Tests cover SQLite checkpoint adoption, expired lease/retry and corrupt source rejection; no browser, Godot or manual tests ran.
- Next: full package validation and safe review freeze, then production graph and gates. A verified checkpoint is not an approved package; gameplay catalog policy remains open. Phase 6 is incomplete; Phase 5 manual accessibility and observed child-usability remain deferred, not passed.

## Phase 6 — pure manifest assembly increment

- Added a library-only v1 manifest assembler for the five existing sheet branches. Character data, sheet metadata, animation timing and gameplay configuration are explicit inputs; no fixture or AI gameplay defaults are adopted. It checks schema and semantic constraints and returns publisher-compatible canonical bytes and their SHA-256. ADR-044 records the boundary. It does not read or verify assets, create a review snapshot, register a worker stage or publish content.
- `mise exec -- pnpm exec vitest run packages/contracts/src/assembly.test.ts packages/contracts/src/contracts.test.ts`: PASS, 11 tests / 2 files. `mise exec -- pnpm check`: PASS, 0 Svelte errors/warnings; `mise exec -- pnpm lint`: PASS. No full suite, browser, Godot or manual tests ran for this increment. A subagent reported frozen installation failed due to unavailable node-gyp; it used `--ignore-scripts` to install dependencies before verification.
- Next: integrate selected, verified sheet artifacts with metadata, establish an approved gameplay catalog and full asset validation, then review freeze and production composition. Phase 6 remains incomplete; Phase 5 manual accessibility and observed child-usability remain deferred, not passed.

## Phase 6 — durable sprite-sheet increment

- Added library-only `pack-sheet@1`: selects the matching adopted normalized animation branch, checks style and artifact attempt identity, revalidates source files, packs deterministic PNG bytes and adopts the sheet through the existing executor fence. Checkpoints retain ordered source hashes, layout, anchor, style and resolved input identity. ADR-043 records the boundary. No production registration, metadata, review or publication changes.
- `pnpm exec vitest run packages/workflow/src/mock-stages.test.ts packages/animation/src`: PASS, 35 tests / 2 files. `mise exec -- pnpm test`: PASS, 358 tests / 23 files; `mise exec -- pnpm check`: PASS, 0 Svelte errors/warnings; `mise exec -- pnpm lint`: PASS. An initial parallel full test failed because SvelteKit configuration had not yet been generated; it passed after the check's sync completed. No browser, Godot, full upload-to-game E2E or manual tests ran.
- Next: metadata/validation and production graph composition/gates. Phase 6 remains incomplete; Phase 5 manual accessibility and observed child-usability remain deferred, not passed. The anchor remains provisional.

## Phase 6 — standalone sprite sheet packing increment

- Added `packSheet` in `packages/animation`: bounded v1 row-major packing of 1–64 strictly decoded 256×256 PNG frames into up to 16 columns and 4096×4096 pixels, transparent unused cells, deterministic PNG bytes and SHA-256/layout metadata. Rejects malformed, empty, opaque and oversized inputs. It uses existing image-processing validation and pinned Sharp; no production worker registration, durable sheet stage, manifest, review or publication changes. It validates visible pixels and transparency but does not independently prove normalization or anchor consistency.
- `mise exec -- pnpm install --no-frozen-lockfile`: PASS (workspace links updated, no new external versions). `mise exec -- pnpm test`: PASS, 353 tests / 23 files, including packing layout, byte/hash determinism and rejection cases. `mise exec -- pnpm check`: PASS, 0 Svelte errors/warnings; `mise exec -- pnpm lint` and `git diff --check`: PASS. No browser, Godot, full upload-to-game E2E or manual tests ran.
- Next: integrate packing as a fenced branch-addressed artifact stage, then metadata and production graph composition/gates. Phase 6 remains incomplete; Phase 5 manual accessibility and observed child-usability remain deferred, not passed.

## Phase 6 — durable frame normalization increment

- Added library-only `normalize-frames@1`: it selects the exact animation frame branch, verifies each adopted source file and attempt identity, applies the standalone normalizer in order, and adopts attempt-scoped normalized PNGs under the executor fence. Checkpoints record source hashes, source/placed bounds, style, target anchor and resolved input identity. No production worker registration, review, sheet or publication changes. ADR-042 records the boundary; ADR-041's provisional anchor and frame-scaling limitations remain.
- `mise exec -- pnpm test`: PASS, 351 tests / 22 files, including reopen, ordered hashes/unchanged source files, mid-install abort, upstream corruption, expired lease and stale-attempt rejection. `mise exec -- pnpm check`: PASS, 0 Svelte errors/warnings; `mise exec -- pnpm lint`: PASS. `mise exec -- pnpm format:check` failed on the harness-generated `.thinkrail/context/todos/01a17d9c-8599-73f1-a31c-74f0fc73db1d.baselines.json`; targeted Prettier checks of changed TypeScript files and `git diff --check` passed. No browser, Godot, full upload-to-game E2E or manual tests ran.
- Next: deterministic sheet packing and metadata with layout/hash tests, then production graph composition and gates. Phase 6 remains incomplete; Phase 5 manual accessibility and observed child-usability remain deferred, not passed.

## Phase 6 — standalone frame normalization increment

- Added `normalizeFrame` in `packages/image-processing`: strict bounded 256×256 PNG decode, nonzero-alpha bounds, rejection of empty or potentially edge-clipped input, conservative fit without enlargement, target bottom-center alignment, style-specific resampling and deterministic 256×256 transparent PNG output. ADR-041 records the nonzero-alpha policy and provisional anchor heuristic. This is standalone and not yet connected to persisted workflow artifacts or sheet packing.
- `mise exec -- pnpm exec vitest run packages/image-processing/src/normalize.test.ts`: PASS, 3 tests (determinism, placement/alpha, scaling/faint pixels and invalid/empty/clipped inputs). `mise exec -- pnpm check`: PASS, 0 Svelte errors/warnings. `mise exec -- pnpm lint`: PASS. No full suite, browser, Godot or manual tests ran.
- Next: integrate normalization with adopted per-branch frame artifacts and cancellation/fencing, then implement deterministic sheet packing and layout/hash checks. Target anchor is a bounding-box heuristic, not measured feet; independent per-frame fitting can affect temporal consistency. Phase 6 and deferred Phase 5 manual checks remain incomplete.

## Phase 6 — frame-stage fault coverage

- Added real-SQLite/artifact tests for expired frame attempts and rejection of their artifacts by a replacement attempt, a malformed later frame after an earlier artifact was installed, and mismatched animation/pose branch rejection before provider execution. Tests verify no partial checkpoint is adopted and a fresh replacement can adopt its own deterministic frames. No production behavior or architecture changed.
- `mise exec -- pnpm exec vitest run packages/workflow/src/mock-stages.test.ts`: PASS, 24 tests. `mise exec -- pnpm check`: PASS, 0 Svelte errors/warnings. `mise exec -- pnpm lint`: PASS. No full suite, browser, Godot or manual tests ran for this increment.
- Next: deterministic frame normalization and sheet packing with bounds/alpha/layout/hash tests. Production worker composition, review/publication gates and Phase 6 E2E remain incomplete. Phase 5 manual checks remain deferred, not passed.

## Phase 6 — durable mock frame library increment

- Added library-only `generate-frames@1` with explicit matching animation pose dependency, master/pose file revalidation, 1–8 ordered candidate validation and attempt-scoped artifact adoption. Provenance records both source hashes; the existing mock provider does not consume pose pixels or hash, so this is not pose-conditioned generation (ADR-040). No production worker registration, sheet/normalization, review or publication changes.
- `mise exec -- pnpm test`: PASS, 341 tests / 21 files, including transient frame retry across DB reopen without recomputing pose and cancellation after first artifact installation with no checkpoint adoption. `mise exec -- pnpm check`: PASS, 0 Svelte errors/warnings; `mise exec -- pnpm lint` and `git diff --check`: PASS. No browser, Godot, full workflow E2E or manual tests ran.
- Stage-specific stale-attempt and additional malformed-frame/branch tests remain needed; normalization/sheet packing, production graph composition, review/publication gates and Phase 6 E2E remain incomplete. Phase 5 manual accessibility and observed child-usability remain deferred, not passed.

## Phase 6 — mock pose library increment

- Added `generate-pose@1`: an animation-targeted library stage that verifies adopted master/body/analysis lineage, adapts to the existing offline frame-capability provider, validates one 256×256 transparent PNG candidate and provider provenance, and installs/adopts it through the attempt artifact protocol. Executor context now exposes the step target for branch/input matching. ADR-039 records the adapter and limitations. The mock uses the master hash, not its pixels; it is not identity-preserving pose generation. No production registration, review or publication changes.
- `mise exec -- pnpm test`: PASS, 339 tests / 21 files, including two-branch pose persistence across reopen and provider hash rejection. `mise exec -- pnpm check`: PASS, 0 Svelte errors/warnings. `mise exec -- pnpm lint`: PASS. No browser, Godot, full workflow E2E or manual tests ran in this increment.
- Durable frame sequences, pose-specific cancellation/retry/stale-attempt fault tests, normalization/sheets, production worker graph composition and review/publication gates remain incomplete. Phase 5 manual accessibility and observed child-usability remain deferred, not passed.

## Phase 6 — body/master lineage hardening

- Before pose/frame composition, body-type execution now reconstructs the master's provider request and checks its request hash against the supplied analysis brief. This rejects inconsistent analysis/master inputs without changing persisted graphs or the production worker. Added a fault-injected executor regression; the normal database also prohibits duplicate stage/target identities within a job.
- `mise exec -- pnpm exec vitest run packages/workflow/src/mock-stages.test.ts`: PASS, 17 tests; `mise exec -- pnpm check`, `mise exec -- pnpm lint`, and `git diff --check`: PASS. An initial attempted integration test failed at the database's unique stage/target constraint; replaced it with explicit fault injection rather than weakening the constraint. No full suite, browser or Godot tests ran.
- Pose and durable frame generation, normalization/sheets and the remaining Phase 6 gates are still unimplemented. Phase 5 manual checks remain deferred, not passed.

## Phase 6 — mock body-type library increment

- Added `determine-body-type@1` as a library stage. It verifies the adopted master artifact and analysis checkpoint, preserves the explicitly selected body type, and records a fixed (128,224) target foot anchor and resolved-input provenance. The anchor is a normalization target, not a measured anchor or evidence that the image is aligned. ADR-038 records this boundary. No production registration or publication behavior changed.
- `mise exec -- pnpm install --frozen-lockfile`: PASS (restored workspace links). `mise exec -- pnpm exec vitest run packages/workflow/src/mock-stages.test.ts`: PASS, 16 tests, including restart and rejected master-read cases. `mise exec -- pnpm check`: PASS, 0 Svelte errors/warnings. `mise exec -- pnpm lint`: PASS. Initial test invocation failed because workspace links were absent; the first check then found test TypeScript errors, corrected before the passing reruns.
- Phase 6 remains incomplete: pose and durable frame stages, real corrupt-file and cancellation/stale-attempt coverage specific to this stage, normalization/sheets, worker composition and review/publication gates remain. No full suite, browser or Godot tests ran. Phase 5 manual accessibility and observed child-usability remain deferred, not passed.

## Phase 6 — branch addressing prerequisite

- Started with a clean `main` worktree synchronized with `origin/main`. Phase 6 remains incomplete; Phase 5 manual accessibility and child-usability checks remain deferred, not passed.
- Added explicit stage-key/target-key dependency declarations while preserving existing string matching. Duplicate, ambiguous and missing matches fail before execution; resolved dependency ordering is deterministic. ADR-037 records the boundary. No production handlers, providers, database schema, review or publication behavior changed.
- Executed `mise exec -- pnpm exec vitest run packages/workflow/src/workflow.test.ts`: PASS, 27 tests. Executed `mise exec -- pnpm check`: PASS, TypeScript/Svelte, 0 errors and warnings.
- This is only a prerequisite, not the requested body/pose/frame increment: those stages, provider adaptation, frame persistence and their restart/cancellation/stale-attempt tests remain unimplemented. Anchor normalization and sheet packing also remain unimplemented and must follow separately. No browser, Godot, manual or full-suite verification was performed for this change.

## Phase 6 — reconcile worker/artifact branches (2026-10-27)

- Initial worktree was clean with local `60b5fca` and remote `7a8a709` each one commit ahead of the common foundation. Fetch and a non-mutating merge preview found ten conflicting paths. Saved local branch `backup/pre-merge-60b5fca`, then started a normal non-fast-forward merge. Both branch implementations/tests and historical progress/ADR entries are retained, not discarded or force-pushed.
- Reconciled incompatible provider interfaces using explicit exports: capture-first analysis/cleanup/master at `@doodleforge/ai`, ADR-033 metadata/frame provider at `@doodleforge/ai/capabilities`. Renamed the remote add/add test to `frame-provider.test.ts` so both provider suites execute. Updated worker imports; regenerated workspace lockfile without version upgrades.
- Fixed an otherwise hidden dispatch collision: production metadata retains `analyze-description@1`; capture-first library analysis now uses `analyze-captured-description@1`, with its master dependency/tests updated. These differ in parameters, schemas and required predecessors, so must not share a registry identity. Existing manually queued pre-merge internal capture-first graphs need explicit reconciliation/re-enqueue, not edits to immutable rows. No public enqueue existed and no user database was changed.
- Combined executor artifact verification/adopted dependency resolution with the remote runner. `stageHandler` now forwards optional storage plus the correct custom lease duration into `executeStage`; added a real PNG/SQLite regression. Extended actual-worker restart coverage to verify metadata succeeds while capture-first keys remain unclaimed. No capture-first handlers were enabled in production.
- Updated workflow docs/plans and recorded ADR-036. Earlier local entries correctly described ADR-033's absence on that branch; the reconciled branch now includes it. Production worker runs metadata-only scheduling/heartbeat/cancellation/shutdown; full generation, persisted frames, normalization/sheets/freeze/gates remain incomplete. Phase 5 manual accessibility/child-usability checks remain deferred, not passed.
- During validation, another process committed and pushed the prepared merge as `4734c26` (`Add durable mock workflow worker and deterministic AI provider`); observed local `main` and `origin/main` synchronized with both original commits retained as merge parents. The remaining reconciliation decision/progress notes are a separate follow-up documentation change; no force-push or history rewrite.

### Executed validation

| Command | Result |
|---|---|
| `mise exec -- pnpm test` | PASS: **333 tests / 21 files**, including both branches' provider/runner/artifact/process suites and merge regressions. |
| `mise exec -- pnpm install --no-frozen-lockfile`; `mise exec -- pnpm install --frozen-lockfile` | PASS: combined workspace links, no dependency version upgrades. |
| `mise exec -- pnpm check`; `mise exec -- pnpm lint` | PASS: TS/Svelte 0 errors / warnings; ESLint clean. |
| `mise exec -- pnpm build`; `mise exec -- pnpm test:smoke` | PASS: Studio/worker production builds; real HTTP publication/security/corruption/operator and worker/dev lifecycle regressions. |
| `mise exec -- pnpm test:startup` | PASS: **7** isolated startup/process tests. |

Chromium/Godot were not rerun for this merge; previous local browser focus/history failures and Godot tooling limitation remain historical/unresolved, not new passed evidence. No manual accessibility/observed-child, real-provider, credentials, artwork transfers or remote-CI checks performed. Next implementation remains durable body/pose/frame stages, normalization/sheets and separately tested capture-first production registration. Final formatting/whitespace and Git synchronization are checked after these notes.

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

[Showing lines 1-268 of 1303 (50.0KB limit). Use offset=269 to continue.]