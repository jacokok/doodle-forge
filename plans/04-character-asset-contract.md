# 04 — Character asset contract

## Purpose
Define the shared, versioned boundary between authoring, generation, publication and gameplay.

## Scope
Schema v1 character manifests, PNG assets, release index, fixtures and validators. No arbitrary scripts, scene paths, provider credentials or original-upload paths enter game content.

## Technical approach
Author strict Zod schemas in `packages/contracts`; generate and commit JSON Schema (draft 2020-12) from them using a tested converter compatible with the selected Zod release. CI checks generation is reproducible. Semantic cross-field checks live alongside schemas (and are documented since JSON Schema alone may not express all checks). Godot implements the supported v1 subset and identical semantic checks, tested with shared valid/invalid fixtures; it does not execute Zod or require a third-party JSON Schema runtime.

## Architecture and responsibilities
The proposed v1 DTO is the normative field specification for Phase 2:

| Field | Representation / constraints |
|---|---|
| `schemaVersion` | Integer `1`; reject unsupported versions, do not silently coerce |
| `characterId`, `characterVersion` | UUID string, positive integer; revision pair immutable once published |
| `name`, `description` | Trimmed Unicode text, 1–80 / 0–2000 characters; plain text only |
| `bodyType`, `artStyle` | `humanoid / quadruped / floating / other`; `original / cartoon / pixel` |
| `stats` | `health` integer 1–10000; `moveSpeed` finite 1–1000 pixels/sec |
| `facing` | `right` (v1 canonical source direction) |
| `anchors` | `feet`, `center`, `hand`, `effect` pixel `{x,y}` positions within a frame |
| `animations` | Map keyed by known animation names; values specified below |
| `attacks` | List of unique IDs with `kind`, `animation`, `damage`, `cooldownSeconds`, `startupSeconds`, `activeSeconds`, `recoverySeconds`, `knockback`, `hitboxIds` |
| `hitboxes`, `hurtboxes` | Unique ID, rectangle `{x,y,width,height}` relative to foot anchor on ground plane, `minElevation`, `maxElevation`; finite values, positive dimensions |
| `abilities` | List of `{id, kind, attackId?, effectIds, parameters}` with discriminated, bounded parameters; v1 executable kind `melee` only |
| `effects` | List of `{id, assetId, anchor, durationSeconds}`; empty permitted in v1 |
| `assets` | Map of ID -> `{path, mediaType:'image/png', sha256, bytes, width, height}` |

All numeric gameplay fields must be finite and bounded. Knockback is `{xSpeed, depthSpeed, durationSeconds}` in pixels/sec and seconds; attacker facing determines horizontal sign. Other ability families are reserved designs, not accepted executable v1 values until validators/game executors are implemented together. Every referenced ID must resolve; every required animation exists. All maps and arrays have explicit limits (128 assets, 32 attacks/abilities/effects/boxes each) to bound untrusted input.

Animation entry: `{assetId, frameWidth, frameHeight, columns, frameCount, fps, loop, footAnchor}`. Frames are row-major from top-left with zero margins/spacing; rows = ceil(frameCount/columns). PNG dimensions must equal columns × frameWidth and rows × frameHeight; unused cells transparent. FrameCount 1–64, FPS 1–60, columns 1–16. Required: `idle`, `walk`, `attack_light`, `hurt`, `knockout`; optional: `jump`, `attack_heavy`, `special`. Idle/walk loop; attack/hurt/KO non-loop; KO holds last frame.

Project v1 convention: all frames **256×256** RGBA PNG with transparency, consistent foot anchor **(128,224)** across animations. This is a project choice, not an engine limitation. Loader enforces uniform frame size/anchor within a package and maximum sheet dimensions 4096×4096; later conventions may permit other sizes via schema revision. Sprite visual offset is negative foot anchor; scale is fixed 1 initially. Hurt/hit rectangles use ground-plane coordinates, not sprite atlas coordinates. UI/export must not confuse these spaces.

## Key design decisions
Package layout: `characters/<uuid>/v<integer>/character.json` plus `assets/<sha256>.png`. Asset paths are POSIX relative to package directory, never absolute/URL, never `..`, backslash or symlink escape. Manifest embeds per-file SHA-256 hashes, but not its own hash. Release index records `{characterId, characterVersion, manifestPath, manifestSha256}`; hash exact UTF-8 manifest bytes. Publisher uses deterministic canonical key ordering and immutable bytes; approval binds this exact manifest hash plus its asset hashes. Schema version is independent of character version and release ID.

Release index v1: `{schemaVersion:1, releaseId:UUID, characters:[...]}` with unique character IDs and a complete snapshot, not a delta. Each entry pins one version. Consumer pins one release while loading; changes never mix manifests/assets from different snapshots.

Phase 2 fixture must be a complete valid package with small authored synthetic PNG sheets, valid hashes and all five animations; do not call the specification table an executable fixture. Include a second visually distinct fixture and deliberately corrupt/invalid variants. Fixture art is allowed in Git; runtime generated artwork is not.

## Dependencies
Phase 1 tooling; plan 03 units/combat; plan 09 publication layout. Phase 2 settles exact schemas and test vectors before game/pipeline implementations.

## Implementation tasks
- [ ] Implement strict schemas, cross-reference/dimension/path checks and JSON Schema export.
- [ ] Create fixtures, canonical serialization/hash helpers and release schema.
- [ ] Write TS and Godot shared validation cases; publish supported-version policy.
- [ ] Test missing animations, invalid windows, duplicate IDs, bad hashes, unsafe paths and unsupported kinds.

## Acceptance criteria
One manifest validates in TS and Godot, builds all animations, and supplies working movement/light attack. Corrupt data fails with actionable paths/codes. Second fixture needs no gameplay changes. JSON Schema is reproducible and detects structural invalidity; semantic validators detect cross-field errors.

## Risks and limitations
TypeScript/GDScript number and validation behavior may differ; golden cases are essential. Asset hashes do not authenticate publishers. Animation/body-type variety may exceed fixed canvas; do not silently crop or alter original art.

## Future considerations
Explicit schema migration tools, additional ability discriminators, variable canvas conventions, per-frame anchors/events, localization and other asset families require versioned compatibility decisions.
