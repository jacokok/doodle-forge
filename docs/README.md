# Documentation index

## Purpose
Provide the entry point for operational and developer documentation as implementation becomes real.

## Scope
Phase 1 foundation has an executable [local setup guide](setup.md). Other guides below remain future work, not completed features. Start with [project plans](../plans/README.md), [roadmap](../plans/12-implementation-roadmap.md), [progress](../plans/14-progress.md) and [agent instructions](../AGENTS.md).

## Technical approach
Write guides alongside verified implementation. Every command must be tested and its required tools/configuration explained; never copy unimplemented target commands as working setup instructions.

## Architecture and responsibilities
Plans specify intended architecture and acceptance. Docs explain actual use/operation. Contributors keep both consistent; progress reports known differences and test evidence.

## Key design decisions
Keep secrets/child artwork out of examples and logs. Use tiny synthetic fixtures and mock provider in tutorials. Explicitly distinguish API development source and offline bundle release source.

## Dependencies
Guides depend on relevant roadmap phases being implemented and tested.

## Implementation tasks
- [x] Phase 1: [setup.md](setup.md) — pinned tools, environment, workspace commands, migrations, templates, tests and process shutdown.
- [ ] Phase 2: `content-contract.md` — schema generation, fixtures, compatibility and validation CLI.
- [ ] Phase 3–4: `game-development.md` — input/arena, headless tests, repositories, runtime decoding and refresh.
- [ ] Phase 5–6: `character-creation.md` — upload, choices, preview, regeneration, approval and publish.
- [ ] Phase 6: `worker-operations.md` — retries, cancellation, checkpoints, leases and failure diagnosis. The tested library-only increment is documented in [phase-6-workflow.md](phase-6-workflow.md); production scheduling/generation is not yet connected.
- [ ] Phase 7: `providers.md` — consent, capability routing, credentials, budgets and opt-in tests.
- [ ] Phase 8: `releases.md` and `backup-recovery.md` — bundles, exports, active release rollback, coordinated DB/files backups and orphan auditing.

## Acceptance criteria
A new contributor can install/run/test the implemented slices and a user can create/publish/play content with documented limitations. Every linked guide exists when linked as an available guide.

## Risks and limitations
Only foundation setup is implemented; no authoring, generation, publication or playable game exists yet. Platform/provider differences require explicit notes rather than unverified universal instructions.

## Future considerations
Hosted deployment/security, guardian accounts and expanded content types receive dedicated guides only after their designs and implementations exist.
