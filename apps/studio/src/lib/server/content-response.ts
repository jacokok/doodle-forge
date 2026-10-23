import {
  ContentError,
  type ContentFile,
} from '@doodleforge/content-publisher/content';

// Verify the representation first, including conditional requests. A matching
// client ETag must never mask missing or corrupt ready bytes on the server.
export async function contentResponse(
  request: Request,
  read: () => Promise<ContentFile>,
) {
  try {
    const file = await read();
    const etag = `"${file.hash}"`;
    const headers = {
      'Content-Type': file.mediaType,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': file.immutable
        ? 'public, max-age=31536000, immutable'
        : 'no-cache',
      ETag: etag,
    };
    const condition = request.headers.get('if-none-match');
    const matches = condition?.split(',').some((value) => {
      const tag = value.trim();
      return tag === '*' || tag.replace(/^W\//, '') === etag;
    });
    if (matches) return new Response(null, { status: 304, headers });
    return new Response(new Uint8Array(file.bytes), {
      headers: { ...headers, 'Content-Length': String(file.bytes.length) },
    });
  } catch (error) {
    const known = error instanceof ContentError;
    return Response.json(
      {
        error: {
          code: known ? error.code : 'content_unavailable',
          message:
            known && error.status === 400
              ? 'Invalid content parameters.'
              : known && error.status === 404
                ? 'Published content not found.'
                : 'Published content unavailable; operator inspection required.',
        },
      },
      {
        status: known ? error.status : 503,
        headers: {
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      },
    );
  }
}
