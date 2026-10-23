import { contentResponse } from '../../../../../../../../../lib/server/content-response.js';
import { publishedContent } from '../../../../../../../../../lib/server/runtime.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ request, params }) =>
  contentResponse(request, () =>
    publishedContent().asset(params.id, params.version, params.hash),
  );
