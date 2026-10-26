import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { openSync, closeSync, unlinkSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as schema from './schema.js';

export function openDatabase(path: string) {
  const sqlite = new Database(path);
  try {
    sqlite.pragma('foreign_keys = ON');
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('busy_timeout = 5000');
    return {
      sqlite,
      db: drizzle(sqlite, { schema }),
      close: () => sqlite.close(),
    };
  } catch (error) {
    sqlite.close();
    throw error;
  }
}
export type DatabaseConnection = ReturnType<typeof openDatabase>;

export function migrateDatabase(path: string) {
  // Exclusive local lock: never remove a lock owned by another migration process.
  const lockPath = `${path}.migrate.lock`;
  let lock: number;
  try {
    lock = openSync(lockPath, 'wx', 0o600);
  } catch {
    throw new Error(
      'Migration lock unavailable; stop other migrators and inspect the lock before recovery',
    );
  }
  try {
    writeFileSync(lock, `${process.pid}\n`);
    const connection = openDatabase(path);
    try {
      migrate(connection.db, {
        migrationsFolder: fileURLToPath(
          new URL('../migrations', import.meta.url),
        ),
      });
    } finally {
      connection.close();
    }
  } finally {
    closeSync(lock);
    unlinkSync(lockPath);
  }
}

export function assertDatabaseReady(connection: DatabaseConnection) {
  // No implicit migration during application boot.
  connection.sqlite
    .prepare('SELECT id, original_asset_id FROM characters LIMIT 1')
    .get();
  connection.sqlite.prepare('SELECT id FROM assets LIMIT 1').get();
  connection.sqlite.prepare('SELECT id FROM abilities LIMIT 1').get();
}
export {
  WorkflowRepository,
  type NewWorkflowJob,
  type WorkflowClaim,
} from './workflow.js';
export { AssetRepository, type NewAsset } from './assets.js';
export { ReleaseRepository, type ReleaseEntry } from './releases.js';
export { CharacterRepository } from './repositories.js';
export { seedDevelopment } from './seed.js';
export {
  SnapshotRepository,
  ReviewConflictError,
  type ApprovalDecision,
} from './snapshots.js';
