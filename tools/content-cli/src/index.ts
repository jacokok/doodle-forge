import { ensureStorage, loadConfig } from '@doodleforge/shared/server';
import {
  assertDatabaseReady,
  migrateDatabase,
  openDatabase,
  seedDevelopment,
} from '@doodleforge/database';

try {
  const command = process.argv[2];
  if (command !== 'migrate' && command !== 'seed')
    throw new Error(
      'Usage: content-cli <migrate|seed>; validation/export are not implemented',
    );
  const config = loadConfig();
  ensureStorage(config);
  if (command === 'migrate') {
    migrateDatabase(config.databasePath);
    console.log(JSON.stringify({ event: 'database.migrated' }));
  } else {
    const connection = openDatabase(config.databasePath);
    try {
      assertDatabaseReady(connection);
      console.log(JSON.stringify(seedDevelopment(connection)));
    } finally {
      connection.close();
    }
  }
} catch (error) {
  console.error(
    error instanceof Error ? error.message : 'Database command failed',
  );
  process.exitCode = 1;
}
