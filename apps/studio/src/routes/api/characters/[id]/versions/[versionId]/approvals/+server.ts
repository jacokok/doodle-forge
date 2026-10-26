import type { RequestHandler } from './$types';
import { reviewActionService } from '../../../../../../../lib/server/runtime.js';
import { characterResponse } from '../../../../../../../lib/server/character-response.js';
import { readReviewMutation } from '../../../../../../../lib/server/review-action-transport.js';

export const POST: RequestHandler = ({ params, request }) =>
  characterResponse(async () => {
    const body = await readReviewMutation(request, true);
    return reviewActionService().decide({
      ...body,
      characterId: params.id,
      versionId: params.versionId,
    });
  });
