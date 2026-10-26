import {
  frozenVersionMutationSchema,
  reviewDecisionSchema,
} from '@doodleforge/contracts/authoring';
import { CharacterError } from './characters.js';
import { readCharacterMutation } from './character-response.js';

export async function readReviewMutation(request: Request, decision: boolean) {
  const body = await readCharacterMutation(request);
  const schema = decision
    ? reviewDecisionSchema.omit({ characterId: true, versionId: true })
    : frozenVersionMutationSchema.omit({ characterId: true, versionId: true });
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    throw new CharacterError(
      400,
      'invalid_input',
      'Invalid frozen-version action.',
    );
  return parsed.data;
}
