import { building } from '$app/env';
import { ensureStorage, loadConfig } from '@doodleforge/shared/server';
import {
  assertDatabaseReady,
  openDatabase,
  ReleaseRepository,
  CharacterRepository,
  AssetRepository,
} from '@doodleforge/database';
import { PublishedContentService } from '@doodleforge/content-publisher/content';
import path from 'node:path';
import { CharacterService } from './characters.js';
import { OriginalService } from './originals.js';

let connection: ReturnType<typeof openDatabase> | undefined;

export function initializeRuntime() {
  if (building || connection) return;
  const config = loadConfig();
  ensureStorage(config);
  const database = openDatabase(config.databasePath);
  try {
    assertDatabaseReady(database);
  } catch {
    database.close();
    throw new Error(
      'Database is not ready; run pnpm db:migrate before starting studio',
    );
  }
  connection = database;
  const close = () => {
    connection?.close();
    connection = undefined;
  };
  process.once('exit', close);
  process.once('sveltekit:shutdown', close);
}

export function checkDatabase() {
  initializeRuntime();
  if (!connection) throw new Error('Runtime unavailable during build');
  connection.sqlite.prepare('SELECT 1').get();
}

export function characterService() {
  initializeRuntime();
  if (!connection) throw new Error('Runtime unavailable during build');
  return new CharacterService(new CharacterRepository(connection));
}

export function originalService() {
  initializeRuntime();
  if (!connection) throw new Error('Runtime unavailable during build');
  return new OriginalService(
    characterService(),
    new AssetRepository(connection),
    path.join(loadConfig().storageRoot, 'originals'),
  );
}

export function publishedContent() {
  initializeRuntime();
  if (!connection) throw new Error('Runtime unavailable during build');
  return new PublishedContentService(
    new ReleaseRepository(connection),
    path.join(loadConfig().storageRoot, 'published'),
  );
}
