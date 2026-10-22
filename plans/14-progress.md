# 14 — Persistent implementation progress

## Current phase
**Phase 3 — Godot prototype, in progress.** Phase 2 remains locally verified. Do not begin Phase 4.

## Phase 3 increment (2026-10-23)
Added a generic `CharacterBody2D` fighter script (`apps/game/scripts/fighter.gd`), replaced the foundation scene with a minimal Y-sorted arena/player/enemy/camera/HUD scene, and added a headless gameplay test reading the Sprout Phase 2 manifest. The script loads speed, health and light-attack timing/damage/range from manifest data; supports normalized ground movement, separate jump elevation, facing, attack windows, team/depth/elevation filters, target deduplication, damage and one-shot KO signaling. Updated Godot runner to execute gameplay assertions as well as startup validation. Recorded the limited prototype boundary in ADR-017.

**Executed:** `mise exec node@22.23.3 -- npm exec --yes --package=pnpm@10.34.7 -- pnpm test:godot` — PASS; startup report 3 assertions, gameplay report 5 assertions, Godot 4.7.2 binary and both templates verified. Initial bare `pnpm` attempt failed as expected because active Node is 26.12.0, not pinned Node 22.23.3. An attempted combined Godot/check invocation stopped at an outdated foundation assertion after scene replacement; updated startup assertion and reran `test:godot` successfully. `pnpm check` and broad suite not yet rerun. `git diff --check` not reached in combined command.

## Phase status
| Phase | Status |
|---|---|
| 0 planning | Complete/reviewed |
| 1 foundation | Complete, locally verified |
| 2 contract | Complete, locally verified |
| 3 Godot prototype | In progress; first movement/jump/melee test slice only |
| 4–8 | Not started; do not advance Phase 4 |

## Known limitations / remaining Phase 3 work
No SpriteFrames/fixture art runtime rendering, player input loop, shadow/elevation visual, functional HUD health binding, enemy AI/wave director, or full wave-completion/manual playtest yet. Test covers fixture configuration, movement, jump ground separation, attack damage and deduplication only. Combat tests call deterministic methods directly; not full physics/input integration. No Godot contract parity claim. Existing working-tree changes predated this increment; avoid unrelated edits.

## Next actions
Continue Phase 3 only: bind input/state and rendered sprite animation from fixture; implement enemy approach/attack and bounded waves; bind health HUD/selection; extend deterministic tests and record manual visual limitations. Then run Godot and broad relevant checks. Do not start Phase 4.
