// Test-only real generated review; never run by normal startup.
import { loadConfig } from '@doodleforge/shared/server';
import {
  openDatabase,
  WorkflowRepository,
  CharacterRepository,
} from '@doodleforge/database';
import { enqueueMockGeneration } from '@doodleforge/workflow';
import { mockReviewFixture } from './mock-review-fixture.js';
const config = loadConfig();
const connection = openDatabase(config.databasePath);
try {
  const fixture = await mockReviewFixture(connection, config.storageRoot);
  const now = Date.now();
  const workflows = new WorkflowRepository(connection, () => now);
  const revision = new CharacterRepository(connection).get(
    fixture.characterId,
  )!.editRevision;
  const enqueue = (key: string) =>
    enqueueMockGeneration(workflows, {
      characterId: fixture.characterId,
      expectedRevision: revision,
      idempotencyKey: key,
      style: 'pixel',
      seed: 17,
    });
  // Test-only fault/lease states exercise read-only progress; no browser worker executes these jobs.
  enqueue('browser-failed');
  workflows.fail(
    workflows.claim('browser-progress-fault')!.claim,
    JSON.stringify({
      code: 'STAGE_EXECUTION_FAILED',
      message: '/private/mock/provider-message',
    }),
    false,
  );
  enqueue('browser-retry');
  workflows.fail(
    workflows.claim('browser-progress-retry')!.claim,
    JSON.stringify({ code: 'TRANSIENT_STAGE_FAILURE' }),
    true,
  );
  enqueue('browser-running');
  workflows.claim('browser-private-worker');
  enqueue('browser-queued');
  console.log(JSON.stringify(fixture));
} finally {
  connection.close();
}
