# DoodleForge

Turn children's paper drawings into approved, versioned game characters.

**Current state:** Phase 1 foundation: pnpm workspace, SvelteKit studio shell, independent worker health lifecycle, SQLite/Drizzle baseline and Godot skeleton. Character authoring, generation, publishing and gameplay are not implemented yet.

- [Local setup and commands](docs/setup.md)
- [Architecture plans](plans/README.md)
- [Ordered roadmap](plans/12-implementation-roadmap.md)
- [Verified progress and limitations](plans/14-progress.md)
- [Decisions](plans/13-decisions-and-tradeoffs.md)
- [Agent instructions](AGENTS.md)

Quick start with the pinned tools:

```sh
mise install
mise exec -- pnpm install --frozen-lockfile
mise exec -- pnpm db:migrate
mise exec -- pnpm db:seed
mise exec -- pnpm dev
```

Studio runs at <http://127.0.0.1:5173>. See setup for environment overrides, Godot/template installation and test commands. Original art and mutable storage stay local and out of Git.
