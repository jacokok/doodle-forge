import {
  WorkflowRepository,
  type DatabaseConnection,
} from '@doodleforge/database';
import { WorkflowRunner } from '@doodleforge/workflow';
import { startWorkerHealth } from './lifecycle.js';
import { mockStageHandlers } from './stages.js';

export async function startWorkerRuntime(
  connection: DatabaseConnection,
  host: string,
  port: number,
  concurrency = 1,
  onFault: () => void = () => {},
) {
  // Fail startup on missing workflow migrations; never migrate or seed here.
  connection.sqlite.prepare('SELECT id FROM generation_jobs LIMIT 1').get();
  connection.sqlite.prepare('SELECT id FROM generation_steps LIMIT 1').get();
  connection.sqlite.prepare('SELECT id FROM generation_attempts LIMIT 1').get();
  let faulted = false;
  const runner = new WorkflowRunner(
    new WorkflowRepository(connection),
    mockStageHandlers(),
    {
      concurrency,
      onFault: () => {
        faulted = true;
        onFault();
      },
    },
  );
  const health = await startWorkerHealth(connection, host, port, () =>
    runner.close(),
  );
  runner.start();
  if (faulted) {
    await health.close();
    throw new Error('Workflow scheduler failed at startup');
  }
  return health;
}
