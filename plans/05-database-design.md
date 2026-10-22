# 05 — Database design

## Purpose
Persist authoring history, workflow execution, approvals and atomic content visibility.

## Scope
SQLite metadata only; binary images stay on disk. Drizzle schemas and committed SQL migrations, repositories, seed data, constraints and recovery.

## Technical approach
Use `better-sqlite3` with Drizzle initially for short local transactions; never hold a transaction across network/image processing. Enable foreign keys per connection, WAL and a 5-second busy timeout. Keep DB on local filesystem, not a network share. Store timestamps as UTC integer milliseconds, IDs as UUID text and enum states as checked text. Parse JSON columns through Zod at boundaries. Migrations run explicitly before server/worker startup; do not let both processes migrate concurrently.

## Architecture and responsibilities
| Table | Columns and constraints (in addition to IDs/timestamps) |
|---|---|
| `characters` | name, description, body_type, fighting_style, special_power, original_asset_id FK, archived_at, optimistic `edit_revision`; mutable authoring identity |
| `character_versions` | character_id FK, version positive int, status (`draft`, `review`, `approved`, `published`, `superseded`), source/edit snapshot JSON, manifest_json, manifest_sha256; UNIQUE(character_id,version) |
| `assets` | character_id FK, character_version_id nullable FK, kind, immutable storage_key UNIQUE, media_type, sha256, bytes, width/height, source_asset_id nullable FK, generation_step_id nullable FK; originals never overwritten |
| `animations` | character_version_id FK, name, asset_id FK, frame dimensions/count/columns, FPS, loop, anchor JSON; UNIQUE(version,name) |
| `abilities` | stable catalog ID, kind, configuration schema/version and defaults JSON; controlled catalog, no executable code |
| `character_abilities` | character_version_id FK, ability_id FK, configuration JSON; composite PK |
| `generation_jobs` | character_id/version FK, kind (`generate`,`publish`), status, request_json, idempotency_key UNIQUE, cancel_requested_at, error_json, available_at |
| `generation_steps` | job_id FK, stage_key, target_key (e.g. animation name), status, input_hash, input/output JSON, attempt_count, max_attempts, available_at, lease_owner, lease_token, lease_expires_at, error_json; UNIQUE(job,stage,target) |
| `approvals` | character_version_id FK, manifest_sha256, decision (`approved`,`rejected`,`revoked`), actor_label, note; append-only decisions bound to snapshot, not just character ID |
| `content_releases` | release ID, status (`preparing`,`ready`,`failed`), index_key, index_sha256, previous_release_id, published_at; immutable once ready |
| `content_release_entries` | release_id FK, character_version_id FK, manifest path/hash; composite PK and unique character per release enforced transactionally |
| `content_state` | singleton row id=1, active_release_id FK, generation counter for compare-and-swap activation |
| `generation_attempts` | step_id FK, attempt_no, lease_token, started/ended_at, provider_request_id, outcome/error JSON; UNIQUE(step,attempt) retains retry history |

Additional tables beyond the requested minimum support full release snapshots and attempt auditing. Assets may be attached to versions after upload; foreign key insertion order must avoid circular startup requirements. Do not hard-delete characters referenced by releases. Archive instead. Historical outputs remain immutable, even when a newer selected output replaces them.

## Key design decisions
Use transactions to reserve version numbers (`MAX+1` only under write lock), enqueue jobs, acquire leases and approve snapshots. Add indexes for jobs(status,available_at), steps(status,available_at,lease_expires_at), assets(sha256), versions(character_id,version), approvals(version,created_at). Enforce immutable published versions and their child assets/animation/ability rows with repository guards plus SQL triggers; allow no metadata edits behind an existing published hash. Draft revision updates use expected revision to avoid lost edits.

Generation outputs create a frozen review snapshot. Regeneration creates a new character version seeded with unchanged immutable assets; approval for the old snapshot cannot authorize the new one. Review -> approved requires valid snapshot; approved -> published requires a matching latest unrevoked approval. Metadata-only content changes also create a new version. Game only sees active ready release entries, never table-wide approved rows.

DB transaction cannot atomically include file rename. Publisher stages/verifies/renames complete revisions first, then activates a release in one DB transaction (plan 09). Unreferenced files after crashes are recoverable orphans, not visible releases.

## Dependencies
Contract fields plan 04; workflow plan 08; publication plan 09. Phase 1 creates the four-table authoring/catalog baseline (characters, character_versions, abilities, character_abilities; ADR-015). Phase 2 adds contract-specific guards/catalog; assets/original links, publication/release and workflow persistence arrive through new migrations in their consuming phases. Never rewrite already-applied migrations. Current baseline alone does not enforce publication approval/immutability.

## Implementation tasks
- [ ] Define Drizzle schema, constraints/indexes/triggers and migration runner.
- [ ] Add typed repositories and transaction helpers; test multi-connection contention.
- [ ] Seed ability catalog and fixtures through validation/publication service when available.
- [ ] Add backup/restore and orphan audit commands with dry-run default.

## Acceptance criteria
Fresh and incremental migrations succeed with FK checks; duplicate versions/invalid transitions fail. Restart preserves history. Concurrent approvals/publications do not overwrite newer state. Published rows cannot be altered through repository or raw SQL without explicit maintenance migration.

## Risks and limitations
SQLite write serialization limits throughput. Files and metadata backups must be coordinated. Deletion/retention for children's data needs explicit policy before hosted use; preserving original art means no automatic destructive garbage collection.

## Future considerations
Multi-user ownership/audit tables and storage retention workflows; PostgreSQL only when measured contention or deployment topology warrants it.
