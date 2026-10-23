import { originalService } from '../../../../../../../lib/server/runtime.js';
import { characterResponse } from '../../../../../../../lib/server/character-response.js';
import type { RequestHandler } from './$types.js';

export const GET: RequestHandler = async ({ params }) => {
  let image:
    | Awaited<ReturnType<ReturnType<typeof originalService>['image']>>
    | undefined;
  const failure = await characterResponse(async () => {
    image = await originalService().image(
      params.id,
      params.assetId,
      params.kind,
    );
    return null;
  });
  if (!image) return failure;
  return new Response(image.bytes, {
    headers: {
      'Content-Type': image.mediaType,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Cross-Origin-Resource-Policy': 'same-origin',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Content-Disposition': 'inline',
    },
  });
};
