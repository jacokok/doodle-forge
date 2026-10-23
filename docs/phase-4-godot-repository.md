# Phase 4 — Godot repository boundary

This increment adds a **headless-usable API repository**. The subsequent [bounded runtime/factory increment](phase-4-godot-runtime.md) proves headless API-fed fighter playability, and [explicit API arena mode](phase-4-godot-arena.md) wires discovery/selection and match loading/errors. Default launch preserves fixtures. The [opt-in PNG disk cache](phase-4-godot-cache.md) revalidates hits against online pinned manifests; polling, catalog replacement and Phase 5 UI remain unimplemented.

## Calling boundary

`apps/game/scripts/content/character_repository.gd` is a `RefCounted` interface. Implementations return dictionaries: `{ok:true,value:...}` or `{ok:false,error:code}`. Await operations; do not put HTTP or package paths in combat code.

```gdscript
const ApiRepository = preload("res://scripts/content/api_character_repository.gd")
var repository = ApiRepository.new(self, "http://127.0.0.1:5173")
var catalog = await repository.list_characters()
if catalog.ok and not catalog.value.characters.is_empty():
    var entry = catalog.value.characters[0]
    var manifest = await repository.get_manifest(entry.characterId, int(entry.characterVersion))
    # After checking manifest.ok, request a declared asset by its map key:
    # await repository.get_asset_bytes({characterId: ..., characterVersion: 1, assetId: ...})
```

The host must be a live in-tree node and remain alive until the operation finishes. Only configured HTTP loopback origins (`127.0.0.1`, `localhost`, `[::1]`, optional port) are accepted. Redirects and gzip are disabled. One request is allowed in flight per instance; overlapping requests return `busy`. Requests have a five-second timeout, 1 MiB JSON body limit, or manifest-declared PNG byte limit (maximum 16 MiB). These are per-request bounds, not aggregate memory/server quotas.

## Immutable selection and routes

The first successful `list_characters()` pins a complete, validated release. Repeated calls return defensive copies without refetching current content. Failures never install a partial catalog. The repository snapshot itself is still immutable: arena manual Refresh constructs a separate candidate repository and replaces the arena's repository reference only at ADR-024's safe boundary. Calling this instance's `refresh()` still returns `refresh_not_supported`; polling is not implemented.

Only entries in that pinned release may be loaded. Manifest bytes must match the release's SHA-256 **before JSON parsing**, and the validated identity/version must match the entry. Validated manifests are memoized per pinned instance and returned as defensive copies; manifests are not persisted. Asset references contain exactly character ID, integer version and asset map ID. The adapter maps these to the [documented API routes](phase-4-content-api.md), never to `manifestPath` or `asset.path` as URLs. HTTP and optional cached asset bytes must match declared length, SHA-256 and PNG IHDR dimensions. Repository bytes alone do not prove playability: the resource builder additionally checks admission limits and fully decodes PNGs before constructing textures/fighters.

Errors are explicit (`catalog_not_pinned`, `revision_not_in_release`, `manifest_hash`, `manifest_identity`, `asset_integrity`, `http_503`, etc.). There is no silent fallback, publication inference, storage access or arbitrary URL/file request.

## Supported-v1 validation

`contract_validator.gd` interprets only the keywords emitted by the committed Zod-generated v1 schemas; unknown encountered keywords fail closed. This is **not a general JSON Schema implementation**. It reads `packages/contracts/schema/*-v1.schema.json` from the development checkout; an exported game will need explicit packaging of those schema resources (not implemented here). Strict fields, types, finite numbers, safe integers, lengths, enums, kinds and array limits come from those schemas, not separately authored GDScript DTOs. Text trim follows JavaScript whitespace; schema lengths count Unicode code points like pinned Zod 4.6.7. The separate path helper's length cap counts UTF-16 units like shared `isSafeAssetPath`.

GDScript semantic checks mirror the shared validator: required/allowed animations, layout/loops, unique IDs, references, box elevation, map caps and safe package paths. Release entries additionally require the canonical `characters/<id>/v<version>/character.json` layout, as publication/API already do; the structural TS release schema alone does not enforce layout. Godot replaces JSON NUL with U+FFFD, so its path policy conservatively rejects **both** NUL and U+FFFD. This extra client restriction avoids accepting a mangled unsafe path; ordinary U+FFFD text outside paths is not prohibited. Hashes are integrity checks, not signatures.

## Tests and limits

`pnpm test:godot` verifies the selected engine and actual templates **before** engine checks, retains startup/gameplay regressions, then runs shared contract vectors and real `HTTPRequest` calls against deterministic local HTTP peers. TypeScript tests consume the same manifest/release vectors. The HTTP peers cover exact routes, release pinning/copies, busy/unlisted/unsafe references, hash/identity/schema errors, bad index paths/duplicates/counts, malformed/oversized/invalid UTF-8 JSON, redirects, 503, corrupt/oversized PNG and mismatched dimensions. Expected malformed NUL/UTF-8 inputs produce Godot Unicode diagnostics while their rejection assertions pass.

These peers are not the real studio. Existing full-suite route tests use real DB/publication/storage; built HTTP smoke remains separate evidence. `pnpm test:godot:api` adds real built-studio/publication-to-Godot texture/factory/combat (including opt-in cache) and [arena integration](phase-4-godot-arena.md) tests. Refresh, export schema packaging and coordinated second-character catalog updates remain pending. Phase 3 human visual/active-AI acceptance remains deferred; combat has not been tuned. Phase 5 has not started.
