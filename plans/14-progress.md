# 14 — Persistent implementation progress

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
**Phase 4 — in progress, review/approval, publication, published-only content API, Godot repository/validation, bounded runtime/factory, explicit API arena and opt-in bounded validated PNG disk cache increments locally verified. Phase 3 is NOT fully accepted.** Phases 0–2 retain their previously recorded local status.

## Phase-gate exception — explicit user authorization
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
