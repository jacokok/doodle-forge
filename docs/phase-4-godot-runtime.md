# Phase 4 — bounded runtime resources and CharacterFactory

`apps/game/scripts/content/character_factory.gd` accepts a pinned `CharacterRepository`, character ID/version and a live in-tree parent. It awaits catalog/manifest/assets and returns `{ok:true,value:fighter}` or `{ok:false,error:code}`. The host and parent must outlive the operation. No node is instantiated until every declared image has decoded and all animations have been built. Failed loads leave no partial fighter; resources are reference-counted, with no persistent cache.

```gdscript
const ApiRepository = preload("res://scripts/content/api_character_repository.gd")
const CharacterFactory = preload("res://scripts/content/character_factory.gd")
var repository = ApiRepository.new(self, "http://127.0.0.1:5173")
var catalog = await repository.list_characters()
if catalog.ok and not catalog.value.characters.is_empty():
    var entry = catalog.value.characters[0]
    var factory = CharacterFactory.new(repository)
    var result = await factory.create(entry.characterId, int(entry.characterVersion), self)
    # Check result.ok before using result.value (the existing generic fighter).
```

The factory uses only `scenes/fighter.tscn`. It applies an owned copy of validated combat/stats, runtime SpriteFrames, foot anchor and identity/release metadata. It serializes whole loads (`factory_busy`), beyond the repository's one-request constraint. Keep one factory/repository per loading context; multiple independent factories are **not** subject to a global budget. API routes/package paths never enter fighter/combat code. Attack windows remain manifest seconds, not animation FPS/frame counts.

## Resource policy (ADR-021)

`character_resources.gd` revalidates the shared manifest and checks **all declared assets** before the first asset request. Per-load totals are at most **32 MiB encoded** and **128 MiB conservative pixel working allowance**, charged at 16 bytes per declared pixel (native RGBA16 decode + RGBA8 conversion + texture upload). This deliberately rejects some structurally valid large packages. Existing contract limits still apply: 16 MiB per PNG, 4096×4096 sheet dimensions, bounded maps and frame counts. Duplicate assets are conservatively charged separately. This is an admission policy, not measured process/GPU peak memory or an aggregate resident-fighter/cache quota.

Fetching and decoding are sequential. Before native decode, exact length/hash, PNG signature, 13-byte first IHDR and actual dimensions are checked again. Container scanning bounds chunk lengths/count (4096), requires IDAT and final empty IEND with no trailing bytes, and refuses APNG/repeated IHDR. Only IDAT/IEND and small PLTE/tRNS/pHYs/sRGB/gAMA/cHRM chunks are admitted; compressed text/profiles and unknown ancillary chunks are rejected before native decode. These are additional client resource-safety restrictions, not changes to the shared v1 schemas. Use stripped single-image PNG game art.

`Image.load_png_from_buffer` must succeed with nonempty matching dimensions and no mipmaps. Images are converted to RGBA8, then `ImageTexture`, shared per sheet within the load. Row-major `AtlasTexture` regions use floored row division; `SpriteFrames` preserves frame count/FPS/loop flags. Every declared asset is decoded, including assets not used by animations; the existing fighter does not gain new effect/ability executors.

Failures include `character_resource_limit`, `asset_integrity`, `png_header`, `png_dimensions_or_limit`, `png_chunks`, `png_unsupported_chunk`, `png_decode`, repository errors and `fighter_definition`. There is no silent fixture substitution.

## Executed test entry points

- `pnpm test:godot`: engine/templates, startup/gameplay/repository regression and **26 resource assertions**. Actual in-memory multirow PNG pixels/atlas regions, shared sheet, FPS/loop flags, factory configuration/owned data/busy behavior, both admission budgets before fetching, actual IHDR limits, hash/length, compressed metadata/APNG and corrupt native decode/no-partial-spawn failures. Deliberate corrupt IDAT inputs emit libpng diagnostics; the runner permits only the three known native decoder error messages in this suite, not script errors or arbitrary engine errors.
- `pnpm test:godot:api`: builds studio/worker, runs the above, then migrates isolated SQLite/storage, explicitly approves/publishes both fixtures, starts the real built studio and runs **43 Godot API assertions**. Both fighters get real runtime textures, manifest stats/animation settings, distinct art, one release, movement/jump and timed/deduplicated melee independent of changed animation FPS. Unpublished revisions do not spawn. Gameplay/project/scene/fixture source SHA-256 fingerprints must remain unchanged. Bounded process waits and finally cleanup stop the studio and remove only this harness's temporary directory (`TMPDIR` or `/tmp/opencode`). No HTTP peer substitutes for this test.

The subsequent [API arena increment](phase-4-godot-arena.md) adds explicit published discovery/selection, match loading/errors and a separate real-studio arena suite; default launch still uses trusted fixtures. The original 43-assertion suite above remains fighter-level evidence. Live catalog replacement, fallback, cache/polling, offline bundle, desktop export and graphical feel remain unverified/unimplemented. The first full release remains pinned for the API repository lifetime. Phase 4 is incomplete; Phase 3 human acceptance is still deferred and Phase 5 has not started.
