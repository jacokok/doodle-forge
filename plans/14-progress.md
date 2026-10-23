# 14 — Persistent implementation progress

## Current phase
**Phase 4 — in progress, review/approval and publication service increments locally verified. Phase 3 is NOT fully accepted.** Phases 0–2 retain their previously recorded local status.

## Phase-gate exception — explicit user authorization
The user explicitly authorized starting **Phase 4 only** while deferring Phase 3 manual graphical playtesting. This supersedes the earlier “Do not begin Phase 4” instructions below, not Phase 3 acceptance requirements. Manual shadow/Y-sort/feel review and a human active-AI playthrough remain unchecked in [docs/phase-3-playtest.md](../docs/phase-3-playtest.md). **Phase 5 is not started.**

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
