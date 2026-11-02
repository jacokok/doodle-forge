import { WorkflowRepository } from '@doodleforge/database';
import { z } from 'zod';
import { CharacterError } from './characters.js';

const retrySchema = z.strictObject({
  characterId: z.uuid(),
  jobId: z.uuid(),
  stepId: z.uuid(),
  attempts: z.number().int().min(1).max(9),
});
export class GenerationRetryService {
  constructor(private readonly workflows: WorkflowRepository) {}
  retry(input: unknown) {
    const parsed = retrySchema.safeParse(input);
    if (!parsed.success)
      throw new CharacterError(400, 'invalid_input', 'Invalid retry request.');
    const { characterId, jobId, stepId, attempts } = parsed.data;
    const result = this.workflows.retryFailedMockGeneration(
      characterId,
      jobId,
      stepId,
      attempts,
    );
    if (result === 'not_found')
      throw new CharacterError(404, 'not_found', 'Generation job not found.');
    if (result === 'not_retryable')
      throw new CharacterError(
        409,
        'not_retryable',
        'This job is no longer eligible for retry. Refresh generation progress.',
      );
    return { status: 'queued' as const };
  }
}
