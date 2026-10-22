# DoodleForge

DoodleForge is a local-first character creation studio, TypeScript asset-generation factory, and Godot 4 beat-'em-up. This repository is currently in **Phase 0: Planning**; application implementation must wait until the plans are reviewed.

## Start here

1. Read [AGENTS.md](AGENTS.md).
2. Read [plans/README.md](plans/README.md), [the roadmap](plans/12-implementation-roadmap.md), and [the progress tracker](plans/14-progress.md).
3. Follow the phase order and acceptance checks in the plans.

The architecture uses pnpm workspaces, SvelteKit/Svelte 5, strict TypeScript, SQLite/Drizzle, a separately-running worker, Zod contracts, Sharp, and Godot 4/GDScript. No cloud service is required for the mock workflow. See the plans for detailed interfaces, decisions, risks, and implementation sequence.
