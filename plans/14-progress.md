# 14 — Persistent implementation progress

## Purpose
Record verified milestones, current work, decisions, tests, blockers and next actions across agent sessions.

## Scope
All phases. Update after every meaningful implementation milestone. Planning completion is not application completion.

## Technical approach
Keep phase status and task checkboxes consistent with plan 12. For every milestone report files/behavior changed, exact executed validation and outcome, limitations and next actions. Never turn an unavailable test into a pass.

## Architecture and responsibilities
Implementing agent maintains this file and records architectural changes in plan 13. Agents must read this tracker, plan index and roadmap before implementation. Plans specify intended behavior; this file records actual state.

## Key design decisions
- Existing Git repository remains the project root; no nested repository/reinitialization.
- SvelteKit is UI/API; independent TypeScript worker; SQLite/Drizzle metadata and filesystem images.
- Node 22.23.3 maintenance LTS/pnpm 10.34.7/TypeScript 6.0.3 and exact dependency pins verified together (ADR-014). SvelteKit 3 configuration/API conventions are used, not Kit 2 scaffolding.
- Godot 4.7.2-stable binary and actual official Linux x86_64 debug/release templates verified before project creation; no version change (ADR-007 addendum).
- Baseline persistence is intentionally incremental: four tables now, contract/asset/publication/workflow additions through new migrations in consuming phases (ADR-015).
- Seed is deterministic synthetic authoring metadata only. It cannot produce game-visible/approved content. Ability catalog and approved fixtures remain Phase 2/4 work.
- Hash-bound approval, immutable revisions, filesystem-first publication/transactional active release, API development and offline bundle release designs are unchanged and not implemented by this foundation.
- Deterministic mock workflow still precedes real provider selection and paid calls.

## Dependencies
Phase 0 review and explicit Phase 1 authorization were supplied by the user. Toolchain and Linux template prerequisites are now verified. Phase 2 requires review of this foundation and the contract specification; real providers remain a Phase 7 dependency.

## Implementation tasks
### Current phase
**Phase 1 — Foundation complete and locally verified (2026-10-22).** Stopped at the phase boundary. Remote CI is configured but has not run; no Phase 2 implementation has started.

### Completed tasks
#### Phase 0 (retained history)
- [x] Inspected existing Git root/initial README, wrote root navigation/AGENTS, plan index, all fifteen numbered plans and docs index.
- [x] Specified contract, database, workflow, approval/publication and phase ordering; reviewed links/required sections/architectural consistency.
- [x] Selected Godot stable from official archive; local installation was intentionally unverified at planning time.
- [x] Phase 0 documentation review accepted; user authorized Phase 1.

#### Phase 1 increments
- [x] **Workspace/toolchain:** `mise.toml`, exact private manifests/exports for apps/packages/tools, `pnpm-lock.yaml`, strict root/studio TS, lint/format, engine/peer enforcement, ignored build/runtime artifacts. Later-feature packages export empty modules with explicit phase ownership, not pretend implementations.
- [x] **Config/persistence:** server-only Zod environment checks, checkout-relative storage/DB roots and `.env.example`; Drizzle baseline migration/snapshot, WAL/FK/busy timeout, migration exclusion lock, character repository optimistic edits and deterministic metadata-only seed. Tested empty/repeat migrations, FK/unique/JSON constraints, rollback, cross-connection persistence/stale edits and real writer contention.
- [x] **Process skeleton:** Svelte 5/Tailwind/adapter-node studio shell plus `/api/health`; independent Node worker `/health`, truthful generation-unavailable status, signals and clean DB shutdown. Neither process implicitly migrates. Root dev supervisor terminates both children on shutdown/failure.
- [x] **Godot:** native Compatibility project, main scene and headless assertion runner; engine and actual debug/release template version enforcement, bounded imports/tests, source `.gd.uid` identity file.
- [x] **Verification/docs:** Vitest, built-process/restart/signal smoke, Chromium keyboard/shell test; CI split into TS/browser/Godot jobs; `docs/setup.md`, README, agent navigation and ADR-014/015 updated. All nine Phase 1 roadmap items synchronized with executed local evidence below.

### Tasks in progress
None. Awaiting foundation review/next-phase authorization; do not silently start contract/gameplay/factory implementation.

### Blocked tasks
No local Phase 1 acceptance blocker remains. The mise pnpm binary download timed out; exact pnpm was successfully obtained via the npm-registry fallback documented below. Template download initially timed out, then resumed successfully and passed official checksum verification. Remote CI execution is unverified, not counted as a pass.

### Phase status
| Phase | Status | Evidence |
|---|---|---|
| 0 planning | Complete and reviewed | Original 19 Markdown files; structure/link/manual consistency review |
| 1 foundation | Complete, locally verified | Frozen clean-snapshot install, strict checks/build, 18 tests, process smoke, 1 Chromium test, 3 Godot assertions; setup/CI definitions added |
| 2 contract | Not started | Empty package boundary only; no executable public schemas/fixtures/catalog |
| 3 game prototype | Not started | Native engine skeleton only; no movement/combat |
| 4 dynamic loading | Not started | Publisher package boundary only; no approval/content API/repository |
| 5 studio | Not started | Foundation shell only; no authoring/uploads/review |
| 6 factory | Not started | Worker lifecycle only; no scheduling/generation/Sharp behavior |
| 7 real AI | Not started | No providers, credentials or paid calls |
| 8 offline/release | Not started | Templates installed, no bundles/exported game |

### Test results
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

### Known issues and limitations
- Foundation only: no public character schemas, asset validation, ability catalog, immutable publication guards, content API, authoring, durable generation, gameplay or offline bundle/export exists yet. Additive migrations must implement those before the respective phase acceptance.
- `content:validate` and `content:bundle` intentionally exit nonzero; no fake validator/export.
- Built server/worker require the checkout and installed native dependency; no standalone deployment artifact/support claim.
- CI YAML exists but remote GitHub Actions has **not** run. No manual graphical Godot editor/playtest or exported desktop game test was performed. Headless scene checks do not establish visual feel.
- Verified engine/template host is Linux x86_64 only. Playwright warns about unsupported Arch and uses its Ubuntu fallback; the actual local browser test passed.
- Drizzle kit brings deprecated transitive esbuild-kit packages; no install/test failure observed. Native SQLite may require compiler/make/Python tooling. No Python application/runtime dependency was added.
- Migration locks after SIGKILL require deliberate operator inspection/removal; see setup. Automated backup/orphan tooling remains future work.
- Real provider terms/cost/privacy/animation quality remain unevaluated. Initial operation is loopback-only, not secure public multi-user hosting.

### Next actions
1. Review the foundation, ADR-014/015 and local test evidence; execute configured CI when pushed.
2. On Phase 2 authorization, read plan 04 and relevant game/content plans; implement the Zod v1 contract, semantic validators, generated JSON Schema, canonical hashes and two real synthetic fixture packages.
3. Add contract/catalog constraints through a new migration and real validation CLI; do not rewrite the baseline or treat the metadata seed as an approved character.

## Acceptance criteria
Progress reflects only completed and verified work, links to plan decisions, explicitly names unrun tests and leaves a clear next task. Phase boundaries require review; foundation completion does not imply application completion.

## Risks and limitations
Checkbox drift can mislead future agents; synchronize roadmap at each milestone. A researched version is not a tested toolchain and a fixture/shell test is not full generation E2E.

## Future considerations
Append concise dated/milestone entries during implementation, retaining major test failures/recovery evidence and referencing detailed logs without committing sensitive runtime artifacts.
