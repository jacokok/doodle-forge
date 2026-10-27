# 12 — Implementation roadmap

## Purpose
Provide ordered, verifiable increments from documentation to playable, generated, offline content.

## Scope
Phases 0–8 in the requested order. Checkboxes mean implemented and verified, not merely planned. Phase 0 review is accepted; Phases 1 and 2 are locally verified as recorded in plan 14.

## Technical approach
At each phase: read relevant plans/progress, inspect existing code, describe a small increment, implement, run tests, fix failures, update progress and record decisions. Keep previous slices runnable. Commands below are target commands until foundation supplies them.

## Architecture and responsibilities
Agents own implementation and evidence; plans define boundaries; progress tracks actual status. Studio is content authority, worker executes jobs, publisher controls visibility, Godot consumes approved immutable packages. Cross-phase scaffolding is permitted only to support the current tested slice, never to claim future behavior implemented.

## Key design decisions
Contract precedes game and factory. API integration precedes authoring UI. To resolve ordering dependencies, Phase 4 includes minimal publisher/approval service plus explicitly approved fixture seed; Phase 5 adds user approval/publication UI. Phase 6 implements generation. Phase 5 displays genuine unavailable/pending generation state until then; it must not fake worker completion. Phase 8 adds offline implementation behind repository interface designed in Phase 4.

## Dependencies
`0 -> 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8`. If external provider access blocks Phase 7, record the block; independently testable Phase 8 preparation requires explicit scope decision, not silently skipping acceptance. Phase 0 documentation is complete only after consistency review.

## Implementation tasks

### Phase 0 — Planning
**Goal:** Leave a complete specification, no application implementation.

**Deliverables:** root README/AGENTS, all numbered plans and plan index, docs index, progress and decision records.

**Dependencies:** existing repository inspection; stable Godot release verification; SQLite integration research.

**Checklist:**
- [x] Inspect existing repository and preserve existing Git root.
- [x] Write project/agent navigation and all architecture plans.
- [x] Define concrete contract, schema, workflow and publication protocols.
- [x] Select exact stable Godot version from official archive and record evidence.
- [x] Write ordered roadmap, persistent progress and decision log.
- [x] Review file completeness, links, mandatory sections and cross-plan consistency.

**Acceptance criteria:** All requested Markdown files exist, carry required planning sections, and resolve phase/dependency ambiguities. No app code created. **Test requirements:** documentation structure/link checks and manual architectural review, recorded separately from application tests.

### Phase 1 — Monorepo foundation
**Goal:** Runnable local process skeleton and persistent data foundation.

**Deliverables:** workspace/lockfile/config, studio shell, worker lifecycle, Godot project skeleton, package boundaries, migration/seed commands, CI.

**Dependencies:** accepted Phase 0 plans, compatible Node/pnpm/Godot tools.

**Checklist:**
- [x] Pin Node LTS/pnpm/TS/SvelteKit dependencies after compatibility checks; install and lock.
- [x] Create all apps/packages/tools directories from plan 02 with explicit private exports (Godot remains native).
- [x] Configure Svelte 5/Tailwind/adapter-node and strict TS/lint/format.
- [x] Create Godot 4.7.2-stable Compatibility project, pin Linux x86_64 templates and version check.
- [x] Implement environment validation, storage roots, ignore rules and `.env.example`.
- [x] Add Drizzle baseline migration, repositories, synthetic authoring seed and migration lock/commands (ADR-015).
- [x] Add worker health/shutdown smoke lifecycle without pretending generation exists.
- [x] Add root dev/build/check/test commands and CI with frozen lockfile (local checks executed; remote CI not run).
- [x] Document setup and record executed checks/progress.

**Acceptance criteria:** Clean install, empty DB migration, studio/worker boot, Godot headless project startup and clean artifact ignores. **Test requirements:** root typecheck/build, migration/FK tests, health smoke and exact Godot version/headless startup evidence.

### Phase 2 — Character contract
**Goal:** Stable shared content boundary with real fixture assets.

**Deliverables:** Zod/JSON Schema, semantic validators, canonical hashing, valid/invalid packages and two small fixture characters.

**Dependencies:** foundation, plan 04.

**Checklist:**
- [x] Implement v1 character/release schemas and semantic cross-reference/limits checks.
- [x] Generate JSON Schema reproducibly; document unsupported version behavior.
- [x] Create small synthetic transparent sheets for all five required animations.
- [x] Package fixture manifests with real hashes/byte sizes/anchors and distinct second character.
- [x] Add invalid path/hash/dimension/animation/ability test vectors.
- [x] Add CLI validation; no Phase 2 DB migration was required because contract validation and fixture assets remain package-owned (do not rewrite history).
- [x] Record tests and finalized field decisions.

**Acceptance criteria:** Complete fixture packages validate and corruption is rejected. **Test requirements:** Vitest schema/semantic/image/hash cases and JSON Schema generation diff; Godot parity follows Phase 4 loader implementation.

### Phase 3 — Godot prototype
**Goal:** Playable single-arena fixture-driven combat.

**Deliverables:** reusable fighter scene, ground/depth/jump movement, shadow/Y-sort, state/animation controllers, light melee, enemies/waves, camera/HUD/selection.

**Dependencies:** contract fixture; plan 03.

**Checklist:**
- [x] Create ground-plane fighter hierarchy, input actions, movement and jump separation.
- [x] Implement state transitions and SpriteFrames animation controller using fixture data.
- [x] Add timed hit/hurt boxes, damage/deduplication, knockback and KO.
- [x] Add enemy approach/attack AI and bounded wave spawner.
- [x] Build arena, camera, health HUD and fixture character selection.
- [x] Add deterministic headless gameplay tests and manual playtest notes. Headless assertions and manual visual/feel review plus human two-wave playthrough are recorded in plan 14 and docs/phase-3-playtest.md. Elevated-target behavior remains an explicitly documented limitation (enemies did not jump during the playtest).

**Acceptance criteria:** Player moves, jumps, fights and completes an enemy wave; art is independent of combat and no per-character script exists. **Test requirements:** headless movement/timing/depth/team/elevation/HP/KO assertions plus manual shadow/Y-sort feel review.

### Phase 4 — Dynamic character loading
**Goal:** Runtime API content with data-only character addition.

**Deliverables:** minimal validated publication service, seeded approval records, immutable API/index, Godot repository abstraction/API implementation, decoder/cache/refresh.

**Dependencies:** Phases 1–3, plans 03/04/05/09/11; seed path supplies explicit approval before UI exists. **Explicit user phase-gate exception:** Phase 4 may proceed while Phase 3 manual shadow/Y-sort/feel review and human active-AI playthrough remain deferred, not accepted (plan 14; docs/phase-3-playtest.md). Phase 4 acceptance subsequently verified locally; the user has now explicitly authorized Phase 5 (plan 14).

**Checklist:**
- [x] Implement frozen snapshots and hash-bound approval service used by fixture seed. Verified through additive migration/immutability/gate/seed tests and isolated CLI rerun (plan 14); approval alone is not publication.
- [x] Implement staging/hash validation/release activation and crash reconciliation. Service/persistence slice locally verified (plan 14); explicit operator reconciliation now excludes publishers using fail-closed operation markers (ADR-019).
- [x] Expose only published index/manifests/assets with ETags and bounded reads. Route/security and real built HTTP checks locally verified, including historical ready releases and explicit corrupt-ready failures (plan 14).
- [x] Implement repository interface and API adapter with supported-version checks. Headless HTTP boundary/shared-v1 validation verified (plan 14, ADR-020); gameplay remains fixture-fed, decoder/cache/refresh are separate tasks.
- [x] Decode PNG runtime bytes, build atlas/SpriteFrames and instantiate existing fighter. Per-load admission/native decode/multirow resource tests and real built-published-API fighter movement/combat verified (plan 14, ADR-021); normal arena remains fixture-fed.
- [x] Wire explicit API arena discovery/selection, loading/errors and match release retention. Real built-studio arena integration verifies both prepublished fixtures, resets/waves and mid-match publication pinning (plan 14, ADR-022); default fixture mode preserved.
- [x] Add opt-in validated bounded PNG disk cache. Fixed-slot bounds, pinned-manifest revalidation, explicit corruption/FS errors and atomic installs (ADR-023); executed evidence in plan 14. Not an offline bundle.
- [x] Add coordinated catalog replacement, polling and manual refresh. Polling uses a five-second best-effort cadence; busy ticks are dropped, and poll/manual refresh share independent candidate preparation and an idle/loss/completion activation boundary (ADR-024/025).
- [x] Publish second fixture using data only and prove no gameplay source changes. The built-studio integration starts with Sprout only, publishes Comet after arena discovery, polls the new catalog, then selects and plays Comet through the generic fighter; see plan 14.

**Acceptance criteria:** New approved fixture becomes selectable/playable without import, scenes or scripts; corrupt/unpublished data is not playable. **Test requirements:** TS/Godot contract parity, API tests, publisher fault/concurrency tests, headless HTTP texture loading/fighter instantiation and second-character proof.

### Phase 5 — Character Studio
**Goal:** Usable authoring, review and release UI over actual domain services.

**Deliverables:** library/wizard/editor/history, safe upload/original preview, animation previews, approval/publication UI, job status route/UI contracts.

**Dependencies:** contract, database and Phase 4 approval/publication services. Automated generation waits for Phase 6.

**Local tryout increment:** `pnpm dev:studio` starts the existing app without the unused worker; both dev modes validate matching local host/port/origin and advertise the library only after health checks. Explicit existing migrations remain a setup step, with no automatic seed, approval or release. Startup tests and current run/try instructions are recorded in plan 14 and docs/setup.md. This improves local access only; it does not satisfy the remaining Phase 5 acceptance gates.

**Checklist:**
- [x] Implement server-validated character CRUD and optimistic revisions. Metadata/choice JSON API and remote-function library/create/edit/archive UI, shared validation and stale edit/archive tests locally verified (plan 14).
- [x] Add bounded/magic-verified upload, immutable originals and private derived previews. Additive asset persistence/shared-revision attachment, strict Sharp safety/orientation and editor upload/replacement/private delivery locally verified (ADR-028; plan 14); not generation E2E or full Phase 5 acceptance.
- [ ] Add name/description/body/fighting-style/power inputs and accessible responsive wizard. Three-step guided editor covers all five fields using the conservative supported catalog (ADR-029), optional private art and read-only review/history; Chromium verifies keyboard completion, step/input/file retention and a narrow layout. Comprehensive accessibility and observed child-usability acceptance remain pending, so this criterion is not yet accepted.
- [x] Add side-by-side previews, history and clear draft/approved/published states. Read-only history/review status and responsive side-by-side current-original/frozen-animation comparison are implemented. Current art is labeled mutable and not necessarily the frozen source; original uses the existing private owner-checked route and animation sheets use the existing ready-release content route only. Animation controls follow shared manifest data, explicit pause/replay, reduced motion and active-step/document-visibility lifecycle. Real published multi-frame/two-row browser fixtures verify timing, looping, one-shots and restart (plan 14). Browser tests cover access authority, selection, controls, failures, narrow layout and unsaved input. Explicit hash/order-bound decision and bounded fixture publication commands plus private unpublished-fixture review delivery are implemented (ADR-031). Broader manual Phase 5 acceptance remains incomplete (plan 14).
- [x] Add review/approval/publication presentation using validated seeded review versions. Latest hash-bound decisions and append-only history remain distinct from ready-release membership; explicit confirmed approve/reject/revoke/publish controls act through validated services (ADR-031).
- [x] Add job UI boundary; clearly show unavailable factory until connected. UI says no job is queued/running and retry/cancel are unavailable until Phase 6; real persisted job progress remains Phase 6.
- [ ] Add mutation protection, structured errors and keyboard/a11y checks. Mutation protections and focused Chromium keyboard/pending/errors/conflict/origin/history coverage are locally verified; guided flow now has keyboard/narrow-viewport/step-retention coverage; broader accessibility audit and observed child-usability acceptance remain pending. User has now authorized review/publication mutations, with native confirmation, stale-review CAS, uncertain-result recovery and browser publication/origin gates locally tested. Manual accessibility/observed-child acceptance remains pending.

**Acceptance criteria:** Real upload/edit/review/publish interactions work on available valid versions, invalid uploads are rejected and original hashes unchanged. **Test requirements:** Vitest route/upload/version tests; Playwright wizard, keyboard navigation, previews and approval/publish gate; do not claim full upload-to-generation E2E yet.

### Phase 6 — Asset factory
**Authorization/status:** User explicitly authorizes Phase 6 and defers outstanding Phase 5 manual accessibility/screen-reader and observed child-usability acceptance as a **phase-gate exception, not passed verification**. Review/publication features retain their recorded local verification. Phase 6 is in progress with the reconciled metadata-only mock worker and artifact/capture-first libraries (plan 14, ADRs 032–036); no complete generation feature or real provider is enabled. Remaining Phase 5 manual checkboxes remain unaccepted.

**Goal:** Complete local upload-to-game flow with no paid APIs.

**Deliverables:** durable workflow scheduler, stage graph, mock adapter, Sharp processing, sprite sheets, selective regeneration and full API-mode E2E.

**Dependencies:** Phases 1–5, plans 07/08/10.

**Checklist:**
- [ ] Implement typed stage interfaces, leases/heartbeats/fencing and attempt history. Persistence, runner and metadata-only production worker polling/heartbeat/shutdown are locally tested (plan 14); capture-first handlers remain unregistered.
- [ ] Add checkpoint/cache/input hashing, retry policies, cancellation and recovery.
- [ ] Implement capture/analysis/cleanup/master/body/pose/frame stages with mock adapter. Tested library stages persist attempt-scoped artifacts (ADRs 034–040); the synthetic frame provider does not condition pixels on the pose. Capture-first worker registration and full generation remain incomplete.
- [ ] Implement anchor normalization, sheet packing, metadata/validation and review freeze. A tested library normalization stage persists branch outputs (ADRs 041/042); its anchor is provisional, and sheet packing, metadata and review freeze remain.
- [ ] Add per-animation branching and descendant invalidation into new versions.
- [ ] Connect approval/waiting-publish gates to explicit publication jobs.
- [ ] Wire real progress/errors/previews/regeneration in studio.
- [ ] Execute two-character upload/generate/approve/publish/game-move/attack E2E.

**Acceptance criteria:** Full deterministic mock workflow passes; failed animation retries preserve originals/upstream sheets; restart/cancel races cannot publish invalid work. **Test requirements:** fake-clock workflow fault tests, real SQLite contention, Sharp golden/dimension/hash tests, Playwright + actual worker + headless Godot E2E.

### Phase 7 — Real AI integration
**Goal:** Replace selected mock capabilities with safe, consented, bounded real generation.

**Deliverables:** provider comparison/decision, at least one real adapter, provenance/cost handling and documented quality results.

**Dependencies:** Phase 6 full contract/mock/game success; provider credentials, consent and budget.

**Checklist:**
- [ ] Evaluate capability/terms/retention/licensing/cost and record selection.
- [ ] Add capability-specific adapter without changing workflow/game contracts.
- [ ] Implement consent, bounded download, credentials, rate limits and billing ambiguity handling.
- [ ] Test consenting drawings in original/cartoon/pixel policies supported by chosen adapters.
- [ ] Record consistency failures, regeneration behavior and actual cost/model versions.
- [ ] Keep default CI and local operation mock-only/no secrets required.

**Acceptance criteria:** At least one real capability generates valid reviewable content; unsupported capabilities are explicit and remain mock/disabled by configuration; no automatic private-data provider fallback. **Test requirements:** mocked SDK contract/errors, opt-in bounded live smoke and manual identity/temporal-consistency review; unavailable access recorded as blocked, never passed.

### Phase 8 — Offline content and release
**Goal:** Play immutable content offline and finish release regression/documentation.

**Deliverables:** bundle exporter/validator, local repository, export scripts/templates, regression evidence and operator/user guides.

**Dependencies:** prior accepted phases, stable publisher/runtime contract; no cloud needed for offline tests.

**Checklist:**
- [ ] Implement immutable directory bundle export with complete index/hash validation.
- [ ] Implement local repository and API/bundle parity; confined path/size checks.
- [ ] Add release-mode source selection, fallback and cache behavior.
- [ ] Export initial desktop target using matching Godot templates; record supported OS.
- [ ] Run full mock E2E, export bundle, stop server and verify both characters move/attack.
- [ ] Run corrupted bundle/missing file/unsupported schema regressions.
- [ ] Write setup, creation, recovery/backup, provider, content and release guides.
- [ ] Audit definition of done and record actual remaining limitations.

**Acceptance criteria:** Exported game works without API/worker, dynamic characters and abilities retain expected behavior, all applicable core suites pass and docs match reality. **Test requirements:** offline headless and exported desktop smoke, repository parity, reproducible bundle hashes for identical inputs, full core CI and manual play review.

## Acceptance criteria
Every completed checkbox has an implementation/test or documentation-review reference in progress. Phase gates cannot be bypassed by placeholders. Overall done means operational monorepo/studio/worker/SQLite, playable data-driven game, validated dynamic assets, approval/publishing, offline bundles, tested core flow and accurate documentation.

## Risks and limitations
Tool availability, native modules, provider access and animation quality may block individual gates. Record blocked work and independently testable next tasks explicitly. Phase ordering creates fixture-first tests before generation; do not confuse fixture success with full factory success.

## Future considerations
After release: additional content kinds, expanded combat executors, richer art pipelines, multi-user/guardian security and cross-platform exports, each with a new phase and acceptance evidence.
