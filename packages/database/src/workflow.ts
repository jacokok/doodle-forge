import { randomUUID } from 'node:crypto';
import { and, eq, lte } from 'drizzle-orm';
import type { DatabaseConnection } from './index.js';
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

/** Persistence only: no stage handlers, filesystem writes or provider calls in transactions. */
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
  step(id: string) {
    return this.connection.db
      .select()
      .from(generationSteps)
      .where(eq(generationSteps.id, id))
      .get();
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
