import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import {
  CharacterRepository,
  WorkflowRepository,
  migrateDatabase,
  openDatabase,
} from '@doodleforge/database';
import { mockReviewFixture } from '../../../../../tools/content-cli/src/mock-review-fixture.js';
import { CharacterService } from './characters.js';
import { GenerationEnqueueService } from './generation-enqueue.js';

let root: string,
  db: ReturnType<typeof openDatabase>,
  owners: CharacterRepository,
  workflows: WorkflowRepository,
  service: GenerationEnqueueService;
let fixture: Awaited<ReturnType<typeof mockReviewFixture>>;
beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'doodle-enqueue-'));
  migrateDatabase(join(root, 'queue.sqlite'));
  db = openDatabase(join(root, 'queue.sqlite'));
  fixture = await mockReviewFixture(db, root);
  owners = new CharacterRepository(db);
  workflows = new WorkflowRepository(db);
  service = new GenerationEnqueueService(
    new CharacterService(owners),
    workflows,
  );
});
afterEach(() => {
  db.close();
  rmSync(root, { recursive: true, force: true });
});
function request() {
  return {
    characterId: fixture.characterId,
    expectedRevision: owners.get(fixture.characterId)!.editRevision,
    idempotencyKey: randomUUID(),
    style: 'pixel',
    seed: 17,
  };
}
it('enqueues exactly once and rejects changed commands with the same key', () => {
  const input = request();
  const result = service.enqueue(input);
  expect(service.enqueue(input)).toEqual(result);
  expect(
    workflows
      .recentGenerationJobs(input.characterId)
      .filter(({ job }) => job.id === result.jobId),
  ).toHaveLength(1);
  expect(() => service.enqueue({ ...input, seed: 18 })).toThrow(
    expect.objectContaining({ code: 'idempotency_conflict' }),
  );
});
it('rejects malformed, missing owner and stale requests without enqueuing', () => {
  const input = request();
  const count = workflows.recentGenerationJobs(input.characterId).length;
  expect(() => service.enqueue({ ...input, seed: -1 })).toThrow(
    expect.objectContaining({ code: 'invalid_input' }),
  );
  expect(() =>
    service.enqueue({ ...input, characterId: randomUUID() }),
  ).toThrow(expect.objectContaining({ code: 'not_found' }));
  expect(() =>
    service.enqueue({ ...input, expectedRevision: input.expectedRevision + 1 }),
  ).toThrow(expect.objectContaining({ code: 'stale_revision' }));
  expect(workflows.recentGenerationJobs(input.characterId)).toHaveLength(count);
});
