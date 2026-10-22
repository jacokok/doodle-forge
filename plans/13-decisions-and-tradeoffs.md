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

### ADR-007 — Godot version and renderer (accepted selection, installation unverified)
**Decision:** **Godot 4.7.2-stable**, standard GDScript build, Compatibility renderer, matching export templates. **Evidence:** [official archive](https://godotengine.org/download/archive/) consulted during Phase 0 lists 4.7.2-stable (18 August 2026), while 4.8 is beta. **Rationale:** use stable Godot 4, lightweight 2D pipeline and no C# dependency. **Consequence:** Phase 1 verifies actual binary/template versions and host support; version changes require an ADR update, not a floating latest download. Planning-time web verification is not a successful local Godot test.

### ADR-008 — Reusable 2D fighter and sprite convention (accepted)
**Decision:** CharacterBody2D ground-plane root, separate visual jump elevation, AnimatedSprite2D runtime frames, data-driven timing/combat. 256×256 transparent PNG frames with (128,224) foot anchor are v1 project conventions. **Rationale:** consistent automated pipeline and reusable scenes. **Alternatives:** 3D or skeletal rigging adds art/tool complexity. **Consequence:** unusual drawings may need manual correction; dimensions are not engine restrictions. Initial executable ability is light melee; other families are extension designs, not untested placeholders.

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

## Dependencies
Plans 01–11 contain detailed consequences. Roadmap orders implementations; progress records evidence. External source availability affects research, not local test status.

## Implementation tasks
- [ ] Verify selected Godot binary and export templates in Phase 1.
- [ ] Pin and record Node/pnpm/library versions after compatibility tests.
- [ ] Record chosen real providers and consent/cost terms in Phase 7.
- [ ] Add superseding ADR for any major deviation before implementation.

## Acceptance criteria
Every major boundary has rationale and consequences. Deferred choices have an owner phase and do not masquerade as tested decisions. Changes are traceable to updated plans and relevant tests.

## Risks and limitations
Upstream releases and terms change. Reverify sources during implementation without silently upgrading established pins. Early fixed-canvas and local-trust decisions may require explicit revision as product scope grows.

## Future considerations
Signed bundles, hosted identity, storage/queue scaling, new content schemas and combat executors warrant new ADRs rather than ad hoc package dependencies.
