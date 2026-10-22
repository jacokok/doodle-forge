import { building } from '$app/env';
import { ensureStorage, loadConfig } from '@doodleforge/shared/server';
import { assertDatabaseReady, openDatabase } from '@doodleforge/database';

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
