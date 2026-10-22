# 13 — Decisions and tradeoffs

## Purpose
Preserve major architectural decisions and rationale so agents do not silently change them.

## Scope
Accepted planning decisions, deferred selections, compatibility boundaries and future supersession. These are design decisions, not claims of implementation.

## Technical approach
Use sequential ADR IDs with status, decision, rationale, alternatives and consequences. Changes add a superseding record and links to affected plans/tests; do not erase old rationale. Record exact tool/provider versions once selected and verified.

## Architecture and responsibilities
Implementers propose changes, update this log and relevant plans, and report effects in progress. Contract changes require TS/Godot compatibility tests; persistence changes require migrations; publication changes require crash/concurrency tests.

## Key design decisions

### ADR-001 — One SvelteKit backend (accepted)
**Decision:** SvelteKit/Svelte 5, Tailwind, adapter-node owns UI and APIs; independent Node worker owns long jobs. **Rationale:** shared TypeScript boundaries and minimal deployment complexity. **Alternative rejected:** Express/Nest/FastAPI backend or jobs inside HTTP requests. **Consequences:** server-only import boundaries, bounded handlers and a separate worker lifecycle are required.

### ADR-002 — Local SQLite and filesystem (accepted)
**Decision:** Drizzle migrations with better-sqlite3; WAL, FK enforcement, short transactions and local filesystem blobs. **Rationale:** offline-friendly, inspectable persistence without service infrastructure. **Alternative:** Postgres/object storage adds operational burden prematurely. **Consequences:** one-host deployment, backup coordination, explicit contention handling; mutable files/art ignored by Git.

### ADR-003 — Small durable workflow engine (accepted)
**Decision:** typed DAG/checkpoints in SQLite with leases and fencing, at-least-once handlers, bounded retries, hash cache and approval gates. **Rationale:** reliability at current scale without n8n/Redis/Celery/Temporal. **Consequence:** implement and test failure semantics ourselves; external paid calls cannot be promised exactly-once. Reassess only after measured scaling/operations problems.

### ADR-004 — Versioned content and approval (accepted)
**Decision:** schema version 1 separate from character version and release UUID; immutable published revisions; frozen manifest-hash approval; regeneration creates new version. **Rationale:** reproducibility and child's creative control. **Alternative rejected:** mutable current-character JSON or approval by character ID alone. **Consequence:** history/storage grow, approval must be repeated after any change.

### ADR-005 — Atomic visibility, not cross-resource transactions (accepted)
**Decision:** validate/stage/rename immutable files before SQLite active release activation; API visibility follows ready release DB references. CAS prevents concurrent release lost updates. **Rationale:** no atomic filesystem+SQLite transaction exists. **Consequence:** orphan reconciliation and failure injection required; offline exporter separately atomically renames a complete bundle. Static serving of all storage is forbidden.

### ADR-006 — API in development, bundle in release (accepted)
**Decision:** Godot repository abstraction with API and local bundle implementations; SQLite plugin optional future only. **Evidence:** [godot-sqlite](https://github.com/2shady4u/godot-sqlite) offers a Godot 4 GDExtension requiring native integration. **Rationale:** avoid platform dependencies, live DB schema coupling and exposure of authoring data. **Consequence:** runtime PNG decode remains necessary for all repositories; plugin compatibility is not yet tested.

### ADR-007 — Godot version and renderer (accepted; Phase 1 verification addendum below)
**Decision:** **Godot 4.7.2-stable**, standard GDScript build, Compatibility renderer, matching export templates. **Evidence:** [official archive](https://godotengine.org/download/archive/) consulted during Phase 0 lists 4.7.2-stable (18 August 2026), while 4.8 is beta. **Rationale:** use stable Godot 4, lightweight 2D pipeline and no C# dependency. **Consequence:** Phase 1 verifies actual binary/template versions and host support; version changes require an ADR update, not a floating latest download. Planning-time web verification is not a successful local Godot test.

### ADR-008 — Reusable 2D fighter and sprite convention (accepted)
**Decision:** CharacterBody2D ground-plane root, separate visual jump elevation, AnimatedSprite2D runtime frames, data-driven timing/combat. 256×256 transparent PNG frames with (128,224) foot anchor are v1 project conventions. **Rationale:** consistent automated pipeline and reusable scene. **Alternatives:** 3D or skeletal rigging adds art/tool complexity. **Consequence:** unusual drawings may need manual correction; dimensions are not engine restrictions. Initial executable ability is light melee; other families are extension designs, not untested placeholders.

### ADR-009 — Zod source plus cross-language validation (accepted)
**Decision:** Zod -> reproducible JSON Schema; Godot validates supported v1 fields/semantics via shared test vectors. **Rationale:** single public contract without embedding JS in game or mandating schema plugin. **Consequence:** parity tests are mandatory; JSON Schema alone cannot guarantee hashes, file layout or cross-reference semantics.

### ADR-010 — Mock before paid AI (accepted)
**Decision:** deterministic mock provider and real Sharp outputs precede provider integrations; capabilities route independently. **Rationale:** testability, budget control and contract-first development. **Deferred:** specific real providers/models until Phase 7 capability/privacy/licensing evaluation. **Consequence:** mock success proves mechanics, not AI quality; user consent is required before external transfer.

### ADR-011 — Phase dependency resolution (accepted)
**Decision:** Phase 4 implements minimal publication/approval services and approved fixture seed, Phase 5 adds UI, Phase 6 connects factory, Phase 8 adds bundle implementation. **Rationale:** dynamic API loading cannot depend on future UI/factory; publishing UI needs actual service. **Consequence:** Phase 5 generation UI is honest about unavailable worker functionality; full upload-to-game proof is Phase 6, not Phase 5.

### ADR-012 — Local trust boundary and privacy (accepted)
**Decision:** loopback default, origin/CSRF protections, private originals, bounded/decoded uploads, metadata-stripped derivatives, no secret/personal-data logging. **Rationale:** children's art deserves minimization even locally. **Consequence:** public/LAN multi-user deployment requires authentication, authorization, retention/consent review and HTTPS as a separate prerequisite. Hashes are integrity checks, not signatures.

### ADR-013 — Existing repository root and toolchain selection (accepted)
**Decision:** use existing `/home/doink/projects/doodle-forge` Git root for the DoodleForge product; do not create nested `doodleforge/.git`. Only Markdown delivered in Phase 0. Node LTS/pnpm/dependency exact versions are selected and pinned after Phase 1 compatibility checks. **Rationale:** preserve existing repository and avoid claiming untested dependency combinations. **Consequence:** no executable development commands exist yet.

### ADR-014 — Verified foundation toolchain (accepted, Phase 1)
**Decision:** pin Node 22.23.3 maintenance LTS, pnpm 10.34.7, TypeScript 6.0.3, Svelte 5.57.2, SvelteKit 3.1.0, Vite 8.3.5, adapter-node 6.0.0, Tailwind 4.3.3, Drizzle ORM 0.45.4 / kit 0.31.11, better-sqlite3 13.0.3 and Zod 4.6.7. All direct dependencies use exact versions and the workspace lockfile. **Rationale:** installed Node 22 satisfies checked engine ranges; global Node 26 is not the LTS pin. Kit 3 requires TypeScript ^6 and uses Vite-plugin configuration, `$app/tsconfig` and `$app/env`; use its actual interfaces rather than legacy Kit 2 scaffolding. **Alternatives:** floating latest or upgrading the machine's global runtime; rejected for reproducibility. **Consequences:** Python/C++ may be required solely for native SQLite build tooling. Internal TS source exports are bundled by Vite/esbuild; better-sqlite3 remains an explicit external native runtime dependency in both apps. Built outputs currently run from the checkout, not standalone deployment directories. Registry-based pnpm invocation was used because the mise GitHub binary download timed out. See docs/setup.md and progress for executed compatibility evidence.

### ADR-015 — Incremental persistence and honest foundation seed (accepted, Phase 1)
**Decision:** baseline migration creates characters, character_versions, abilities and character_abilities plus fundamental FK/JSON/status/version checks. Add assets/original links, contract validation, publication immutability, approvals/releases and durable workflow tables through new migrations in their consuming phases (2/4/5/6); never rewrite the baseline. The deterministic foundation seed creates only one synthetic authoring identity, without artwork, versions, catalog abilities, approval or release. **Rationale:** avoid duplicating not-yet-executable contracts or fabricating approved content to make a foundation look feature-complete. **Consequences:** Phase 1 DB readiness does not establish publication/workflow acceptance. Repository optimistic updates, rollback, FK checks, migration exclusion and real two-connection writer contention are independently testable now. Game fixtures/ability catalog remain contract-owned and approval-gated in the planned phases.

### ADR-016 — Executable v1 contract and fixture implementation (accepted, Phase 2)
**Decision:** Implement the plan 04 v1 DTOs as strict Zod 4 schemas in `packages/contracts`; generate committed draft-2020-12 JSON Schema with Zod's built-in converter and format deterministically. Keep semantic references, animation-sheet dimension rules, safe package paths, PNG dimensions, byte lengths and SHA-256 checks in the package validator. Canonical hashing sorts object keys recursively while preserving array order; release manifest hashes remain hashes of exact UTF-8 bytes as specified in plan 04. Add two small authored synthetic character packages with five required animations each. **Rationale:** one executable TS source of truth with explicit semantic checks that a schema converter cannot express; avoid an incompatible third-party converter. **Alternative rejected:** duplicating schema logic or silently adding persistence constraints before a consuming DB feature exists. No Phase 2 DB migration was required. **Consequences:** consumers must reject unsupported schema versions and validate files in addition to structural JSON; Godot parity remains an acceptance task for Phase 4 and has not been claimed. See `packages/contracts` and Phase 2 evidence in plan 14.

### ADR-007 verification addendum — Phase 1
Installed engine `4.7.2.stable.arch_linux.ed1daf0bf` matches official Linux debug/release templates `4.7.2.stable.official.ed1daf0bf`. Official template archive SHA-512 check passed before extraction; SHA-256 is recorded in docs/setup.md. Both actual template executables were version-checked before project creation. Headless Compatibility project import and three skeleton assertions passed. No version change; Linux x86_64 only, no export/gameplay acceptance claim.

### ADR-017 — Fixture-fed Phase 3 prototype boundary (accepted, incremental)
**Decision:** begin Phase 3 with a reusable generic fighter script and a local Phase 2 manifest loader for core movement/jump/melee assertions. Keep fighter configuration data-driven and combat independent of visual assets. **Rationale:** validate ground-plane/elevation separation and attack timing before expanding arena, enemy AI, waves, or sprite rendering. **Consequence:** this increment is not Phase 3 acceptance: active-wave progression, animation rendering, controls, HUD health binding, and manual visual playtest remain outstanding. No Phase 4/API/release behavior is introduced.

## Dependencies
Plans 01–11 contain detailed consequences. Roadmap orders implementations; progress records evidence. External source availability affects research, not local test status.

## Implementation tasks
- [x] Verify selected Godot binary and Linux x86_64 export templates in Phase 1 (ADR-007 addendum).
- [x] Pin and record Node/pnpm/library versions after compatibility tests (ADR-014).
- [ ] Record chosen real providers and consent/cost terms in Phase 7.
- [ ] Add superseding ADR for any major deviation before implementation.

## Acceptance criteria
Every major boundary has rationale and consequences. Deferred choices have an owner phase and do not masquerade as tested decisions. Changes are traceable to updated plans and relevant tests.

## Risks and limitations
Upstream releases and terms change. Reverify sources during implementation without silently upgrading established pins. Early fixed-canvas and local-trust decisions may require explicit revision as product scope grows.

## Future considerations
Signed bundles, hosted identity, storage/queue scaling, new content schemas and combat executors warrant new ADRs rather than ad hoc package dependencies.
