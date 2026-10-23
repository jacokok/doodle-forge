import { command, getRequestEvent, query } from '$app/server';
import { z } from 'zod';
import { characterService } from './server/runtime.js';
import { CharacterError } from './server/characters.js';
import { characterResult } from './server/character-result.js';

export const library = query(() =>
  characterResult(() => characterService().list()),
);

function mutation<T>(run: () => T) {
  return characterResult(() => {
    const { request, url } = getRequestEvent();
    if (request.headers.get('origin') !== url.origin) {
      throw new CharacterError(
        403,
        'invalid_origin',
        'Same-origin request required.',
      );
    }
    return run();
  });
}

// Unknown transport inputs are deliberately validated by the shared-schema domain
// service so field errors use the same structured outcome as the JSON API.
export const createCharacter = command(z.unknown(), (input) =>
  mutation(() => characterService().create(input)),
);
export const editCharacter = command(
  z.object({ id: z.unknown(), input: z.unknown() }).strict(),
  ({ id, input }) => mutation(() => characterService().update(id, input)),
);
export const archiveCharacter = command(
  z.object({ id: z.unknown(), input: z.unknown() }).strict(),
  ({ id, input }) =>
    mutation(() => {
      characterService().archive(id, input);
      return null;
    }),
);
