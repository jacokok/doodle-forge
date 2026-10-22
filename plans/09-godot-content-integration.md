# 09 — Godot content integration and publishing

## Purpose
Make approved character revisions available atomically through development API and portable offline bundles without gameplay changes.

## Scope
Publisher, immutable revisions/indexes, Godot repository implementations, runtime texture loading, cache/update behavior and SQLite investigation.

## Technical approach
Godot `CharacterRepository` is a `RefCounted` abstraction with async operations `list_characters()`, `get_manifest(character_id,version)`, `get_asset_bytes(asset_ref)`, `refresh()` returning typed success/error dictionaries/signals. `ApiCharacterRepository` uses HTTPRequest and configured loopback base URL; `BundleCharacterRepository` uses FileAccess under an explicit bundle root. Gameplay receives validated character definitions and resources via a CharacterFactory, never URLs, SQL or provider IDs.

## Architecture and responsibilities
Publisher algorithm (single-host, same-volume staging):
1. Load frozen version and matching latest unrevoked approval; validate schema/semantics and all required animations, decode PNGs, verify dimensions, byte sizes and hashes. Reject publication without approval even if called from CLI.
2. Build package in private staging directory inside `storage/published/`. Write exact approved manifest bytes and copy verified files. Flush files where supported; atomically rename to immutable `characters/<id>/v<n>/`. If already present, require identical hashes; never overwrite different bytes.
3. Construct complete release snapshot from current active release plus selected character revision. Write `releases/<releaseId>/index.json` and verify all referenced packages. Mark preparation/audit state in DB; files are not yet served merely because present.
4. In one short DB transaction recheck approval/hash, expected active generation and referenced ready files; insert release entries, set ready state, mark character version published and update singleton active release pointer. A concurrent publisher losing compare-and-swap rebuilds its index on latest release before retrying, preserving both updates.
5. API resolves current index from DB pointer. Serve revision files only if referenced by a ready release. Historical ready releases remain addressable. Failure before activation leaves invisible staging/orphans; startup reconciliation inspects preparing releases and permits safe retry or quarantine, never guesses approval.

There is no true DB/filesystem joint transaction. Atomicity means consumers see either complete old or complete new index; filesystem-first plus DB activation achieves that if files are durably present. Disk loss afterward is corruption requiring recovery, not transactional success. Maintenance must not delete any ready release's assets. Rollback activates a new release snapshot referencing older immutable versions.

API `/api/content/index` supplies current full index and ETag = index SHA-256. Immutable release index/manifest/PNG routes use content hashes, immutable cache headers and exact bytes. Current index revalidates with ETag. Restrict manifest/asset route parameters to DB-resolved entries, never concatenate untrusted file paths.

## Key design decisions
Runtime loader sequence:
1. Fetch/read index; validate schemaVersion, IDs, paths, entry count and limits.
2. Pin release ID, locate desired manifest, verify manifest hash before parsing; validate schema and supported ability kinds.
3. Resolve only relative confined asset paths, fetch/read bounded byte buffers, verify byte length/hash and PNG dimensions.
4. Decode via `Image.load_png_from_buffer`, create `ImageTexture`, then `AtlasTexture` regions and `SpriteFrames` programmatically; no editor import or `load()` of arbitrary external PNG assumed.
5. Construct Fighter using shared scene; apply stats, anchors, animations and combat definitions.
6. Cache immutable assets in `user://content-cache/<sha256>.png`; revalidate disk cache, bound cache size, do not evict in-use resources. Only swap active selectable catalog after full index validation; active fighters retain their loaded revision until match ends.
7. On missing/corrupt/unsupported content return structured errors and disable affected character, retaining last known good catalog where possible. Offer built-in fixture fallback offline, never silently substitute broken character stats.

Development polls index every 5 seconds outside gameplay tick and supports manual Refresh; stop polling during shutdown and back off on failures. Release builds default to bundle source, no server dependency. Offline bundle is an extracted directory (optionally transported as ZIP): root `index.json` + immutable `characters/...` packages. Validate ZIP extraction paths/symlinks and total sizes before use; prefer publisher-created directory for initial export. Build in temp output, validate all hashes, then rename destination atomically. Include license/provenance summary without private original drawings or provider secrets.

### Direct SQLite investigation
The [godot-sqlite project](https://github.com/2shady4u/godot-sqlite) supplies a Godot 4 GDExtension wrapper and platform-specific native libraries loaded through `.gdextension`. It is technically feasible to implement a read-only `SqliteCharacterRepository`, but not mandatory or selected for initial delivery. It adds native binary/export compatibility, version verification and database schema coupling. A live authoring DB also risks locks, privacy leaks and migration mismatches; a sanitized read-only snapshot would be preferable. Plugin support for the chosen Godot patch/platforms has **not** been tested. SQLite metadata does not remove PNG byte decoding or runtime texture/SpriteFrames construction. API and bundle designs avoid this dependency entirely.

## Dependencies
Contract/hashes (04), approvals and release tables (05), fighter factory (03), API routes (06). Phase 4 builds basic publisher validation, approved fixture seeding and API repository; Phase 5 adds UI approval/publication; Phase 6 connects workflow; Phase 8 completes offline export/repository.

## Implementation tasks
- [ ] Implement shared validator and crash-safe idempotent publisher with reconciliation.
- [ ] Seed approved fixtures through explicit fixture approval records, not production gate bypass.
- [ ] Implement API routes/ETags and repository, decoder, cache and manual refresh.
- [ ] Prove second character loads without scene/script changes.
- [ ] Implement bundle exporter/local repository and parity tests in Phase 8.

## Acceptance criteria
Fault injection at every publication boundary exposes only complete releases. Concurrent publications retain both characters. Game loads textures from external runtime bytes without editor import and rejects corrupt data. API and bundle produce equivalent character resources. Offline game works with server stopped. Second character requires data-only addition.

## Risks and limitations
OS-specific rename/fsync semantics need validation. Hashes detect corruption, not authenticity; trusted local source is assumed initially. Large images and many requests can exhaust client memory; enforce contract caps and bounded fetch/decode concurrency.

## Future considerations
Signed bundles, incremental download/update tools, cache garbage collection and optional sanitized SQLite snapshots after platform compatibility research.
