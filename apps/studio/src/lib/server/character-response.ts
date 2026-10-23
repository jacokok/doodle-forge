import { randomUUID } from 'node:crypto';
import { CharacterError } from './characters.js';

const bodyLimit = 16_384;

// Explicit JSON API transport: never trust Content-Length or buffer an unbounded body.
export async function readCharacterMutation(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) {
    throw new CharacterError(
      403,
      'invalid_origin',
      'Same-origin request required.',
    );
  }
  if (
    request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !==
    'application/json'
  ) {
    throw new CharacterError(415, 'unsupported_media_type', 'JSON required.');
  }
  const reader = request.body?.getReader();
  if (!reader)
    throw new CharacterError(400, 'invalid_json', 'JSON body required.');
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > bodyLimit) {
        await reader.cancel();
        throw new CharacterError(
          413,
          'body_too_large',
          'Request exceeds 16 KiB.',
        );
      }
      chunks.push(value);
    }
    return JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)),
    ) as unknown;
  } catch (error) {
    if (error instanceof CharacterError) throw error;
    throw new CharacterError(400, 'invalid_json', 'Invalid JSON body.');
  } finally {
    reader.releaseLock();
  }
}

export async function characterResponse(
  run: () => unknown | Promise<unknown>,
  status = 200,
) {
  const requestId = randomUUID();
  const headers = {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Request-Id': requestId,
  };
  try {
    const result = await run();
    return status === 204
      ? new Response(null, { status, headers })
      : Response.json(result, { status, headers });
  } catch (error) {
    const known = error instanceof CharacterError;
    return Response.json(
      {
        error: {
          code: known ? error.code : 'studio_unavailable',
          message: known
            ? error.message
            : 'Studio unavailable; try again later.',
          ...(known && error.fieldErrors
            ? { fieldErrors: error.fieldErrors }
            : {}),
          requestId,
        },
      },
      { status: known ? error.status : 503, headers },
    );
  }
}
