import { createHash, randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { canonicalJson } from '@doodleforge/contracts';
import { and, eq, lte } from 'drizzle-orm';
import type { DatabaseConnection } from './index.js';
import { SnapshotRepository, type FrozenSnapshotInput } from './snapshots.js';
import { CharacterRepository } from './repositories.js';
import { AssetRepository } from './assets.js';
import {
  generationJobs,
  generationSteps,
  generationAttempts,
} from './workflow-schema.js';

export interface NewWorkflowJob {
  id: string;
  characterId: string;
  characterVersionId: string | null;
  kind: 'generate' | 'publish';
  requestJson: string;
  requestHash: string;
  idempotencyKey: string;
  steps: {
    id: string;
    stageKey: string;
    stageVersion: string;
    targetKey: string;
    dependencies: string[];
    inputHash: string;
    inputJson: string;
    maxAttempts: number;
  }[];
}
export interface WorkflowClaim {
  stepId: string;
  attemptId: string;
  workerId: string;
  token: number;
}

export interface NewCheckpointLineageClaim {
  id: string;
  characterId: string;
  sourceJobId: string;
  sourceStepId: string;
  sourceAttemptId: string;
  childJobId: string;
  stageKey: string;
  stageVersion: string;
  targetKey: string;
  regenerationTarget: 'idle' | 'walk' | 'attack' | 'hurt' | 'ko';
  sourceSnapshotHash: string;
  childSnapshotHash: string;
  sourceOutputHash: string;
  artifactHashes: readonly string[];
}

export interface GenerationReservation {
  character: NonNullable<ReturnType<CharacterRepository['get']>>;
  original: NonNullable<ReturnType<AssetRepository['get']>>;
  version: number;
}

/** Persistence only: no stage handlers, filesystem writes or provider calls in transactions. */
export class GenerationEnqueueError extends Error {
  constructor(
    public readonly code:
      | 'idempotency_conflict'
      | 'stale_revision'
      | 'original_required'
      | 'version_limit',
  ) {
    super(
      {
        idempotency_conflict: 'Idempotency conflict',
        stale_revision: 'Active character and matching edit revision required',
        original_required: 'Attached immutable original required',
        version_limit: 'Character version limit reached',
      }[code],
    );
  }
}

export class WorkflowRepository {
  constructor(
    private readonly connection: DatabaseConnection,
    private readonly clock: () => number = Date.now,
  ) {}

  private transaction<T>(run: (now: number) => T): T {
    return this.connection.sqlite
      .transaction(() => run(this.clock()))
      .immediate();
  }

  job(id: string) {
    return this.connection.db
      .select()
      .from(generationJobs)
      .where(eq(generationJobs.id, id))
      .get();
  }
  recentGenerationJobs(characterId: string, limit = 10) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 10)
      throw new Error('Invalid job limit');
    // A read transaction keeps the job states and their step projections coherent across workers.
    return this.connection.sqlite
      .transaction(() => {
        const ids = this.connection.sqlite
          .prepare(
            `SELECT id FROM generation_jobs
        WHERE character_id=? AND kind='generate' AND json_extract(request_json,'$.generation.protocol')='mock-factory@1'
        ORDER BY created_at DESC,id DESC LIMIT ?`,
          )
          .all(characterId, limit) as { id: string }[];
        return ids.map(({ id }) => ({
          job: this.job(id)!,
          steps: this.connection.db
            .select({
              id: generationSteps.id,
              stageKey: generationSteps.stageKey,
              targetKey: generationSteps.targetKey,
              status: generationSteps.status,
              attemptCount: generationSteps.attemptCount,
              maxAttempts: generationSteps.maxAttempts,
              availableAt: generationSteps.availableAt,
              errorJson: generationSteps.errorJson,
            })
            .from(generationSteps)
            .where(eq(generationSteps.jobId, id))
            .orderBy(generationSteps.stageKey, generationSteps.targetKey)
            .limit(28)
            .all(),
        }));
      })
      .deferred();
  }
  progress(id: string) {
    const job = this.job(id);
    if (!job) return undefined;
    const counts = this.connection.sqlite
      .prepare(
        "SELECT COUNT(*) AS total, COALESCE(SUM(status='succeeded'),0) AS completed, COALESCE(SUM(status='failed'),0) AS failed FROM generation_steps WHERE job_id=?",
      )
      .get(id) as { total: number; completed: number; failed: number };
    return {
      jobId: id,
      status: job.status,
      characterVersionId: job.characterVersionId,
      ...counts,
    };
  }
  step(id: string) {
    return this.connection.db
      .select()
      .from(generationSteps)
      .where(eq(generationSteps.id, id))
      .get();
  }
  /** Persist an untrusted provenance claim; executor never consumes claim rows. */
  recordCheckpointLineageClaim(input: NewCheckpointLineageClaim) {
    const hash = /^[a-f0-9]{64}$/;
    if (
      !hash.test(input.sourceSnapshotHash) ||
      !hash.test(input.childSnapshotHash) ||
      !hash.test(input.sourceOutputHash) ||
      input.artifactHashes.length < 1 ||
      input.artifactHashes.length > 100 ||
      input.artifactHashes.some((value) => !hash.test(value)) ||
      new Set(input.artifactHashes).size !== input.artifactHashes.length
    )
      throw new Error('Invalid checkpoint lineage hashes');
    return this.transaction((now) => {
      const character = new CharacterRepository(this.connection).get(
        input.characterId,
      );
      const sourceJob = this.job(input.sourceJobId);
      const childJob = this.job(input.childJobId);
      const step = this.step(input.sourceStepId);
      if (
        !character ||
        character.archivedAt !== null ||
        !sourceJob ||
        !childJob ||
        !step ||
        sourceJob.characterId !== input.characterId ||
        childJob.characterId !== input.characterId ||
        sourceJob.kind !== 'generate' ||
        childJob.kind !== 'generate' ||
        sourceJob.cancelRequestedAt !== null ||
        childJob.cancelRequestedAt !== null ||
        !['waiting_approval', 'waiting_publish'].includes(sourceJob.status) ||
        childJob.status !== 'queued' ||
        step.jobId !== sourceJob.id ||
        step.status !== 'succeeded' ||
        step.stageKey !== input.stageKey ||
        step.stageVersion !== input.stageVersion ||
        step.targetKey !== input.targetKey ||
        !step.outputJson
      )
        throw new Error('Checkpoint lineage authority denied');
      if (
        createHash('sha256').update(sourceJob.requestJson).digest('hex') !==
          sourceJob.requestHash ||
        createHash('sha256').update(childJob.requestJson).digest('hex') !==
          childJob.requestHash
      )
        throw new Error('Checkpoint lineage job identity mismatch');
      const source = JSON.parse(sourceJob.requestJson).generation;
      const child = JSON.parse(childJob.requestJson).generation;
      const sourceVersion = source?.version;
      const childVersion = child?.version;
      const sourceSnapshotHash = createHash('sha256')
        .update(canonicalJson(source?.source))
        .digest('hex');
      const childSnapshotHash = createHash('sha256')
        .update(canonicalJson(child?.source))
        .digest('hex');
      const stageInput = JSON.parse(step.inputJson);
      const sourceVersionRecord = sourceJob.characterVersionId
        ? (this.connection.sqlite
            .prepare(
              'SELECT id,character_id,version,source_snapshot_json FROM character_versions WHERE id=?',
            )
            .get(sourceJob.characterVersionId) as
            | {
                id: string;
                character_id: string;
                version: number;
                source_snapshot_json: string;
              }
            | undefined)
        : undefined;
      const childSteps = this.connection.sqlite
        .prepare(
          'SELECT id,stage_key,stage_version,target_key,status,input_hash,input_json FROM generation_steps WHERE job_id=?',
        )
        .all(childJob.id) as {
        id: string;
        stage_key: string;
        stage_version: string;
        target_key: string;
        status: string;
        input_hash: string;
        input_json: string;
      }[];
      const childSourceStep = childSteps.find(
        (candidate) =>
          candidate.stage_key === input.stageKey &&
          candidate.stage_version === input.stageVersion &&
          candidate.target_key === input.targetKey,
      );
      const invalidated = [
        ['generate-pose', input.regenerationTarget],
        ['generate-frames', input.regenerationTarget],
        ['normalize-frames', input.regenerationTarget],
        ['build-sheet', input.regenerationTarget],
        ['generate-metadata', ''],
        ['validate-review', ''],
      ];
      const hasInvalidationGraph = invalidated.every(([stageKey, targetKey]) =>
        childSteps.some(
          (candidate) =>
            candidate.stage_key === stageKey &&
            candidate.target_key === targetKey &&
            candidate.status === 'queued',
        ),
      );
      const reusableStageKeys = new Set([
        'capture-artwork',
        'analyze-captured-description',
        'clean-image',
        'character-master',
        'determine-body-type',
        'generate-pose',
        'generate-frames',
        'normalize-frames',
        'build-sheet',
      ]);
      const checkpointArtifacts: {
        stepId: string;
        attemptId: string;
        sha256: string;
      }[] = [];
      const collectArtifacts = (value: unknown): void => {
        if (Array.isArray(value)) value.forEach(collectArtifacts);
        else if (value && typeof value === 'object') {
          const item = value as Record<string, unknown>;
          if (
            typeof item.stepId === 'string' &&
            typeof item.attemptId === 'string' &&
            typeof item.artifactId === 'string' &&
            typeof item.sha256 === 'string' &&
            typeof item.bytes === 'number' &&
            item.mediaType === 'image/png' &&
            typeof item.width === 'number' &&
            typeof item.height === 'number'
          ) {
            checkpointArtifacts.push({
              stepId: item.stepId,
              attemptId: item.attemptId,
              sha256: item.sha256,
            });
          } else Object.values(item).forEach(collectArtifacts);
        }
      };
      collectArtifacts(JSON.parse(step.outputJson));
      const checkpointArtifactHashes = [
        ...new Set(checkpointArtifacts.map(({ sha256 }) => sha256)),
      ].sort();
      const frozenSource = sourceVersionRecord
        ? JSON.parse(sourceVersionRecord.source_snapshot_json)
        : undefined;
      const childGraphValid =
        childSteps.length > 0 &&
        childSteps.every((candidate) => {
          const envelope = JSON.parse(candidate.input_json);
          return (
            candidate.status === 'queued' &&
            envelope.characterId === input.characterId &&
            envelope.characterVersion === childVersion &&
            envelope.sourceSnapshotHash === childSnapshotHash &&
            createHash('sha256')
              .update(
                canonicalJson({
                  stageKey: candidate.stage_key,
                  stageVersion: candidate.stage_version,
                  input: envelope,
                }),
              )
              .digest('hex') === candidate.input_hash
          );
        });
      const childVersionUnreserved = !this.connection.sqlite
        .prepare(
          `SELECT 1 FROM character_versions WHERE character_id=? AND version=?
         UNION ALL SELECT 1 FROM generation_steps s JOIN generation_jobs j ON j.id=s.job_id
         WHERE j.character_id=? AND j.id!=? AND CAST(json_extract(s.input_json,'$.characterVersion') AS INTEGER)=? LIMIT 1`,
        )
        .get(
          input.characterId,
          childVersion,
          input.characterId,
          childJob.id,
          childVersion,
        );
      const selectedAttempt = this.connection.sqlite
        .prepare(
          "SELECT id FROM generation_attempts WHERE id=? AND step_id=? AND outcome='succeeded' AND lease_token=?",
        )
        .get(input.sourceAttemptId, step.id, step.leaseToken);
      if (
        source?.protocol !== 'mock-factory@1' ||
        child?.protocol !== 'mock-factory@1' ||
        !Number.isSafeInteger(sourceVersion) ||
        !Number.isSafeInteger(childVersion) ||
        sourceVersion >= childVersion ||
        sourceSnapshotHash !== input.sourceSnapshotHash ||
        childSnapshotHash !== input.childSnapshotHash ||
        !sourceVersionRecord ||
        sourceVersionRecord.character_id !== input.characterId ||
        sourceVersionRecord.version !== sourceVersion ||
        sourceJob.characterVersionId !== sourceVersionRecord.id ||
        frozenSource?.kind !== 'workflow-artifacts' ||
        frozenSource?.schemaVersion !== 1 ||
        frozenSource?.sourceSnapshotHash !== sourceSnapshotHash ||
        !childVersionUnreserved ||
        !childGraphValid ||
        !childSourceStep ||
        childSourceStep.status !== 'queued' ||
        !hasInvalidationGraph ||
        !reusableStageKeys.has(step.stageKey) ||
        (step.targetKey !== '' &&
          step.targetKey === input.regenerationTarget) ||
        !checkpointArtifacts.length ||
        checkpointArtifacts.some(
          ({ stepId, attemptId }) =>
            stepId !== step.id || attemptId !== input.sourceAttemptId,
        ) ||
        canonicalJson(checkpointArtifactHashes) !==
          canonicalJson([...input.artifactHashes].sort()) ||
        canonicalJson(source.source?.original) !==
          canonicalJson(child.source?.original) ||
        !selectedAttempt ||
        stageInput.characterId !== input.characterId ||
        stageInput.characterVersion !== sourceVersion ||
        stageInput.sourceSnapshotHash !== sourceSnapshotHash ||
        createHash('sha256')
          .update(
            canonicalJson({
              stageKey: step.stageKey,
              stageVersion: step.stageVersion,
              input: stageInput,
            }),
          )
          .digest('hex') !== step.inputHash ||
        createHash('sha256').update(step.outputJson).digest('hex') !==
          input.sourceOutputHash
      )
        throw new Error('Checkpoint lineage identity mismatch');
      const id = input.id;
      this.connection.sqlite
        .prepare(
          `INSERT INTO generation_checkpoint_lineage_claims
          (id,character_id,source_job_id,source_step_id,source_attempt_id,child_job_id,stage_key,stage_version,target_key,regeneration_target,source_version,child_version,source_snapshot_hash,child_snapshot_hash,source_input_hash,source_output_hash,artifact_hashes_json,created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          id,
          input.characterId,
          sourceJob.id,
          step.id,
          input.sourceAttemptId,
          childJob.id,
          step.stageKey,
          step.stageVersion,
          step.targetKey,
          input.regenerationTarget,
          sourceVersion,
          childVersion,
          sourceSnapshotHash,
          childSnapshotHash,
          step.inputHash,
          input.sourceOutputHash,
          canonicalJson([...input.artifactHashes].sort()),
          now,
        );
      return id;
    });
  }

  checkpointLineageClaims(childJobId: string) {
    return this.connection.sqlite
      .prepare(
        'SELECT * FROM generation_checkpoint_lineage_claims WHERE child_job_id=? ORDER BY stage_key,target_key',
      )
      .all(childJobId);
  }

  attempts(stepId: string) {
    return this.connection.db
      .select()
      .from(generationAttempts)
      .where(eq(generationAttempts.stepId, stepId))
      .orderBy(generationAttempts.attemptNo)
      .all();
  }

  enqueue(request: NewWorkflowJob) {
    // Reject incomplete/cyclic/cross-job graphs before opening a transaction.
    const pending = new Map(request.steps.map((step) => [step.id, step]));
    if (
      !pending.size ||
      pending.size !== request.steps.length ||
      pending.size > 1000
    )
      throw new Error('Invalid workflow graph');
    const visited = new Set<string>();
    while (pending.size) {
      const ready = [...pending.values()].filter((step) =>
        step.dependencies.every((id) => visited.has(id)),
      );
      if (!ready.length) throw new Error('Invalid workflow dependencies');
      for (const step of ready) {
        visited.add(step.id);
        pending.delete(step.id);
      }
    }
    JSON.parse(request.requestJson);
    for (const step of request.steps) JSON.parse(step.inputJson);
    return this.transaction((now) => {
      const existing = this.connection.db
        .select()
        .from(generationJobs)
        .where(eq(generationJobs.idempotencyKey, request.idempotencyKey))
        .get();
      if (existing) {
        if (
          existing.requestHash !== request.requestHash ||
          existing.requestJson !== request.requestJson ||
          existing.characterId !== request.characterId ||
          existing.kind !== request.kind ||
          existing.characterVersionId !== request.characterVersionId
        )
          throw new Error('Idempotency conflict');
        return existing.id;
      }
      if (
        request.characterVersionId &&
        !this.connection.sqlite
          .prepare(
            'SELECT 1 FROM character_versions WHERE id = ? AND character_id = ?',
          )
          .get(request.characterVersionId, request.characterId)
      )
        throw new Error('Version owner mismatch');
      this.connection.db
        .insert(generationJobs)
        .values({
          id: request.id,
          characterId: request.characterId,
          characterVersionId: request.characterVersionId,
          kind: request.kind,
          requestJson: request.requestJson,
          requestHash: request.requestHash,
          idempotencyKey: request.idempotencyKey,
          status: 'queued',
          createdAt: now,
          updatedAt: now,
        })
        .run();
      for (const step of request.steps) {
        this.connection.db
          .insert(generationSteps)
          .values({
            id: step.id,
            jobId: request.id,
            stageKey: step.stageKey,
            stageVersion: step.stageVersion,
            targetKey: step.targetKey,
            dependenciesJson: JSON.stringify(step.dependencies),
            status: 'queued',
            inputHash: step.inputHash,
            inputJson: step.inputJson,
            maxAttempts: step.maxAttempts,
            availableAt: now,
          })
          .run();
      }
      return request.id;
    });
  }

  /** Capture authoring state and reserve a number through retained job steps under one write lock.
   * build must only validate/serialize a graph: never perform I/O or provider work here.
   */
  enqueueGeneration(
    command: {
      characterId: string;
      expectedRevision: number;
      idempotencyKey: string;
      commandJson: string;
    },
    build: (reservation: GenerationReservation) => NewWorkflowJob,
  ) {
    return this.transaction(() => {
      const existing = this.connection.db
        .select()
        .from(generationJobs)
        .where(eq(generationJobs.idempotencyKey, command.idempotencyKey))
        .get();
      if (existing) {
        const identity = JSON.parse(existing.requestJson).generation as
          | { protocol?: string; commandJson?: string; version?: number }
          | undefined;
        if (
          existing.characterId !== command.characterId ||
          existing.kind !== 'generate' ||
          identity?.protocol !== 'mock-factory@1' ||
          identity.commandJson !== command.commandJson ||
          !Number.isSafeInteger(identity.version) ||
          identity.version! < 1
        )
          throw new GenerationEnqueueError('idempotency_conflict');
        return { jobId: existing.id, characterVersion: identity.version! };
      }
      const character = new CharacterRepository(this.connection).get(
        command.characterId,
      );
      if (!character || character.editRevision !== command.expectedRevision)
        throw new GenerationEnqueueError('stale_revision');
      const original = character.originalAssetId
        ? new AssetRepository(this.connection).get(character.originalAssetId)
        : undefined;
      if (
        !original ||
        original.kind !== 'original' ||
        original.characterId !== character.id
      )
        throw new GenerationEnqueueError('original_required');
      const row = this.connection.sqlite
        .prepare(
          `SELECT MAX(version) AS maximum FROM (
        SELECT version FROM character_versions WHERE character_id=?
        UNION ALL SELECT CAST(json_extract(s.input_json,'$.characterVersion') AS INTEGER) FROM generation_steps s
        JOIN generation_jobs j ON j.id=s.job_id WHERE j.character_id=?
      )`,
        )
        .get(character.id, character.id) as { maximum: number | null };
      const version = (row.maximum ?? 0) + 1;
      if (!Number.isSafeInteger(version) || version < 1)
        throw new GenerationEnqueueError('version_limit');
      const request = build({ character, original, version });
      if (
        request.characterId !== character.id ||
        request.kind !== 'generate' ||
        request.idempotencyKey !== command.idempotencyKey ||
        request.characterVersionId !== null ||
        request.steps.some(
          (step) => JSON.parse(step.inputJson).characterVersion !== version,
        )
      )
        throw new Error('Invalid reserved generation graph');
      return { jobId: this.enqueue(request), characterVersion: version };
    });
  }

  claim(
    workerId: string,
    leaseMs = 60_000,
    supportedStages?: readonly { key: string; version: string }[],
  ) {
    this.validateLease(workerId, leaseMs);
    const supportedJson = supportedStages
      ? JSON.stringify(supportedStages)
      : null;
    return this.transaction((now) => {
      const candidate = this.connection.sqlite
        .prepare(
          `SELECT s.id FROM generation_steps s
        JOIN generation_jobs j ON j.id = s.job_id
        WHERE s.status = 'queued' AND s.available_at <= ? AND s.attempt_count < s.max_attempts
          AND j.status IN ('queued','running') AND j.cancel_requested_at IS NULL
          AND (? IS NULL OR EXISTS (SELECT 1 FROM json_each(?) supported
            WHERE json_extract(supported.value, '$.key') = s.stage_key
              AND json_extract(supported.value, '$.version') = s.stage_version))
          AND NOT EXISTS (SELECT 1 FROM json_each(s.dependencies_json) d
            LEFT JOIN generation_steps upstream ON upstream.id = d.value AND upstream.job_id = s.job_id
            WHERE upstream.id IS NULL OR upstream.status != 'succeeded')
        ORDER BY s.available_at, j.created_at, s.id LIMIT 1`,
        )
        .get(now, supportedJson, supportedJson) as { id: string } | undefined;
      if (!candidate) return undefined;
      this.connection.sqlite
        .prepare(
          `UPDATE generation_steps SET status='running', attempt_count=attempt_count+1,
        lease_token=lease_token+1,lease_owner=?,lease_expires_at=? WHERE id=?`,
        )
        .run(workerId, now + leaseMs, candidate.id);
      const step = this.step(candidate.id)!;
      const attemptId = randomUUID();
      this.connection.db
        .insert(generationAttempts)
        .values({
          id: attemptId,
          stepId: step.id,
          attemptNo: step.attemptCount,
          leaseToken: step.leaseToken,
          workerId,
          startedAt: now,
          outcome: 'running',
        })
        .run();
      this.connection.sqlite
        .prepare(
          "UPDATE generation_jobs SET status='running',updated_at=? WHERE id=?",
        )
        .run(now, step.jobId);
      return {
        claim: {
          stepId: step.id,
          attemptId,
          workerId,
          token: step.leaseToken,
        } satisfies WorkflowClaim,
        step,
      };
    });
  }

  private validateLease(workerId: string, leaseMs: number) {
    if (
      !workerId.trim() ||
      workerId.length > 120 ||
      !Number.isSafeInteger(leaseMs) ||
      leaseMs < 1 ||
      leaseMs > 300_000
    )
      throw new Error('Invalid lease');
  }
  private owns(claim: WorkflowClaim, now: number) {
    return (
      this.connection.sqlite
        .prepare(
          `SELECT 1 FROM generation_steps s JOIN generation_jobs j ON j.id=s.job_id
      JOIN generation_attempts a ON a.step_id=s.id AND a.lease_token=s.lease_token
      WHERE s.id=? AND s.status='running' AND s.lease_owner=? AND s.lease_token=? AND s.lease_expires_at>?
      AND j.status='running' AND j.cancel_requested_at IS NULL AND a.id=? AND a.outcome='running'`,
        )
        .get(
          claim.stepId,
          claim.workerId,
          claim.token,
          now,
          claim.attemptId,
        ) !== undefined
    );
  }
  isCurrent(claim: WorkflowClaim) {
    return this.owns(claim, this.clock());
  }
  relinquish(claim: WorkflowClaim) {
    return this.transaction((now) => {
      if (!this.owns(claim, now)) return false;
      const errorJson = JSON.stringify({ code: 'WORKER_STOPPED' });
      const step = this.step(claim.stepId)!;
      this.connection.sqlite
        .prepare(
          "UPDATE generation_attempts SET outcome='cancelled',error_json=?,ended_at=? WHERE id=?",
        )
        .run(errorJson, now, claim.attemptId);
      this.retryOrFail(step, now, errorJson, true);
      return true;
    });
  }
  heartbeat(claim: WorkflowClaim, leaseMs = 60_000) {
    this.validateLease(claim.workerId, leaseMs);
    return this.transaction((now) => {
      if (!this.owns(claim, now)) return false;
      this.connection.sqlite
        .prepare(
          'UPDATE generation_steps SET lease_expires_at=MAX(lease_expires_at,?) WHERE id=?',
        )
        .run(now + leaseMs, claim.stepId);
      return true;
    });
  }
  complete(claim: WorkflowClaim, outputJson: string) {
    JSON.parse(outputJson);
    return this.transaction((now) => {
      if (!this.owns(claim, now)) return false;
      this.connection.sqlite
        .prepare(
          "UPDATE generation_steps SET status='succeeded',output_json=?,error_json=NULL,lease_owner=NULL,lease_expires_at=NULL WHERE id=?",
        )
        .run(outputJson, claim.stepId);
      this.connection.sqlite
        .prepare(
          "UPDATE generation_attempts SET outcome='succeeded',ended_at=? WHERE id=?",
        )
        .run(now, claim.attemptId);
      // Completing computation never implies review approval or publication. Gates arrive with snapshot stages.
      return true;
    });
  }
  /** Adopt a terminal validation checkpoint and its review snapshot in the same write lock. */
  completeReview(
    claim: WorkflowClaim,
    outputJson: string,
    snapshot: FrozenSnapshotInput,
  ) {
    JSON.parse(outputJson);
    const lostLease = new Error('Review lease lost');
    try {
      return this.transaction((now) => {
        if (!this.owns(claim, now)) return false;
        const step = this.step(claim.stepId)!;
        const job = this.job(step.jobId)!;
        const envelope = JSON.parse(step.inputJson) as {
          characterId: string;
          characterVersion: number;
        };
        if (
          step.stageKey !== 'validate-review' ||
          step.stageVersion !== '1' ||
          step.targetKey !== '' ||
          job.kind !== 'generate' ||
          job.characterId !== snapshot.characterId ||
          envelope.characterId !== snapshot.characterId ||
          envelope.characterVersion !== snapshot.version
        )
          throw new Error('Review snapshot identity mismatch');
        const unfinished = this.connection.sqlite
          .prepare(
            "SELECT 1 FROM generation_steps WHERE job_id=? AND id!=? AND status!='succeeded' LIMIT 1",
          )
          .get(job.id, step.id);
        if (unfinished)
          throw new Error('Review requires all other steps to have succeeded');
        const frozen = new SnapshotRepository(this.connection).freeze(snapshot);
        if (
          job.characterVersionId !== null &&
          job.characterVersionId !== frozen.id
        )
          throw new Error('Job review version conflict');
        // Recheck the clock after snapshot insertion; a failure rolls the insertion back too.
        if (!this.complete(claim, outputJson)) throw lostLease;
        this.connection.sqlite
          .prepare(
            "UPDATE generation_jobs SET character_version_id=?,status='waiting_approval',updated_at=? WHERE id=?",
          )
          .run(frozen.id, now, job.id);
        return true;
      });
    } catch (error) {
      if (error === lostLease) return false;
      throw error;
    }
  }
  fail(claim: WorkflowClaim, errorJson: string, retryable: boolean) {
    JSON.parse(errorJson);
    return this.transaction((now) => {
      if (!this.owns(claim, now)) return false;
      const step = this.step(claim.stepId)!;
      this.connection.sqlite
        .prepare(
          "UPDATE generation_attempts SET outcome='failed',error_json=?,ended_at=? WHERE id=?",
        )
        .run(errorJson, now, claim.attemptId);
      this.retryOrFail(step, now, errorJson, retryable);
      return true;
    });
  }
  private retryOrFail(
    step: typeof generationSteps.$inferSelect,
    now: number,
    errorJson: string,
    retryable: boolean,
  ) {
    const retry = retryable && step.attemptCount < step.maxAttempts;
    this.connection.sqlite
      .prepare(
        `UPDATE generation_steps SET status=?,error_json=?,available_at=?,lease_owner=NULL,lease_expires_at=NULL WHERE id=?`,
      )
      .run(
        retry ? 'queued' : 'failed',
        errorJson,
        now + 2000 * 2 ** (step.attemptCount - 1),
        step.id,
      );
    if (!retry) {
      this.connection.sqlite
        .prepare(
          "UPDATE generation_jobs SET status='failed',updated_at=? WHERE id=?",
        )
        .run(now, step.jobId);
      this.stopSteps(step.jobId, now, 'blocked');
    }
  }
  private stopSteps(
    jobId: string,
    now: number,
    pendingStatus: 'blocked' | 'cancelled',
  ) {
    this.connection.sqlite
      .prepare(
        `UPDATE generation_attempts SET outcome='cancelled',ended_at=? WHERE outcome='running'
      AND step_id IN (SELECT id FROM generation_steps WHERE job_id=?)`,
      )
      .run(now, jobId);
    this.connection.sqlite
      .prepare(
        `UPDATE generation_steps SET status=?,lease_owner=NULL,lease_expires_at=NULL
      WHERE job_id=? AND status IN ('queued','running')`,
      )
      .run(pendingStatus, jobId);
  }
  recoverExpired() {
    return this.transaction((now) => {
      const expired = this.connection.db
        .select()
        .from(generationSteps)
        .where(
          and(
            eq(generationSteps.status, 'running'),
            lte(generationSteps.leaseExpiresAt, now),
          ),
        )
        .limit(100)
        .all();
      let recovered = 0;
      for (const step of expired) {
        if (this.step(step.id)?.status !== 'running') continue;
        const errorJson = JSON.stringify({ code: 'LEASE_EXPIRED' });
        this.connection.sqlite
          .prepare(
            "UPDATE generation_attempts SET outcome='expired',error_json=?,ended_at=? WHERE step_id=? AND lease_token=? AND outcome='running'",
          )
          .run(errorJson, now, step.id, step.leaseToken);
        this.retryOrFail(step, now, errorJson, true);
        recovered++;
      }
      return recovered;
    });
  }
  /** Persist an explicit, idempotent generated-publication request. This creates only
   * a queued child job; it does not grant publication authority or stage files.
   */
  enqueueGeneratedPublication(input: {
    characterId: string;
    versionId: string;
    expectedManifestSha256: string;
    expectedSourceSha256: string;
    expectedDecisionOrder: number;
    idempotencyKey: string;
  }) {
    return this.transaction((now) => {
      if (
        !/^[a-zA-Z0-9._:-]{16,200}$/.test(input.idempotencyKey) ||
        !/^[a-f0-9]{64}$/.test(input.expectedManifestSha256) ||
        !/^[a-f0-9]{64}$/.test(input.expectedSourceSha256) ||
        !Number.isSafeInteger(input.expectedDecisionOrder) ||
        input.expectedDecisionOrder < 1
      )
        throw new Error('Invalid generated publication request');
      if (!new CharacterRepository(this.connection).get(input.characterId))
        throw new Error('Generated publication owner unavailable');
      const request = {
        protocol: 'generated-publication@1',
        characterId: input.characterId,
        versionId: input.versionId,
        manifestSha256: input.expectedManifestSha256,
        sourceSha256: input.expectedSourceSha256,
        decisionOrder: input.expectedDecisionOrder,
      };
      const requestJson = canonicalJson(request);
      const requestHash = createHash('sha256')
        .update(requestJson)
        .digest('hex');
      const existing = this.connection.db
        .select()
        .from(generationJobs)
        .where(eq(generationJobs.idempotencyKey, input.idempotencyKey))
        .get();
      if (existing) {
        if (
          existing.kind !== 'publish' ||
          existing.requestJson !== requestJson ||
          existing.requestHash !== requestHash
        )
          throw new Error('Publication idempotency conflict');
        return existing.id;
      }
      const snapshot = new SnapshotRepository(this.connection).get(
        input.versionId,
      );
      const parent = this.connection.sqlite
        .prepare(
          `SELECT id FROM generation_jobs WHERE kind='generate'
          AND character_version_id=? AND character_id=? AND status='waiting_publish'
          AND cancel_requested_at IS NULL LIMIT 1`,
        )
        .get(input.versionId, input.characterId) as { id: string } | undefined;
      const latest =
        snapshot &&
        new SnapshotRepository(this.connection).latestDecision(snapshot.id);
      if (
        !snapshot ||
        snapshot.characterId !== input.characterId ||
        !parent ||
        snapshot.status !== 'approved' ||
        snapshot.manifestSha256 !== input.expectedManifestSha256 ||
        !snapshot.manifestJson ||
        createHash('sha256').update(snapshot.manifestJson).digest('hex') !==
          input.expectedManifestSha256 ||
        createHash('sha256')
          .update(snapshot.sourceSnapshotJson)
          .digest('hex') !== input.expectedSourceSha256 ||
        latest?.decision !== 'approved' ||
        latest.decisionOrder !== input.expectedDecisionOrder ||
        latest.manifestSha256 !== input.expectedManifestSha256
      )
        throw new Error('Generated publication gate unavailable');
      const jobId = randomUUID();
      const stepId = randomUUID();
      const stepInput = canonicalJson({ ...request, parentJobId: parent.id });
      this.connection.db
        .insert(generationJobs)
        .values({
          id: jobId,
          characterId: input.characterId,
          characterVersionId: input.versionId,
          kind: 'publish',
          status: 'queued',
          requestJson,
          requestHash,
          idempotencyKey: input.idempotencyKey,
          cancelRequestedAt: null,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      this.connection.db
        .insert(generationSteps)
        .values({
          id: stepId,
          jobId,
          stageKey: 'publish-generated',
          stageVersion: '1',
          targetKey: '',
          dependenciesJson: '[]',
          status: 'queued',
          inputHash: createHash('sha256').update(stepInput).digest('hex'),
          inputJson: stepInput,
          outputJson: null,
          errorJson: null,
          attemptCount: 0,
          maxAttempts: 1,
          availableAt: now,
          leaseOwner: null,
          leaseToken: 0,
          leaseExpiresAt: null,
        })
        .run();
      return jobId;
    });
  }

  /** Atomic gate persistence only. Caller must first validate every generated source byte;
   * this is not a public approval or publication API. */
  recordGeneratedReviewDecision(input: {
    characterId: string;
    versionId: string;
    expectedManifestSha256: string;
    expectedSourceSha256: string;
    expectedDecisionOrder: number;
    decision: 'approved' | 'rejected' | 'revoked';
    actorLabel: string;
    note: string;
  }) {
    return this.transaction((now) => {
      if (
        !['approved', 'rejected', 'revoked'].includes(input.decision) ||
        !Number.isSafeInteger(input.expectedDecisionOrder) ||
        input.expectedDecisionOrder < 0 ||
        !input.actorLabel.trim() ||
        input.actorLabel.length > 120 ||
        input.note.length > 2000 ||
        !/^[a-f0-9]{64}$/.test(input.expectedSourceSha256)
      )
        throw new Error('Invalid generated decision');
      const snapshots = new SnapshotRepository(this.connection);
      const snapshot = snapshots.get(input.versionId);
      if (
        !snapshot ||
        snapshot.characterId !== input.characterId ||
        !new CharacterRepository(this.connection).get(input.characterId) ||
        !snapshot.manifestJson ||
        snapshot.manifestSha256 !== input.expectedManifestSha256 ||
        createHash('sha256').update(snapshot.manifestJson).digest('hex') !==
          input.expectedManifestSha256 ||
        createHash('sha256')
          .update(snapshot.sourceSnapshotJson)
          .digest('hex') !== input.expectedSourceSha256
      )
        throw new Error('Generated review unavailable');
      let source: {
        kind?: string;
        schemaVersion?: number;
        validationStepId?: string;
        sourceSnapshotHash?: string;
      };
      let output: {
        source?: unknown;
        metadata?: { manifest?: unknown; manifestSha256?: string };
      };
      {
        source = JSON.parse(snapshot.sourceSnapshotJson);
        if (
          source.kind !== 'workflow-artifacts' ||
          source.schemaVersion !== 1 ||
          typeof source.validationStepId !== 'string'
        )
          throw new Error();
        const step = this.step(source.validationStepId);
        const job = step && this.job(step.jobId);
        if (
          !step ||
          !job ||
          job.kind !== 'generate' ||
          job.characterId !== input.characterId ||
          job.characterVersionId !== snapshot.id ||
          job.cancelRequestedAt !== null ||
          !['waiting_approval', 'waiting_publish'].includes(job.status) ||
          createHash('sha256').update(job.requestJson).digest('hex') !==
            job.requestHash ||
          step.stageKey !== 'validate-review' ||
          step.stageVersion !== '1' ||
          step.targetKey !== '' ||
          step.status !== 'succeeded' ||
          !step.outputJson ||
          !this.attempts(step.id).some(
            (attempt) =>
              attempt.outcome === 'succeeded' &&
              attempt.leaseToken === step.leaseToken,
          )
        )
          throw new Error();
        const request = JSON.parse(job.requestJson) as {
          characterId?: string;
          generation?: {
            protocol?: string;
            version?: number;
            source?: unknown;
          };
        };
        output = JSON.parse(step.outputJson);
        if (
          request.characterId !== input.characterId ||
          request.generation?.protocol !== 'mock-factory@1' ||
          request.generation.version !== snapshot.version ||
          !request.generation.source ||
          createHash('sha256')
            .update(canonicalJson(request.generation.source))
            .digest('hex') !== source.sourceSnapshotHash ||
          !isDeepStrictEqual(output.source, source) ||
          !isDeepStrictEqual(
            output.metadata?.manifest,
            JSON.parse(snapshot.manifestJson),
          ) ||
          output.metadata?.manifestSha256 !== input.expectedManifestSha256
        )
          throw new Error();
        const latest = snapshots.latestDecision(snapshot.id);
        if (
          (job.status === 'waiting_publish') !==
            (latest?.decision === 'approved') ||
          (job.status === 'waiting_publish'
            ? snapshot.status !== 'approved'
            : snapshot.status !== 'review')
        )
          throw new Error();
        const decision = snapshots.recordDecision({
          versionId: snapshot.id,
          expectedManifestSha256: input.expectedManifestSha256,
          expectedDecisionOrder: input.expectedDecisionOrder,
          decision: input.decision,
          actorLabel: input.actorLabel,
          note: input.note,
        });
        this.connection.sqlite
          .prepare(
            'UPDATE generation_jobs SET status=?,updated_at=? WHERE id=?',
          )
          .run(
            input.decision === 'approved'
              ? 'waiting_publish'
              : 'waiting_approval',
            now,
            job.id,
          );
        return decision;
      }
    });
  }

  /** Retry a single failed mock job without changing attempts, inputs or adopted outputs.
   * This library boundary is not exposed to Studio; callers must reconcile uncertain results.
   */
  retryFailedMockGeneration(
    characterId: string,
    jobId: string,
    failedStepId: string,
    expectedAttemptCount: number,
  ) {
    return this.transaction((now) => {
      const job = this.job(jobId);
      if (
        !new CharacterRepository(this.connection).get(characterId) ||
        !job ||
        job.characterId !== characterId ||
        job.kind !== 'generate'
      )
        return 'not_found' as const;
      try {
        if (
          createHash('sha256').update(job.requestJson).digest('hex') !==
          job.requestHash
        )
          throw new Error();
        const request = JSON.parse(job.requestJson) as {
          characterId?: unknown;
          generation?: { protocol?: unknown };
        };
        if (
          request.characterId !== characterId ||
          request.generation?.protocol !== 'mock-factory@1'
        )
          throw new Error();
      } catch {
        return 'not_found' as const;
      }
      if (
        job.status !== 'failed' ||
        job.cancelRequestedAt !== null ||
        job.characterVersionId !== null ||
        !Number.isSafeInteger(expectedAttemptCount) ||
        expectedAttemptCount < 1
      )
        return 'not_retryable' as const;
      const steps = this.connection.db
        .select()
        .from(generationSteps)
        .where(eq(generationSteps.jobId, jobId))
        .all();
      const failed = steps.filter((step) => step.status === 'failed');
      if (
        failed.length !== 1 ||
        failed[0]!.id !== failedStepId ||
        failed[0]!.attemptCount !== expectedAttemptCount ||
        steps.length !== 27 ||
        steps.some((step) => {
          if (step.leaseOwner !== null || step.leaseExpiresAt !== null)
            return true;
          if (step.status === 'succeeded') return step.outputJson === null;
          if (step.status !== 'failed' && step.status !== 'blocked')
            return true;
          return (
            step.outputJson !== null || step.attemptCount >= step.maxAttempts
          );
        })
      )
        return 'not_retryable' as const;
      const lastAttempt = this.attempts(failedStepId).find(
        (attempt) => attempt.attemptNo === expectedAttemptCount,
      );
      const runningAttempt = this.connection.sqlite
        .prepare(
          "SELECT 1 FROM generation_attempts a JOIN generation_steps s ON s.id=a.step_id WHERE s.job_id=? AND a.outcome='running' LIMIT 1",
        )
        .get(jobId);
      if (
        !lastAttempt ||
        !['failed', 'expired', 'cancelled'].includes(lastAttempt.outcome) ||
        runningAttempt
      )
        return 'not_retryable' as const;
      // The failure transaction blocks every unfinished step, including independently running siblings.
      // Resuming those siblings consumes their remaining existing attempt budgets, never new budget.
      this.connection.sqlite
        .prepare(
          "UPDATE generation_steps SET status='queued',available_at=?,error_json=NULL WHERE job_id=? AND status IN ('failed','blocked')",
        )
        .run(now, jobId);
      this.connection.sqlite
        .prepare(
          "UPDATE generation_jobs SET status='queued',updated_at=? WHERE id=?",
        )
        .run(now, jobId);
      return 'retried' as const;
    });
  }

  /** Narrow Studio authority: never cancel review/publish or another owner's job. */
  cancelOwnedMockGeneration(characterId: string, jobId: string) {
    return this.transaction((now) => {
      const character = new CharacterRepository(this.connection).get(
        characterId,
      );
      const job = this.job(jobId);
      if (
        !character ||
        !job ||
        job.characterId !== characterId ||
        job.kind !== 'generate'
      )
        return 'not_found' as const;
      let request: {
        characterId?: unknown;
        generation?: { protocol?: unknown };
      };
      try {
        if (
          createHash('sha256').update(job.requestJson).digest('hex') !==
          job.requestHash
        )
          throw new Error();
        request = JSON.parse(job.requestJson);
        if (
          request.characterId !== characterId ||
          request.generation?.protocol !== 'mock-factory@1'
        )
          throw new Error();
      } catch {
        return 'not_found' as const;
      }
      if (job.status === 'cancelled') return 'cancelled' as const;
      if (
        !['queued', 'running'].includes(job.status) ||
        job.cancelRequestedAt !== null ||
        job.characterVersionId !== null
      )
        return 'not_cancellable' as const;
      this.connection.sqlite
        .prepare(
          "UPDATE generation_jobs SET status='cancelled',cancel_requested_at=?,updated_at=? WHERE id=?",
        )
        .run(now, now, jobId);
      this.stopSteps(jobId, now, 'cancelled');
      return 'cancelled' as const;
    });
  }

  cancel(jobId: string) {
    return this.transaction((now) => {
      const job = this.job(jobId);
      if (!job || ['succeeded', 'failed', 'cancelled'].includes(job.status))
        return false;
      this.connection.sqlite
        .prepare(
          "UPDATE generation_jobs SET status='cancelled',cancel_requested_at=?,updated_at=? WHERE id=?",
        )
        .run(now, now, jobId);
      this.stopSteps(jobId, now, 'cancelled');
      return true;
    });
  }
}
