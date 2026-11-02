import { z } from 'zod';

// Browser-safe persistence/progress vocabulary shared with the database schema.
export const generationJobStatuses = [
  'queued',
  'running',
  'waiting_approval',
  'waiting_publish',
  'succeeded',
  'failed',
  'cancelled',
] as const;
export const generationStepStatuses = [
  'queued',
  'running',
  'succeeded',
  'failed',
  'cancelled',
  'blocked',
] as const;
export const publicStageErrorSchema = z.enum([
  'TRANSIENT_STAGE_FAILURE',
  'STAGE_EXECUTION_FAILED',
  'LEASE_EXPIRED',
  'WORKER_STOPPED',
  'UNKNOWN_STAGE_FAILURE',
]);
export const generationProgressSchema = z
  .strictObject({
    id: z.uuid(),
    characterVersion: z.number().int().positive(),
    frozenVersionId: z.uuid().nullable(),
    status: z.enum(generationJobStatuses),
    createdAt: z.number().int().nonnegative(),
    updatedAt: z.number().int().nonnegative(),
    completed: z.number().int().min(0).max(27),
    total: z.literal(27),
    steps: z
      .array(
        z.strictObject({
          stage: z.string().regex(/^[a-z][a-z0-9-]{0,79}$/),
          target: z.string().max(80),
          status: z.enum(generationStepStatuses),
          attempts: z.number().int().min(0).max(10),
          maxAttempts: z.number().int().min(1).max(10),
          retryAt: z.number().int().nonnegative().nullable(),
          errorCode: publicStageErrorSchema.nullable(),
        }),
      )
      .length(27),
  })
  .refine(
    (job) =>
      job.completed ===
        job.steps.filter((step) => step.status === 'succeeded').length &&
      job.steps.every((step) => step.attempts <= step.maxAttempts),
    'Inconsistent persisted job progress',
  );
export const generationProgressListSchema = z
  .array(generationProgressSchema)
  .max(10);
export type GenerationProgress = z.infer<typeof generationProgressSchema>;
