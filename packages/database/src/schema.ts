import { sql } from 'drizzle-orm';
import {
  check,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
  primaryKey,
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

// Snapshot/publication constraints are added by later, additive migrations.
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
