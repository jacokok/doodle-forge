import { characterService } from '../../../../lib/server/runtime.js';
import {
  characterResponse,
  readCharacterMutation,
} from '../../../../lib/server/character-response.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params }) =>
  characterResponse(() => characterService().get(params.id));
export const PATCH: RequestHandler = ({ params, request }) =>
  characterResponse(async () => {
    const input = await readCharacterMutation(request);
    return characterService().update(params.id, input);
  });
export const DELETE: RequestHandler = ({ params, request }) =>
  characterResponse(async () => {
    const input = await readCharacterMutation(request);
    characterService().archive(params.id, input);
  }, 204);
