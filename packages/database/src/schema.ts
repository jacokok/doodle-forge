export {
  generationJobs,
  generationSteps,
  generationAttempts,
} from './workflow-schema.js';
import { sql } from 'drizzle-orm';
import {
  check,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
  primaryKey,
  type AnySQLiteColumn,
} from 'drizzle-orm/sqlite-core';

export const characters = sqliteTable(
  'characters',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    bodyType: text('body_type').notNull(),
    fightingStyle: text('fighting_style').notNull(),
    specialPower: text('special_power').notNull(),
    originalAssetId: text('original_asset_id').references(
      (): AnySQLiteColumn => assets.id,
    ),
    editRevision: integer('edit_revision').notNull().default(1),
    archivedAt: integer('archived_at'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    check('character_revision_positive', sql`${table.editRevision} > 0`),
    check(
      'character_name_length',
      sql`length(trim(${table.name})) BETWEEN 1 AND 80`,
    ),
  ],
);

export const assets = sqliteTable(
  'assets',
  {
    id: text('id').primaryKey(),
    characterId: text('character_id')
      .notNull()
      .references(() => characters.id),
    kind: text('kind', { enum: ['original', 'preview'] }).notNull(),
    storageKey: text('storage_key').notNull().unique(),
    mediaType: text('media_type').notNull(),
    sha256: text('sha256').notNull(),
    bytes: integer('bytes').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    sourceAssetId: text('source_asset_id').references(
      (): AnySQLiteColumn => assets.id,
    ),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    check('asset_kind', sql`${table.kind} IN ('original','preview')`),
    check(
      'asset_dimensions',
      sql`${table.width} > 0 AND ${table.height} > 0 AND ${table.width} * ${table.height} <= 20000000`,
    ),
    check('asset_size', sql`${table.bytes} > 0 AND ${table.bytes} <= 10485760`),
    check(
      'asset_hash',
      sql`length(${table.sha256}) = 64 AND ${table.sha256} NOT GLOB '*[^a-f0-9]*'`,
    ),
    check(
      'asset_media_type',
      sql`${table.mediaType} IN ('image/jpeg','image/png','image/webp')`,
    ),
    check(
      'asset_source',
      sql`(${table.kind} = 'original' AND ${table.sourceAssetId} IS NULL) OR (${table.kind} = 'preview' AND ${table.sourceAssetId} IS NOT NULL AND ${table.mediaType} = 'image/png')`,
    ),
  ],
);

// Frozen review fields and guards arrive through additive Phase 4 migrations.
export const characterVersions = sqliteTable(
  'character_versions',
  {
    id: text('id').primaryKey(),
    characterId: text('character_id')
      .notNull()
      .references(() => characters.id),
    version: integer('version').notNull(),
    status: text('status', {
      enum: ['draft', 'review', 'approved', 'published', 'superseded'],
    })
      .notNull()
      .default('draft'),
    sourceSnapshotJson: text('source_snapshot_json').notNull(),
    manifestJson: text('manifest_json'),
    manifestSha256: text('manifest_sha256'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('character_version_unique').on(
      table.characterId,
      table.version,
    ),
    check('version_positive', sql`${table.version} > 0`),
    check(
      'version_status',
      sql`${table.status} IN ('draft','review','approved','published','superseded')`,
    ),
    check('snapshot_json_valid', sql`json_valid(${table.sourceSnapshotJson})`),
  ],
);

export const approvals = sqliteTable(
  'approvals',
  {
    id: text('id').primaryKey(),
    decisionOrder: integer('decision_order').notNull(),
    characterVersionId: text('character_version_id')
      .notNull()
      .references(() => characterVersions.id),
    manifestSha256: text('manifest_sha256').notNull(),
    decision: text('decision', {
      enum: ['approved', 'rejected', 'revoked'],
    }).notNull(),
    actorLabel: text('actor_label').notNull(),
    note: text('note').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('approvals_version_order').on(
      table.characterVersionId,
      table.decisionOrder,
    ),
    check('approval_order_positive', sql`${table.decisionOrder} > 0`),
    check(
      'approval_decision',
      sql`${table.decision} IN ('approved','rejected','revoked')`,
    ),
    check(
      'approval_actor',
      sql`length(trim(${table.actorLabel})) BETWEEN 1 AND 120`,
    ),
    check('approval_note', sql`length(${table.note}) <= 2000`),
    check(
      'approval_hash',
      sql`length(${table.manifestSha256}) = 64 AND ${table.manifestSha256} NOT GLOB '*[^a-f0-9]*'`,
    ),
  ],
);

export const contentReleases = sqliteTable(
  'content_releases',
  {
    id: text('id').primaryKey(),
    status: text('status', {
      enum: ['preparing', 'ready', 'failed'],
    }).notNull(),
    indexKey: text('index_key').notNull(),
    indexSha256: text('index_sha256').notNull(),
    indexJson: text('index_json').notNull(),
    previousReleaseId: text('previous_release_id'),
    expectedGeneration: integer('expected_generation').notNull(),
    publishedAt: integer('published_at'),
  },
  (table) => [
    check(
      'release_status',
      sql`${table.status} IN ('preparing','ready','failed')`,
    ),
    check('release_json', sql`json_valid(${table.indexJson})`),
  ],
);

export const contentReleaseEntries = sqliteTable(
  'content_release_entries',
  {
    releaseId: text('release_id')
      .notNull()
      .references(() => contentReleases.id),
    characterId: text('character_id')
      .notNull()
      .references(() => characters.id),
    characterVersionId: text('character_version_id')
      .notNull()
      .references(() => characterVersions.id),
    manifestPath: text('manifest_path').notNull(),
    manifestSha256: text('manifest_sha256').notNull(),
  },
  (table) => [primaryKey({ columns: [table.releaseId, table.characterId] })],
);

export const contentState = sqliteTable(
  'content_state',
  {
    id: integer('id').primaryKey(),
    activeReleaseId: text('active_release_id').references(
      () => contentReleases.id,
    ),
    generation: integer('generation').notNull().default(0),
  },
  (table) => [
    check('state_singleton', sql`${table.id} = 1`),
    check('generation_positive', sql`${table.generation} >= 0`),
  ],
);

export const abilities = sqliteTable(
  'abilities',
  {
    id: text('id').primaryKey(),
    kind: text('kind').notNull(),
    schemaVersion: integer('schema_version').notNull(),
    configurationSchemaJson: text('configuration_schema_json').notNull(),
    defaultsJson: text('defaults_json').notNull(),
  },
  (table) => [
    check('ability_schema_positive', sql`${table.schemaVersion} > 0`),
    check(
      'ability_schema_json',
      sql`json_valid(${table.configurationSchemaJson})`,
    ),
    check('ability_defaults_json', sql`json_valid(${table.defaultsJson})`),
  ],
);

export const characterAbilities = sqliteTable(
  'character_abilities',
  {
    characterVersionId: text('character_version_id')
      .notNull()
      .references(() => characterVersions.id),
    abilityId: text('ability_id')
      .notNull()
      .references(() => abilities.id),
    configurationJson: text('configuration_json').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.characterVersionId, table.abilityId] }),
    check(
      'character_ability_json',
      sql`json_valid(${table.configurationJson})`,
    ),
  ],
);
