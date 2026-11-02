import { command, getRequestEvent, query } from '$app/server';
import { z } from 'zod';
import {
  characterService,
  reviewActionService,
  generationProgressService,
  generationEnqueueService,
  generationCancelService,
} from './server/runtime.js';
import { CharacterError } from './server/characters.js';
import { characterResult } from './server/character-result.js';

export const cancelGeneration = command(z.unknown(), (input) =>
  mutation(() => generationCancelService().cancel(input)),
);

export const enqueueGeneration = command(z.unknown(), (input) =>
  mutation(() => generationEnqueueService().enqueue(input)),
);

export const decideVersion = command(z.unknown(), (input) =>
  mutation(() => reviewActionService().decide(input)),
);
export const publishVersion = command(z.unknown(), (input) =>
  mutation(() => reviewActionService().publish(input)),
);

export const library = query(() =>
  characterResult(() => characterService().list()),
);

export const generationProgress = query(z.string().uuid(), (id) =>
  characterResult(() => generationProgressService().list(id)),
);

export const versionHistory = query(z.string().uuid(), (id) =>
  characterResult(() => characterService().history(id)),
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
