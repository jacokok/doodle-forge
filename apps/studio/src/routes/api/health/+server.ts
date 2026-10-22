import { json } from '@sveltejs/kit';
import { checkDatabase } from '../../../lib/server/runtime.js';

export function GET() {
  try {
    checkDatabase();
    return json(
      { status: 'ok', service: 'studio', generation: 'unavailable' },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch {
    return json(
      { status: 'unavailable', service: 'studio' },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    );
  }
}
