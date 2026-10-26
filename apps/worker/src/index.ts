import { ensureStorage, loadConfig } from '@doodleforge/shared/server';
import { assertDatabaseReady, openDatabase } from '@doodleforge/database';
import { startWorkerRuntime } from './runtime.js';

try {
  const config = loadConfig();
  ensureStorage(config);
  const connection = openDatabase(config.databasePath);
  let worker: Awaited<ReturnType<typeof startWorkerRuntime>>;
  try {
    assertDatabaseReady(connection);
    worker = await startWorkerRuntime(
      connection,
      config.host,
      config.workerPort,
      config.workerConcurrency,
      () => {
        console.error(JSON.stringify({ event: 'worker.scheduler_failed' }));
        process.exitCode = 1;
        queueMicrotask(() => {
          void worker?.close().catch(() => {
            process.exitCode = 1;
          });
        });
      },
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
