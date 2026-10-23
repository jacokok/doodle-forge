import { originalService } from '../../../../../lib/server/runtime.js';
import { characterResponse } from '../../../../../lib/server/character-response.js';
import { readOriginalUpload } from '../../../../../lib/server/original-transport.js';
import type { RequestHandler } from './$types.js';

export const POST: RequestHandler = ({ request, params }) =>
  characterResponse(async () => {
    const upload = await readOriginalUpload(request);
    return originalService().attach(
      params.id,
      upload.input,
      upload.bytes,
      upload.mediaType,
    );
  }, 201);
