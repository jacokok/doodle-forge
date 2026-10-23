import { randomUUID } from 'node:crypto';
import { CharacterError } from './characters.js';

// Serializable domain outcomes for same-app remote functions, never stack/path leaks.
export async function characterResult<T>(run: () => T | Promise<T>) {
  try {
    return { ok: true as const, value: await run() };
  } catch (error) {
    return {
      ok: false as const,
      error: {
        code:
          error instanceof CharacterError ? error.code : 'studio_unavailable',
        message:
          error instanceof CharacterError
            ? error.message
            : 'Studio unavailable; try again later.',
        fieldErrors:
          error instanceof CharacterError ? error.fieldErrors : undefined,
        requestId: randomUUID(),
      },
    };
  }
}
