# Phase 4 — published-API arena selection

The arena now has two explicit launch modes. Default remains the trusted development fixtures, including `--fixture=comet` and the unchanged fixture regression suite. Against an already migrated studio with explicitly approved **and published** content:

```sh
godot --path apps/game -- --content-api=http://127.0.0.1:5173
```

`--content-api` alone uses that same default origin. `--content-api=` is an invalid configuration, **not** fixture mode. API mode takes precedence over `--fixture`. Only the repository's supported loopback HTTP origins work. See [publication](phase-4-publication.md) and [API](phase-4-content-api.md); approval alone does not publish, and the integration seed is test-only, not a production publication command.

## Discovery, selection and match lifetime

`scripts/arena.gd` is the composition root for one `ApiCharacterRepository` and `CharacterFactory`. It owns a selection copy of the first validated full catalog. Option indices resolve only to this snapshot's ID/version pairs. Initial labels show short IDs and versions (the release index has no names); successful loads replace them with validated character names/versions. No hardcoded API fixture names or package URLs drive selection or enemy creation.

Discovery shows a loading message with disabled controls and no fixture player. Selection loads a fresh generic player, binds health, clears any prior enemies/completion state and returns to practice. Start/restart resets the player and starts the existing two capped waves. Enemies use the next catalog entry, wrapping for a one-entry catalog. Player input and AI are paused during resource loading. All fighters are created through the existing factory; combat timing, scenes and fighter/AI scripts are unchanged.

One arena instance retains **one repository and release** through practice, each active match, resets and explicit retry. API mode has a deliberate Refresh control; Start, reset, retry and HTTP/cache errors never refresh implicitly. Refresh is permitted only when `_loading` and `running` are both false (idle practice, loss, or completed match). Calls during loading or active combat are rejected without queueing.

Refresh constructs a separate candidate repository/factory, validates its complete catalog, and builds the currently selected character before activation. Selection is reconciled by character ID; if absent, the first candidate entry is used. Only after successful resource admission, fetch, integrity checks and native PNG decoding does one synchronous boundary install repository/factory/catalog/release/player and free the prior player. Until then old catalog and fighter remain coherent. Empty catalogs and any candidate/catalog/resource failure retain that old state and show `Refresh failed: <code> · previous catalog retained`; a deliberate later Refresh retries. If no prior catalog exists, failure remains an initial error with no fixture fallback. No old/new release mixing occurs inside a match. Refresh remains explicit and synchronous at the UI policy level; no polling or automatic refresh exists.

## Loading and failure policy (ADR-022)

Only one arena load operation can run. Both UI controls are disabled during it; direct selection/start/wave calls also reject overlap, without queuing or superseding the operation. Thus no older completion can overwrite a newer accepted selection or reset. Wave refills use the same gate and factory, outside combat work. The arena/HTTP host must remain alive across awaits; shutdown cancellation is still separate work.

Catalog, player or enemy load failure stops the match, removes all its fighters, zeros health and shows `Content error: <code>`. There is no partial playable match or silent fixture substitution. After catalog failure, selection stays disabled and Start retries discovery. After player/enemy failure, selection and Start are enabled: choose another pinned entry or explicitly retry the selected match. A successful discovery retry prepares the first character; press Start again to fight. An empty validated catalog reports `empty_catalog`; because that snapshot is pinned, retry does not refresh it. Restart the application after publishing content.

## Executed integration coverage

`mise exec -- pnpm test:godot:api` builds studio/worker, verifies installed engine/templates, runs existing regressions and factory API tests, then runs `tests/published_arena.gd` with the actual API launch argument. The bounded isolated harness uses migrated SQLite and explicit approvals/publications, not a content proxy. Its loopback test-only control server coordinates a separately approved/published Sprout v2 and temporary corruption/restoration of that harness's ready files; it is never a production route or content source.

The arena suite verifies discovery/loading controls, both fixture selections and distinct runtime textures, generic factory metadata, HUD, input movement/jump, timed/deduplicated melee with changed art FPS, overlapping actions, capped waves/completion/loss, reset pinning after real publication, manual refresh rejection during loading/active combat, successful atomic candidate replacement/selection reconciliation, failed-refresh retention, new-instance revision discovery, catalog/player/enemy corruption failures, no partial match/fallback and explicit retries. Source fingerprints before publication/tests and after must match. The earlier fixture and API-fighter suites remain intact.

Add `--content-cache` to explicitly enable the [bounded PNG disk cache](phase-4-godot-cache.md); without it, the original API behavior and corruption/retry regression remain unchanged. The flag is ignored in fixture mode. Cached bytes do not change release/catalog lifetime or bypass resource validation.

This is **not** the broader live-addition/Refresh acceptance: both fixtures are published before discovery, and the mid-match publication replaces a revision rather than adding a selectable character to an active catalog. No polling, refresh, fallback, offline bundle, export packaging, Phase 5, or manual graphical/active-AI acceptance is claimed. Resource admission remains per load, not a global resident-memory guarantee.
