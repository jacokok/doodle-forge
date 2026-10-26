import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ensureStorage, loadConfig } from './server.js';

describe('server configuration', () => {
  it('resolves paths from an explicit root and creates private storage directories', () => {
    const root = mkdtempSync(join(tmpdir(), 'doodle-config-'));
    try {
      const config = loadConfig({}, root);
      expect(config.databasePath).toBe(
        join(root, 'storage/db/doodleforge.sqlite'),
      );
      ensureStorage(config);
      for (const name of [
        'originals',
        'generated',
        'approved',
        'published',
        'db',
      ])
        expect(existsSync(join(config.storageRoot, name))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it.each([
    { DOODLEFORGE_WORKER_CONCURRENCY: '0' },
    { DOODLEFORGE_WORKER_CONCURRENCY: '5' },
    { DOODLEFORGE_WORKER_CONCURRENCY: '1.5' },
    { PORT: 'nope' },
    { WORKER_PORT: '80' },
    { HOST: '0.0.0.0' },
    { ORIGIN: 'https://example.com' },
    { ORIGIN: 'http://127.0.0.1/private' },
    { ORIGIN: 'http://secret@localhost' },
    { PORT: '5174' },
    { DOODLEFORGE_STORAGE_ROOT: '' },
  ])('rejects invalid or nonlocal configuration %j', (env) => {
    expect(() => loadConfig(env)).toThrow();
  });
  it('defaults to one worker stage and accepts only bounded explicit concurrency', () => {
    expect(loadConfig({}).workerConcurrency).toBe(1);
    expect(
      loadConfig({ DOODLEFORGE_WORKER_CONCURRENCY: '4' }).workerConcurrency,
    ).toBe(4);
  });
  it('does not print invalid environment values', () => {
    expect(() => loadConfig({ PORT: 'private-secret' })).toThrow(
      'Invalid environment: PORT',
    );
  });
});
