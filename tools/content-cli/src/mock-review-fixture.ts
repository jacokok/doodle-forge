// Test-only real mock graph fixture; normal server/worker startup never imports this module.
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import {
  AssetRepository,
  CharacterRepository,
  WorkflowRepository,
  type DatabaseConnection,
} from '@doodleforge/database';
import { sha256 } from '@doodleforge/contracts';
import { enqueueMockGeneration, WorkflowRunner } from '@doodleforge/workflow';
import { mockStageHandlers } from '../../../apps/worker/src/stages.js';

export async function mockReviewFixture(
  connection: DatabaseConnection,
  root: string,
  name = 'Generated preview fixture',
) {
  await mkdir(join(root, 'originals'), { recursive: true });
  const bytes = await readFile(
    new URL(
      '../../../packages/contracts/fixtures/sprout/v1/assets/db061ac349376d65ef413dbf86627cc70e692922ab59b9087cbd11eb73bb423d.png',
      import.meta.url,
    ),
  );
  const owner = new CharacterRepository(connection).create({
    name,
    description: 'Synthetic generated review',
    bodyType: 'humanoid',
    fightingStyle: 'light_melee',
    specialPower: 'none',
  });
  const originalId = randomUUID(),
    previewId = randomUUID();
  const common = {
    characterId: owner.id,
    sha256: sha256(bytes),
    bytes: bytes.length,
    mediaType: 'image/png',
    width: 256,
    height: 256,
    createdAt: Date.now(),
  };
  new AssetRepository(connection).attach(
    owner.id,
    owner.editRevision,
    {
      ...common,
      id: originalId,
      kind: 'original',
      storageKey: `${originalId}.original`,
    },
    {
      ...common,
      id: previewId,
      kind: 'preview',
      storageKey: `${previewId}.png`,
      sourceAssetId: originalId,
    },
  );
  await writeFile(join(root, 'originals', `${originalId}.original`), bytes);
  await writeFile(join(root, 'originals', `${previewId}.png`), bytes);
  const workflows = new WorkflowRepository(connection);
  const queued = enqueueMockGeneration(workflows, {
    characterId: owner.id,
    expectedRevision: owner.editRevision + 1,
    idempotencyKey: randomUUID(),
    style: 'pixel',
    seed: 17,
  });
  const runner = new WorkflowRunner(
    workflows,
    mockStageHandlers(connection, root),
    { pollMs: 5, concurrency: 2 },
  );
  try {
    runner.start();
    const deadline = Date.now() + 15_000;
    while (workflows.job(queued.jobId)!.status !== 'waiting_approval') {
      if (
        workflows.job(queued.jobId)!.status === 'failed' ||
        Date.now() > deadline
      )
        throw new Error('Mock fixture generation failed');
      await delay(10);
    }
  } finally {
    await runner.close();
  }
  return {
    characterId: owner.id,
    jobId: queued.jobId,
    versionId: workflows.job(queued.jobId)!.characterVersionId!,
    originalId,
  };
}
