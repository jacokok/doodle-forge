# 11 — Testing strategy

## Purpose
Provide executable evidence of correctness at contracts, persistence, workflow, content/game integration and child-facing UI boundaries.

## Scope
Vitest unit/integration tests, Playwright browser tests, Godot headless runners, cross-language fixtures, failure injection and complete end-to-end workflow. Manual visual/accessibility/play checks supplement automation.

## Technical approach
Use temporary DB/storage per test, deterministic seeds/fake clock where appropriate, mocked provider adapters and real Sharp processing. Integration tests use real migrated SQLite, not just mocked repositories. Separate fast TS, browser and engine jobs in CI. Proposed root commands in plan 02 become actual scripts in Phase 1; do not claim they run before implementation.

## Architecture and responsibilities
| Subsystem | Required verification |
|---|---|
| Contracts | Valid fixture, unknown version/kind, missing animation, invalid references, unsafe paths, nonfinite/out-of-range numbers, canonical serialization and JSON Schema reproducibility |
| Database | Empty/incremental migrations, FK checks, triggers, rollback, version reservation, concurrent clients, immutable published children, realistic seed |
| APIs | Validation/status codes, stale revision conflict, origin/CSRF checks, private-vs-public assets, approval/publish gate, ETags and correct cache behavior |
| Uploads | Valid PNG/JPEG/WebP, MIME spoof, oversized compressed/decoded inputs, malformed file, path injection, multipage rejection, original hash preservation and private EXIF-stripped preview |
| Workflow | DAG order, restart mid-stage, lease expiry, two-worker claim race, stale completion fencing, retry cap/classification, cached artifact corruption, targeted invalidation, cancellation and paid-call ambiguity |
| Image/animation | Anchor alignment, alpha/nonempty output, frame bounds, pixel-art sampling, exact sheet layout, deterministic bytes/hash and resource limits |
| Publication | Missing files/hash mismatch, unapproved/stale approval refusal, crash at each boundary, duplicate requests, concurrent active index CAS, reconciliation and immutable old releases |
| Godot | Shared valid/invalid vectors, API/local repository equivalence, PNG decoding/SpriteFrames construction, corrupt/missing fallback, unsupported schema, resource limits, fighter factory |
| Gameplay | Diagonal normalization, depth/Y-sort setup, separate jump elevation, light-attack timing, one hit per attack, team/depth/elevation filtering, HP/knockback/KO, enemy/wave completion |

Use native GDScript headless assertion scenes/scripts initially, invoked by `tools/godot-validation` with explicit timeouts and nonzero exit on failure. Print machine-readable test report, not just engine startup success. Seed inputs and physics ticks for reproducibility; reserve screenshot/manual checks for visual alignment and feel. No additional Godot testing plugin required initially.

## Key design decisions
Full acceptance harness (Phase 6 API path, Phase 8 offline path):
1. Create temp storage/DB, migrate, start actual studio and worker on isolated ports with mock provider, await health.
2. Playwright creates a character, uploads committed synthetic drawing, submits description/choices.
3. Poll bounded job completion until review; assert real PNG sheets/manifest/hash and preserved original bytes.
4. Review animations, approve exact version/hash, explicitly publish; assert index includes it and excludes unapproved drafts.
5. Start headless Godot using API repository; discover manifest, verify all textures/frames, instantiate fighter.
6. Drive simulated movement and attack against a test enemy; assert displacement, legal damage and resulting HP.
7. Create/generate/approve/publish a second visually distinct character, refresh repository; assert both load. Hash gameplay source before/after to prove no code/scene modification.
8. Phase 8: export bundle, stop API/worker, run same loader/game assertions through bundle repository.
9. Always stop processes and clean temp data; preserve failure logs, screenshots and generated test reports as CI artifacts, not committed production art.

No real paid APIs in default CI. Live provider smoke tests explicitly opt in, use consented fixtures and budgets, and report cost/quality separately from deterministic regression results. Avoid screenshots as sole behavioral assertions. Check API errors without printing private image/descriptive data.

## Dependencies
Each phase adds its tests alongside features. Full workflow depends on Phase 6, offline parity on Phase 8. Browser/Godot installation and exact binary version checks must be documented.

## Implementation tasks
- [ ] Add Vitest, Playwright and Godot runners, fixtures and CI matrix.
- [ ] Implement table-driven contract parity and migrated DB tests.
- [ ] Add fault injection at lease/checkpoint/file rename/DB activation boundaries.
- [ ] Implement end-to-end harness and isolated cleanup/log collection.
- [ ] Record manual keyboard/reduced-motion/visual playtest checklist.

## Acceptance criteria
All applicable executed suites pass with deterministic assertions, bounded timeouts and meaningful failure exits. Full flow proves two characters require no gameplay edits. Missing Godot/browser tooling is recorded as a blocked test, never a pass. Tests exercise real texture loading and attack interactions, not only schema shape.

## Risks and limitations
Headless rendering cannot fully judge animation/art quality or child usability. OS file locking/rename and engine behavior may differ; expand platform coverage before claiming exports supported. Avoid flaky network/timing-dependent tests using local servers and controlled clocks where possible.

## Future considerations
Performance/memory budgets, controller tests, broader export matrix, fuzzed contracts and security review before internet deployment.
