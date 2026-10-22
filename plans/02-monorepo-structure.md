# 02 — Monorepo structure

## Purpose
Specify code ownership, package dependencies, development commands, and tracked artifacts.

## Scope
Phase 1 creates the following structure; Phase 0 creates documentation only. Use the existing repository root (`doodle-forge` on this machine) as the DoodleForge repository, not a nested Git repository.

## Technical approach
Use pnpm workspaces `apps/*`, `packages/*`, `tools/*`, with private `@doodleforge/*` packages and `workspace:*` internal dependencies. Pin Node LTS and pnpm exact versions after compatibility checks in Phase 1, commit lockfile and centralized strict TypeScript configuration. Godot is a native project controlled by root scripts, not compiled as TypeScript.

```text
apps/studio/                   SvelteKit, Svelte 5, Tailwind, adapter-node
apps/worker/                   CLI entrypoint, stage registration, signals
apps/game/                     Godot project, reusable scenes, scripts, tests
packages/contracts/            Zod, generated JSON Schema, fixtures
packages/database/             Drizzle schema, SQL migrations, repositories
packages/workflow/             durable scheduling, state machine, stage APIs
packages/ai/                   capability-based provider adapters, mock
packages/image-processing/     Sharp normalization, alignment, validation
packages/animation/            pose/frame sequences and sheet packing
packages/content-publisher/    revision validation, publication, bundle export
packages/shared/               small environment-neutral utility primitives
 tools/content-cli/            validate, seed, inspect, export commands
 tools/godot-validation/       TS harness invoking pinned Godot binary
plans/                         architecture, roadmap, progress
 docs/                         operational/developer guides
storage/{originals,generated,approved,published,db}/  ignored mutable data
```

## Architecture and responsibilities
Dependency direction: apps/tools -> feature packages -> contracts/shared. `database` depends on contracts/shared; `workflow` depends on database/contracts but not SvelteKit; `ai` must not depend on worker. Worker composes stage handlers using AI/image/animation/publisher. Publisher depends on database/contracts/image validation, not workflow orchestration. Game consumes serialized contracts, never TypeScript or SQLite internals. Keep `shared` small; do not use it as a business-logic dumping ground.

## Key design decisions
Root command targets (planned, not yet available): `pnpm dev` starts studio + worker; `dev:game` launches Godot separately; `build`, `check`, `lint`, `format:check`, `test`, `test:e2e`, `test:godot`, `db:generate`, `db:migrate`, `db:seed`, `content:validate`, `content:bundle`. Each target must propagate failure. CI uses frozen lockfile and separate browser/Godot jobs. Declare `GODOT_BIN` override while verifying expected version. `.env.example` contains safe defaults only and documents absolute resolved storage root.

Ignore `node_modules`, build caches, `.svelte-kit`, `.godot`, `.env*` except example, mutable DB/WAL/SHM files, generated artwork, exports and runtime storage. Commit SQL migrations, generated schema, source, docs and tiny authored fixtures under package test fixtures (not storage). Never ignore all PNGs globally.

## Dependencies
Foundation precedes executable features; migrations can establish structure in Phase 1, with contract-dependent checks finalized Phase 2. Select native Sharp/SQLite driver builds compatible with the pinned Node version.

## Implementation tasks
- [ ] Scaffold apps/packages and explicit package exports; add TypeScript project configs.
- [ ] Add lint/format/check/test scripts, environment validation and ignore rules.
- [ ] Pin toolchains and Godot export templates; document installation.
- [ ] Create base migration and deterministic dev seed; no unreviewed schema push.
- [ ] Add CI installation, typecheck and initial smoke tests.

## Acceptance criteria
Fresh checkout can install with frozen lockfile, migrate an empty DB, launch studio/worker and open game skeleton. All root commands have documented behavior and return meaningful exit codes. `git status` remains clean after generation except intended source changes.

## Risks and limitations
Native dependencies and Godot export templates vary by OS. Parallel dev processes need clean termination and port configuration. Do not promise all target exports in the foundation phase.

## Future considerations
Add package caching/build graph tooling only if pnpm scripts become insufficient; publishing internal npm packages is unnecessary initially.
