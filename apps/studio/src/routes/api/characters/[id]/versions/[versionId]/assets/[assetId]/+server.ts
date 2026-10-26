import type { RequestHandler } from './$types';
import { reviewActionService } from '../../../../../../../../lib/server/runtime.js';
import { characterResponse } from '../../../../../../../../lib/server/character-response.js';

export const GET: RequestHandler = async ({ params }) => {
  try {
    const bytes = await reviewActionService().preview(
      params.id,
      params.versionId,
      params.assetId,
    );
    return new Response(new Uint8Array(bytes), {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Cross-Origin-Resource-Policy': 'same-origin',
      },
    });
  } catch (error) {
    return characterResponse(() => {
      throw error;
    });
  }
};
