import {
  GenerationEnqueueError,
  WorkflowRepository,
} from '@doodleforge/database';
import {
  enqueueMockGeneration,
  mockGenerationCommandSchema,
} from '@doodleforge/workflow';
import { z } from 'zod';
import { CharacterError, CharacterService } from './characters.js';

/** Explicit offline enqueue only; never starts a worker or grants review authority. */
export class GenerationEnqueueService {
  constructor(
    private readonly characters: CharacterService,
    private readonly workflows: WorkflowRepository,
  ) {}

  enqueue(input: unknown) {
    const parsed = mockGenerationCommandSchema.safeParse(input);
    if (!parsed.success)
      throw new CharacterError(
        400,
        'invalid_input',
        'Invalid generation request.',
      );
    this.characters.get(parsed.data.characterId);
    try {
      return enqueueMockGeneration(this.workflows, parsed.data);
    } catch (error) {
      if (error instanceof GenerationEnqueueError) {
        const messages = {
          idempotency_conflict:
            'This request key was already used for a different generation.',
          stale_revision: 'Character changed; reload before generating.',
          original_required: 'Attach an original drawing before generating.',
          version_limit: 'No further character versions can be reserved.',
        };
        throw new CharacterError(409, error.code, messages[error.code]);
      }
      if (error instanceof z.ZodError)
        throw new CharacterError(
          409,
          'unsupported_generation',
          'Saved character choices are not supported by the mock factory.',
        );
      throw error;
    }
  }
}
