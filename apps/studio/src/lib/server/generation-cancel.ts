import { WorkflowRepository } from '@doodleforge/database';
import { z } from 'zod';
import { CharacterError } from './characters.js';

const cancelSchema = z.strictObject({
  characterId: z.string().uuid(),
  jobId: z.string().uuid(),
});

export class GenerationCancelService {
  constructor(private readonly workflows: WorkflowRepository) {}
  cancel(input: unknown) {
    const parsed = cancelSchema.safeParse(input);
    if (!parsed.success)
      throw new CharacterError(
        400,
        'invalid_input',
        'Invalid cancellation request.',
      );
    const result = this.workflows.cancelOwnedMockGeneration(
      parsed.data.characterId,
      parsed.data.jobId,
    );
    if (result === 'not_found')
      throw new CharacterError(404, 'not_found', 'Generation job not found.');
    if (result === 'not_cancellable')
      throw new CharacterError(
        409,
        'not_cancellable',
        'This job is no longer cancellable. Refresh generation progress.',
      );
    return { status: 'cancelled' as const };
  }
}
