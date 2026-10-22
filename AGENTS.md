# Coding-agent instructions

## Project overview
DoodleForge turns children's paper drawings into approved, versioned game characters. It comprises a SvelteKit studio/API, SQLite content store, independent TypeScript workflow worker, asset tooling, and a Godot 4 2D-rendered 2.5D beat-'em-up. Current status is Phase 0 planning; do not start application implementation until Phase 0 review is complete.

## Required reading and workflow
Before implementation, read `plans/README.md`, `plans/12-implementation-roadmap.md`, and `plans/14-progress.md`, then the relevant architecture plans. Identify current phase and tasks. Inspect existing files, state a small implementation approach, implement an increment, run tests, update progress, and record any architectural change in `plans/13-decisions-and-tradeoffs.md`. Never mark unverified work complete or claim unrun tests passed.

## Technology and monorepo conventions
Use pnpm workspaces; strict TypeScript; SvelteKit with Svelte 5 and adapter-node for UI and server APIs; SQLite with Drizzle migrations; Zod and JSON Schema for contracts; Node.js worker; Sharp for image processing; Vitest, Playwright, and headless Godot tests. Godot uses GDScript and its 2D renderer. Godot 4.7.2-stable is selected in plans 03/13; verify the installed binary and matching export templates before project creation, and record any version change as a decision. Do not add Express/Nest/FastAPI, Python, n8n, Redis, Celery, Temporal, or a separate orchestration framework without a documented demonstrated need.

Keep app-specific code in `apps/`, reusable modules in `packages/`, developer commands in `tools/`, plans in `plans/`, and user/developer documentation in `docs/`. Keep boundaries explicit: routes validate/dispatch, domain services own business rules, repositories own persistence. Shared contracts are the source of truth; do not duplicate schema definitions. Generated artwork and mutable SQLite files are ignored by Git; migrations, source, docs, and small fixtures are committed. Never commit secrets or API credentials.

## Coding standards and architecture rules
Use descriptive names, small composable modules, strict types, validated public inputs, and useful error paths. Preserve every original upload immutably. Published character revisions are immutable and only become visible through atomic index/release updates after validation. Gameplay must be character-data-driven: no per-character scripts/scenes. Godot repository abstractions isolate API and offline bundle sources. AI SDKs stay behind provider interfaces. Workflow stages have typed, persistent inputs/outputs, hashes, retries, idempotency, cancellation, checkpoints, and approval gates. Keep combat independent of art and jumping visual elevation separate from ground-plane movement.

## Testing requirements
Add tests with new behavior. Cover contract/schema compatibility, migrations, server validation and routes, workflow retry/idempotency, image dimensions/hashes, publication atomicity, and Godot runtime loading/combat. Use deterministic mock AI for tests. Run relevant targeted tests and report exact commands/results; run broader suite at phase boundaries. Do not imply Godot tests ran if Godot is unavailable—record that limitation and use independently testable checks.

## Documentation and progress
Plans are normative and contain acceptance criteria. Update docs when behavior or decisions change. After every meaningful implementation milestone, update `plans/14-progress.md` with phase, completed/in-progress/blocked work, decisions, actual test results, known issues, and next actions. Record major tradeoffs in `plans/13-decisions-and-tradeoffs.md`; do not silently change decisions.

## Definition of done
A task is done only when implemented, validated by relevant executed tests, documented where necessary, and progress updated. Overall completion additionally requires operational studio/worker/database, playable Godot game, validated contracts, dynamically loaded approved characters, usable factory, approval/publishing, offline bundles, automated core workflow tests, and accurate docs. Keep every phase runnable and respect the ordered roadmap.
