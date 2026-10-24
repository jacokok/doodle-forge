# DoodleForge

Turn children's paper drawings into approved, versioned game characters.

**Current state:** Phase 5 Character Studio is in progress, not complete. The local app supports guided character metadata/creative-choice editing, private original uploads/previews, and read-only frozen history/released animation comparison when that content exists. Generation, workflow jobs, and approval/publication actions are unavailable in the app. The fixture-driven Godot prototype and published-content integration are separately verified; this is not yet an upload-to-play factory.

## Try the local studio

From this checkout (Node/pnpm versions are pinned in `mise.toml`):

```sh
mise install
mise exec -- pnpm install --frozen-lockfile
test -f .env || cp .env.example .env
mise exec -- pnpm db:migrate
mise exec -- pnpm dev:studio
```

Open <http://127.0.0.1:5173/characters> after **DoodleForge ready** appears. The home page is <http://127.0.0.1:5173>. Ctrl-C stops the studio. Existing `.env` files and local data are retained; if you customized ports, use the URL printed at startup. `HOST`, `PORT` and `ORIGIN` must describe the same loopback HTTP URL. No Godot, worker, AI credentials or fixture seed is needed to try the studio.

### What you can do today

- Create a character; save its name, description, body type, fighting style and power choice (only None is supported for powers).
- Attach/replace a private PNG/JPEG/WebP original and view its derived preview. Upload and metadata save are separate explicit actions.
- Browse Details → Private original → Review and history without losing in-memory unsaved input; edit or archive saved characters. Data survives app restarts, but unsaved input is not durable autosave.
- Inspect frozen history/decisions and compare current original art with released animation **only if those snapshots/releases already exist**. New characters have empty history; upload creates no animation or game content.

`mise exec -- pnpm dev` starts studio plus worker health lifecycle; the worker still runs no generation jobs. `pnpm db:seed` is optional synthetic metadata only, not an approved/released demo. Startup never migrates, seeds, approves or publishes automatically. Keep services loopback-only; hosted/multi-user use is unsupported.

- [Setup, troubleshooting and checks](docs/setup.md)
- [Authoring guide and limitations](docs/phase-5-authoring.md)
- [Private upload policy](docs/phase-5-uploads.md)
- [Architecture plans](plans/README.md)
- [Ordered roadmap](plans/12-implementation-roadmap.md)
- [Verified progress and limitations](plans/14-progress.md)
- [Decisions](plans/13-decisions-and-tradeoffs.md)
- [Agent instructions](AGENTS.md)

Original art and mutable storage stay local and out of Git. Comprehensive accessibility and observed child-usability acceptance remain pending; Phase 5 is not accepted.
