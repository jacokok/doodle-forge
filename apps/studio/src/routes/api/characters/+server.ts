import { characterService } from '../../../lib/server/runtime.js';
import {
  characterResponse,
  readCharacterMutation,
} from '../../../lib/server/character-response.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = () =>
  characterResponse(() => ({ characters: characterService().list() }));
export const POST: RequestHandler = ({ request }) =>
  characterResponse(async () => {
    const input = await readCharacterMutation(request);
    return characterService().create(input);
  }, 201);
