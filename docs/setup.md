# Local foundation setup

The foundation provides process/storage/database skeletons. Phase 3 adds fixture gameplay; Phase 4 adds [fixture review/approval](phase-4-review.md), [immutable publication services](phase-4-publication.md) and a [published-only content API/operator audit](phase-4-content-api.md). Phase 4 Godot API loading is locally verified; Phase 5 now provides a [metadata character library/editor and JSON API](phase-5-authoring.md). Phase 5 also supports [safe private originals/previews](phase-5-uploads.md); generation remains unavailable. See [progress](../plans/14-progress.md) for evidence, phase-gate exceptions and remaining acceptance work.

## Prerequisites and installation

Linux x86_64 is the verified foundation host. Toolchain versions are in `mise.toml`, `package.json` and `pnpm-lock.yaml`: Node **26.12.1**, pnpm **10.34.7**, TypeScript **6.0.3**, Svelte **5.57.2**, SvelteKit **3.1.0**, Vite **8.3.5**, adapter-node **6.0.0**, Tailwind **4.3.3**, Drizzle ORM **0.45.4**, better-sqlite3 **13.0.3**. Node 26.12.x is the selected runtime (ADR-018); the engine range accepts Node 26 from 26.12.0, while mise and CI select 26.12.1 for reproducibility.

```sh
mise install
mise exec -- pnpm install --frozen-lockfile
test -f .env || cp .env.example .env
mise exec -- pnpm db:migrate
mise exec -- pnpm dev:studio
```

With mise shell integration enabled, entering the checkout selects its tools automatically; no version-prefixed commands are needed. Otherwise use `mise exec -- pnpm <command>` or install compatible Node/pnpm yourself. pnpm remains at 10.34.7; this is not a pnpm upgrade. After switching Node majors, run `pnpm rebuild better-sqlite3 esbuild` to rebuild native dependencies before testing. better-sqlite3 may require a C++ compiler, make, Python for node-gyp and Node headers; Python is build tooling, not an application runtime. Only better-sqlite3/esbuild install scripts are permitted by workspace policy.

Root configuration loads `.env`; inherited environment variables take precedence. Relative storage/DB paths resolve from the workspace checkout, even when started inside an app directory or from a built entrypoint. Defaults create `storage/{originals,generated,approved,published,db}` and `storage/db/doodleforge.sqlite`. Do not place the DB on network storage. Originals are never statically/publicly served; explicit confined private authoring routes now deliver retained originals/previews. Set `BODY_SIZE_LIMIT=10551296` in the adapter-node process environment for the bounded 10 MiB + 64 KiB multipart envelope (its default 512K rejects larger uploads); reverse proxies must also bound requests. See the [upload guide](phase-5-uploads.md). Never commit `.env`, mutable DBs, generated art or secrets. Config currently rejects non-loopback service hosts/origins; hosted deployments are unsupported. Set `HOST`, `PORT`, `ORIGIN` and distinct `WORKER_PORT` consistently when changing ports. **Set `ORIGIN` before building as well as at runtime**: the pinned Kit 3/adapter-node 6 uses build-time `paths.origin`, configured from the validated local config. It does not use runtime `ORIGIN` to infer HTTP request URLs. Rebuild after changing studio origin; otherwise same-origin authoring/remote mutations will be rejected. Do not disable CSRF or trust client-supplied forwarding headers to work around this.

Open **http://127.0.0.1:5173/characters** after the **DoodleForge ready** message. The home page is `http://127.0.0.1:5173`, health is `/api/health`. `dev:studio` starts only the studio: no worker, Godot, credentials or fixture seed is needed. Create/save metadata and conservative creative choices, attach/replace private originals, inspect history and explicitly review/publish supported existing frozen fixtures. New characters have no frozen versions or released animations; uploads do not generate them. [Authoring guide](phase-5-authoring.md) explains available actions, stale-edit recovery and in-memory unsaved input. Saved data persists across restarts; unsaved input is not autosave.

Use `mise exec -- pnpm dev` when you also want the worker (`http://127.0.0.1:5174/health` by default). Phase 6 now polls durable jobs and executes only the registered offline mock description-analysis stage; no Studio enqueue/generation controls or full factory are available yet. Normal startup creates no jobs. See [worker boundaries and shutdown](phase-6-workflow.md). `DOODLEFORGE_WORKER_CONCURRENCY` defaults to 1 and accepts integers 1–4; no real-provider configuration is enabled. Both modes load root `.env` with inherited overrides and reuse server config validation. The supervisor checks that `HOST`, `PORT` and `ORIGIN` describe the same loopback HTTP URL, requires the exact studio port (`--strictPort`, no silent fallback), then prints the `/characters` URL only after the requested services return healthy/unavailable-generation status. Vite's own earlier “ready” message only means its listener started, not that the database/app is usable. `dev:studio` does not bind the worker port, though the shared config must still be valid. Ctrl-C/SIGTERM stops launched children; failure of either child in combined mode stops the other.

Startup never migrates or seeds. For a new/outdated DB, stop services and explicitly run `mise exec -- pnpm db:migrate`, then restart. This applies existing committed migrations; no new migration is introduced by the launcher. `mise exec -- pnpm db:seed` is optional synthetic metadata only. Existing edits are not overwritten and no art, versions, approvals or releases are created. Keep your existing `.env`; do not replace it blindly. If startup reports invalid/mismatched configuration, check both `.env` and inherited shell variables. If a port is occupied, stop the known owning process or choose matching `HOST`/`PORT`/`ORIGIN` and a distinct `WORKER_PORT`; do not disable origin checks. Readiness is a startup health check, not a continuous guarantee or content audit.

## Database baseline and recovery

The baseline has `characters`, `character_versions`, `abilities`, and `character_abilities`, with real FKs, unique versions, checked JSON/status/revisions and WAL/5-second busy timeout. `CharacterRepository` supplies persistence, optimistic metadata updates and non-destructive archive. The Phase 5 domain service validates shared metadata contracts; authoring changes never rewrite frozen versions or ready releases. Phase 4 migration 0001 adds frozen manifest bytes/hashes, append-only approvals and immutability guards; 0002 adds immutable releases/entries and the active-release pointer. Migration 0003 adds immutable original/preview assets and the selected original reference. Migration 0004 adds durable workflow jobs/steps/attempts. Run `pnpm db:migrate` before starting the updated worker; it refuses missing workflow tables and never migrates implicitly. The Studio still has no generation enqueue path.

`pnpm db:seed` creates one deterministic synthetic authoring identity, without art, versions, abilities, approvals or releases. Repeating it does not overwrite edits. `content:seed` is a separate explicit fixture-review/approval command; it does not publish game content. To try Phase 5 review/publication, run it deliberately, then select Sprout or Comet in Review and history. Inspect the private frozen animations, reject/approve as desired and explicitly confirm Publish version. This changes real local release visibility; normal startup never does it. See [action limits and recovery](phase-5-authoring.md#review-and-publication-actions).

Before resuming interrupted publishers, stop publishing processes and run `pnpm content:reconcile`. See [safe operation, stale markers and corrupt-ready recovery](phase-4-content-api.md#operator-recovery). The audit never deletes or auto-activates content and refuses active publisher registrations.

- `pnpm db:generate`: generate a new committed Drizzle migration after a schema change. Never edit an applied baseline or use schema push.
- `pnpm db:migrate`: apply committed migrations under exclusive `<database path>.migrate.lock`. Start only one migrator. On failure the owned lock is released. After a killed process, inspect its PID in the lock, confirm no migration process remains, back up the DB, then manually remove that stale lock and rerun. Never blindly delete a live lock.
- Backups: stop studio/worker/migrators before copying the DB and matching storage tree. Do not copy a live SQLite main file alone while WAL is active. Automated backup/restore and orphan tooling are not implemented yet.

## Build and checks

Run these with the pinned toolchain:

```sh
pnpm check
pnpm lint
pnpm format:check
pnpm test
pnpm build
pnpm test:smoke
pnpm test:startup
pnpm exec playwright install chromium
pnpm test:e2e
pnpm test:godot
```

Studio UI/server guidance: prefer Svelte's experimental async support and remote functions for same-app data loading, queries and mutations wherever applicable; see [plan 06](../plans/06-sveltekit-studio.md) for boundaries and compatibility/testing requirements. Keep explicit HTTP routes for stable external/public protocols and unsupported binary/streaming cases.

`check` checks strict TS plus Svelte; `test` uses isolated temporary SQLite/filesystems. `test:startup` runs seven real dev-launcher checks on temporary SQLite/storage and ephemeral loopback ports: invalid/mismatched config before storage creation, unmigrated DB refusal, studio-only operation with an occupied worker port, empty library without implicit seed, saved metadata across restart, readiness, SIGINT/SIGTERM cleanup, strict studio-port refusal and combined worker failure cleanup. It does not touch local authoring data or build output. `build` emits adapter-node output and a bundled worker (native SQLite and Sharp remain external). `test:smoke` migrates temporary storage, launches **built** processes, checks health/private-file refusal, restarts worker, tests SIGTERM, then starts the actual dev supervisor and checks SIGINT child cleanup. `test:e2e` rebuilds the studio for its test origin, migrates isolated temporary DB/storage, seeds synthetic approved fixtures and one ready release, then checks the real metadata/editor/history/review UI with Chromium. Coverage includes keyboard authoring and frozen-version selection, approved-but-unpublished versus ready-published states, confined published preview delivery, empty/archived histories, pending/errors, unsaved-input retention, structured validation/conflicts, origin protection and private upload/preview/replacement. It cleans the temporary tree on shutdown and does not reuse local authoring data. Chromium cases run serially against their shared suite-local DB/storage to avoid cross-test interference. The ignored studio build is left configured for the test origin; run `pnpm build` again with your normal `ORIGIN` before launching it locally. This is not a character factory E2E. CI has separate TS, browser and Godot jobs with frozen installation; remote CI has not been executed by the local agent.

Run built processes from the checkout after migrating:

```sh
BODY_SIZE_LIMIT=10551296 node apps/studio/build/index.js
# separate terminal
node apps/worker/dist/index.js
```

Packages are private/source-exported. Vite and esbuild bundle internal server packages; server-side SQLite and worker Sharp stay external. Built outputs currently require the checkout, its installed dependencies and workspace marker; standalone deployment packaging is deferred. Empty exported modules mark later phase ownership and implement no fake features. `content:validate <character.json>` validates Phase 2 package files; `content:bundle` remains unimplemented and exits nonzero.

## Godot pin and templates

Required engine: **4.7.2-stable**, standard GDScript, Compatibility renderer. Verified locally: Arch binary `4.7.2.stable.arch_linux.ed1daf0bf` and official Linux debug/release templates `4.7.2.stable.official.ed1daf0bf`.

Download the Linux x86_64 engine, `Godot_v4.7.2-stable_export_templates.tpz`, and `SHA512-SUMS.txt` from the [official release](https://github.com/godotengine/godot/releases/tag/4.7.2-stable). Verify archive checksums before extracting (the CI workflow shows exact commands). Locally the template archive's official SHA-512 check passed; its SHA-256 is `f298490b8d44d934be425a5a65a51bf15f422428b229a06a6e11d9ffea248011`.

Place `version.txt`, `linux_debug.x86_64`, and `linux_release.x86_64` in `${XDG_DATA_HOME:-$HOME/.local/share}/godot/export_templates/4.7.2.stable/` and make the executables executable. Full templates may also be installed through the editor. `GODOT_TEMPLATE_DIR` overrides that directory; `GODOT_BIN` overrides the executable. The harness verifies **both actual template executables**, not just a version label, before importing/testing the project. This Linux-specific template verification does not claim macOS/Windows export support.

`pnpm dev:game` opens the editor after version/template checks. `pnpm test:godot` runs bounded headless import, three startup assertions and 57 Phase 3 gameplay assertions, including fixture PNG resources. This does not establish manual visual acceptance or Phase 4 HTTP loading; desktop export remains later work. Runtime imports/caches live in ignored `.godot`; commit GDScript `.uid` identity files.
