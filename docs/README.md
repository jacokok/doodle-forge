# Documentation index

## Purpose
Provide the entry point for operational and developer documentation as implementation becomes real.

## Scope
Phase 0 includes plans only. This index lists future guides, not working commands or completed features. Start with [project plans](../plans/README.md), [roadmap](../plans/12-implementation-roadmap.md), [progress](../plans/14-progress.md) and [agent instructions](../AGENTS.md).

## Technical approach
Write guides alongside verified implementation. Every command must be tested and its required tools/configuration explained; never copy unimplemented target commands as working setup instructions.

## Architecture and responsibilities
Plans specify intended architecture and acceptance. Docs explain actual use/operation. Contributors keep both consistent; progress reports known differences and test evidence.

## Key design decisions
Keep secrets/child artwork out of examples and logs. Use tiny synthetic fixtures and mock provider in tutorials. Explicitly distinguish API development source and offline bundle release source.

## Dependencies
Guides depend on relevant roadmap phases being implemented and tested.

## Implementation tasks
- [ ] Phase 1: `development.md` — tool versions/install, environment, workspace commands, migrations and process shutdown.
- [ ] Phase 2: `content-contract.md` — schema generation, fixtures, compatibility and validation CLI.
- [ ] Phase 3–4: `game-development.md` — input/arena, headless tests, repositories, runtime decoding and refresh.
- [ ] Phase 5–6: `character-creation.md` — upload, choices, preview, regeneration, approval and publish.
- [ ] Phase 6: `worker-operations.md` — retries, cancellation, checkpoints, leases and failure diagnosis.
- [ ] Phase 7: `providers.md` — consent, capability routing, credentials, budgets and opt-in tests.
- [ ] Phase 8: `releases.md` and `backup-recovery.md` — bundles, exports, active release rollback, coordinated DB/files backups and orphan auditing.

## Acceptance criteria
A new contributor can install/run/test the implemented slices and a user can create/publish/play content with documented limitations. Every linked guide exists when linked as an available guide.

## Risks and limitations
No application setup can be executed yet. Platform/provider differences require explicit notes rather than unverified universal instructions.

## Future considerations
Hosted deployment/security, guardian accounts and expanded content types receive dedicated guides only after their designs and implementations exist.
