import { ensureStorage, loadConfig } from '@doodleforge/shared/server';
import { assertDatabaseReady, openDatabase } from '@doodleforge/database';
import { startWorkerHealth } from './lifecycle.js';

try {
  const config = loadConfig();
  ensureStorage(config);
  const connection = openDatabase(config.databasePath);
  let worker;
  try {
    assertDatabaseReady(connection);
    worker = await startWorkerHealth(
      connection,
      config.host,
      config.workerPort,
    );
  } catch (error) {
    connection.close();
    throw error;
  }
  console.log(
    JSON.stringify({ event: 'worker.ready', generation: 'unavailable' }),
  );
  const shutdown = () => {
    void worker
      .close()
      .then(() => console.log(JSON.stringify({ event: 'worker.stopped' })))
      .catch(() => {
        process.exitCode = 1;
      });
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
} catch {
  console.error(
    JSON.stringify({
      event: 'worker.start_failed',
      message: 'Check environment, port availability and run pnpm db:migrate',
    }),
  );
  process.exitCode = 1;
}
