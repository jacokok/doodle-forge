import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { migrateDatabase, openDatabase } from '@doodleforge/database';
import { startWorkerHealth } from './lifecycle.js';

it('reports genuine health, no generation, unknown routes and closes idempotently', async () => {
  const root = mkdtempSync(join(tmpdir(), 'doodle-worker-'));
  const path = join(root, 'test.sqlite');
  migrateDatabase(path);
  const connection = openDatabase(path);
  const worker = await startWorkerHealth(connection, '127.0.0.1', 0);
  try {
    const address = worker.server.address();
    if (!address || typeof address === 'string')
      throw new Error('Missing TCP address');
    const url = `http://127.0.0.1:${address.port}`;
    const health = await fetch(`${url}/health`);
    expect(health.headers.get('cache-control')).toBe('no-store');
    expect(await health.json()).toEqual({
      status: 'ok',
      service: 'worker',
      generation: 'unavailable',
    });
    expect((await fetch(`${url}/private`)).status).toBe(404);
    expect((await fetch(`${url}/health`, { method: 'POST' })).status).toBe(404);
    await Promise.all([worker.close(), worker.close()]);
    expect(connection.sqlite.open).toBe(false);
  } finally {
    await worker.close();
    rmSync(root, { recursive: true, force: true });
  }
});
