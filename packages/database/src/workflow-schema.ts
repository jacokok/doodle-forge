import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { characters, characterVersions } from './schema.js';

export const generationJobs = sqliteTable(
  'generation_jobs',
  {
    id: text('id').primaryKey(),
    characterId: text('character_id')
      .notNull()
      .references(() => characters.id),
    characterVersionId: text('character_version_id').references(
      () => characterVersions.id,
    ),
    kind: text('kind', { enum: ['generate', 'publish'] }).notNull(),
    status: text('status', {
      enum: [
        'queued',
        'running',
        'waiting_approval',
        'waiting_publish',
        'succeeded',
        'failed',
        'cancelled',
      ],
    }).notNull(),
    requestJson: text('request_json').notNull(),
    requestHash: text('request_hash').notNull(),
    idempotencyKey: text('idempotency_key').notNull().unique(),
    cancelRequestedAt: integer('cancel_requested_at'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [
    index('generation_jobs_status').on(t.status, t.createdAt),
    check('job_kind', sql`${t.kind} IN ('generate','publish')`),
    check(
      'job_status',
      sql`${t.status} IN ('queued','running','waiting_approval','waiting_publish','succeeded','failed','cancelled')`,
    ),
    check('job_request_json', sql`json_valid(${t.requestJson})`),
    check(
      'job_request_hash',
      sql`length(${t.requestHash}) = 64 AND ${t.requestHash} NOT GLOB '*[^a-f0-9]*'`,
    ),
  ],
);

export const generationSteps = sqliteTable(
  'generation_steps',
  {
    id: text('id').primaryKey(),
    jobId: text('job_id')
      .notNull()
      .references(() => generationJobs.id),
    stageKey: text('stage_key').notNull(),
    stageVersion: text('stage_version').notNull(),
    targetKey: text('target_key').notNull(),
    dependenciesJson: text('dependencies_json').notNull(),
    status: text('status', {
      enum: [
        'queued',
        'running',
        'succeeded',
        'failed',
        'cancelled',
        'blocked',
      ],
    }).notNull(),
    inputHash: text('input_hash').notNull(),
    inputJson: text('input_json').notNull(),
    outputJson: text('output_json'),
    errorJson: text('error_json'),
    attemptCount: integer('attempt_count').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull(),
    availableAt: integer('available_at').notNull(),
    leaseOwner: text('lease_owner'),
    leaseToken: integer('lease_token').notNull().default(0),
    leaseExpiresAt: integer('lease_expires_at'),
  },
  (t) => [
    uniqueIndex('generation_step_target').on(t.jobId, t.stageKey, t.targetKey),
    index('generation_steps_due').on(t.status, t.availableAt, t.leaseExpiresAt),
    check(
      'step_status',
      sql`${t.status} IN ('queued','running','succeeded','failed','cancelled','blocked')`,
    ),
    check(
      'step_json',
      sql`json_valid(${t.inputJson}) AND json_valid(${t.dependenciesJson}) AND json_type(${t.dependenciesJson}) = 'array' AND (${t.outputJson} IS NULL OR json_valid(${t.outputJson})) AND (${t.errorJson} IS NULL OR json_valid(${t.errorJson}))`,
    ),
    check(
      'step_input_hash',
      sql`length(${t.inputHash}) = 64 AND ${t.inputHash} NOT GLOB '*[^a-f0-9]*'`,
    ),
    check(
      'step_attempt_bounds',
      sql`${t.attemptCount} >= 0 AND ${t.maxAttempts} BETWEEN 1 AND 10 AND ${t.attemptCount} <= ${t.maxAttempts} AND ${t.leaseToken} >= 0`,
    ),
    check(
      'step_lease',
      sql`(${t.status} = 'running' AND ${t.leaseOwner} IS NOT NULL AND ${t.leaseExpiresAt} IS NOT NULL) OR (${t.status} != 'running' AND ${t.leaseOwner} IS NULL AND ${t.leaseExpiresAt} IS NULL)`,
    ),
  ],
);

export const generationAttempts = sqliteTable(
  'generation_attempts',
  {
    id: text('id').primaryKey(),
    stepId: text('step_id')
      .notNull()
      .references(() => generationSteps.id),
    attemptNo: integer('attempt_no').notNull(),
    leaseToken: integer('lease_token').notNull(),
    workerId: text('worker_id').notNull(),
    startedAt: integer('started_at').notNull(),
    endedAt: integer('ended_at'),
    outcome: text('outcome', {
      enum: ['running', 'succeeded', 'failed', 'expired', 'cancelled'],
    }).notNull(),
    errorJson: text('error_json'),
    providerRequestId: text('provider_request_id'),
  },
  (t) => [
    uniqueIndex('generation_attempt_number').on(t.stepId, t.attemptNo),
    uniqueIndex('generation_attempt_fence').on(t.stepId, t.leaseToken),
    check(
      'attempt_outcome',
      sql`${t.outcome} IN ('running','succeeded','failed','expired','cancelled')`,
    ),
    check('attempt_bounds', sql`${t.attemptNo} > 0 AND ${t.leaseToken} > 0`),
    check(
      'attempt_end',
      sql`(${t.outcome} = 'running' AND ${t.endedAt} IS NULL) OR (${t.outcome} != 'running' AND ${t.endedAt} IS NOT NULL)`,
    ),
    check(
      'attempt_error_json',
      sql`${t.errorJson} IS NULL OR json_valid(${t.errorJson})`,
    ),
  ],
);
