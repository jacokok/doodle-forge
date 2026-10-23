import {
  attachOriginalSchema,
  originalUploadPolicy,
} from '@doodleforge/contracts/authoring';
import { CharacterError } from './characters.js';

export async function readOriginalUpload(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin)
    throw new CharacterError(
      403,
      'invalid_origin',
      'Same-origin request required.',
    );
  if (
    !request.headers
      .get('content-type')
      ?.toLowerCase()
      .startsWith('multipart/form-data;')
  )
    throw new CharacterError(
      415,
      'unsupported_media_type',
      'Multipart image upload required.',
    );
  const limit = originalUploadPolicy.maxRequestBytes;
  const reader = request.body?.getReader();
  if (!reader)
    throw new CharacterError(400, 'invalid_input', 'Image required.');
  let length = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > limit) {
        await reader.cancel();
        throw new CharacterError(
          413,
          'body_too_large',
          'Upload request exceeds 10 MiB plus 64 KiB framing.',
        );
      }
      chunks.push(value);
    }
  } catch (error) {
    // adapter-node may reject the stream before the application sees bytes.
    // Translate only its size status, never expose adapter diagnostics/paths.
    if (error instanceof Error && 'status' in error && error.status === 413) {
      throw new CharacterError(
        413,
        'body_too_large',
        'Upload request exceeds the size limit.',
      );
    }
    throw error;
  } finally {
    reader.releaseLock();
  }
  let form: FormData;
  try {
    // Parsing/buffering is permitted only after the streaming envelope bound.
    form = await new Response(Buffer.concat(chunks), {
      headers: { 'content-type': request.headers.get('content-type')! },
    }).formData();
  } catch {
    throw new CharacterError(
      400,
      'invalid_input',
      'Malformed multipart upload.',
    );
  }
  const file = form.get('image');
  const revision = form.get('expectedRevision');
  const parsed = attachOriginalSchema.safeParse({
    expectedRevision:
      typeof revision === 'string' && /^[1-9][0-9]*$/.test(revision)
        ? Number(revision)
        : null,
  });
  if (
    !parsed.success ||
    !(file instanceof File) ||
    [...form.keys()].length !== 2 ||
    form.getAll('image').length !== 1 ||
    form.getAll('expectedRevision').length !== 1
  )
    throw new CharacterError(
      400,
      'invalid_input',
      'Provide one image and expectedRevision only.',
    );
  if (file.size > originalUploadPolicy.maxBytes)
    throw new CharacterError(413, 'body_too_large', 'Image exceeds 10 MiB.');
  return {
    bytes: Buffer.from(await file.arrayBuffer()),
    mediaType: file.type,
    input: parsed.data,
  };
}
