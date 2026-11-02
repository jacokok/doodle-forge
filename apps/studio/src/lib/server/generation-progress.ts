import { sha256 } from '@doodleforge/contracts';
import {
  generationProgressListSchema,
  publicStageErrorSchema,
} from '@doodleforge/contracts/jobs';
import { WorkflowRepository } from '@doodleforge/database';
import { workflowRequestSchema } from '@doodleforge/workflow';
import { CharacterError, CharacterService } from './characters.js';

/** Owner-scoped read-only projection; never return persisted inputs, outputs, paths or raw errors. */
export class GenerationProgressService {
  constructor(
    private readonly characters: CharacterService,
    private readonly workflows: WorkflowRepository,
  ) {}
  list(value: unknown) {
    const owner = this.characters.get(value);
    try {
      const jobs = this.workflows
        .recentGenerationJobs(owner.id)
        .map(({ job, steps }) => {
          if (sha256(job.requestJson) !== job.requestHash)
            throw new Error('Invalid job identity');
          const request = workflowRequestSchema.parse(
            JSON.parse(job.requestJson),
          );
          if (!request.generation || request.characterId !== owner.id)
            throw new Error('Invalid job owner');
          const failed = steps.filter((step) => step.status === 'failed');
          // Advisory only: the mutation rechecks the complete graph and attempt history under a write lock.
          const candidate =
            job.status === 'failed' &&
            job.cancelRequestedAt === null &&
            job.characterVersionId === null &&
            steps.length === 27 &&
            failed.length === 1 &&
            failed[0]!.attemptCount > 0 &&
            steps.every(
              (step) =>
                step.status === 'succeeded' ||
                ((step.status === 'failed' || step.status === 'blocked') &&
                  step.attemptCount < step.maxAttempts),
            )
              ? { stepId: failed[0]!.id, attempts: failed[0]!.attemptCount }
              : null;
          return {
            retryCandidate: candidate,
            id: job.id,
            characterVersion: request.generation.version,
            frozenVersionId: job.characterVersionId,
            status: job.status,
            createdAt: job.createdAt,
            updatedAt: job.updatedAt,
            completed: steps.filter((step) => step.status === 'succeeded')
              .length,
            total: steps.length,
            steps: steps.map((step) => {
              let errorCode: ReturnType<
                typeof publicStageErrorSchema.parse
              > | null = null;
              if (step.errorJson) {
                try {
                  errorCode = publicStageErrorSchema.parse(
                    JSON.parse(step.errorJson).code,
                  );
                } catch {
                  errorCode = 'UNKNOWN_STAGE_FAILURE';
                }
              }
              return {
                stage: step.stageKey,
                target: step.targetKey,
                status: step.status,
                attempts: step.attemptCount,
                maxAttempts: step.maxAttempts,
                retryAt:
                  step.status === 'queued' && step.attemptCount > 0
                    ? step.availableAt
                    : null,
                errorCode,
              };
            }),
          };
        });
      const result = generationProgressListSchema.parse(jobs);
      this.characters.get(owner.id);
      return result;
    } catch (error) {
      if (error instanceof CharacterError) throw error;
      throw new CharacterError(
        503,
        'generation_progress_unavailable',
        'Generation progress unavailable; refresh to retry.',
      );
    }
  }
}
