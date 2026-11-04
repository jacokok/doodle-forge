import { building } from '$app/env';
import {
  ensureStorage,
  loadConfig,
  repositoryRoot,
} from '@doodleforge/shared/server';
import {
  assertDatabaseReady,
  openDatabase,
  ReleaseRepository,
  CharacterRepository,
  AssetRepository,
  SnapshotRepository,
  WorkflowRepository,
} from '@doodleforge/database';
import { PublishedContentService } from '@doodleforge/content-publisher/content';
import path from 'node:path';
import { CharacterService } from './characters.js';
import { OriginalService } from './originals.js';
import { ReviewActionService } from './review-actions.js';
import { GenerationProgressService } from './generation-progress.js';
import { GenerationEnqueueService } from './generation-enqueue.js';
import { GenerationCancelService } from './generation-cancel.js';
import { GenerationRetryService } from './generation-retry.js';
import { ArtifactStore, GeneratedReviewSources } from '@doodleforge/workflow';

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
  return new CharacterService(
    new CharacterRepository(connection),
    new SnapshotRepository(connection),
    process.env.DOODLEFORGE_BROWSER_TEST_MODE === 'generated-review-decisions',
  );
}

export function generationProgressService() {
  initializeRuntime();
  if (!connection) throw new Error('Runtime unavailable during build');
  return new GenerationProgressService(
    characterService(),
    new WorkflowRepository(connection),
  );
}

export function generationRetryService() {
  initializeRuntime();
  if (!connection) throw new Error('Runtime unavailable during build');
  return new GenerationRetryService(new WorkflowRepository(connection));
}

export function generationCancelService() {
  initializeRuntime();
  if (!connection) throw new Error('Runtime unavailable during build');
  return new GenerationCancelService(new WorkflowRepository(connection));
}

export function generationEnqueueService() {
  initializeRuntime();
  if (!connection) throw new Error('Runtime unavailable during build');
  return new GenerationEnqueueService(
    characterService(),
    new WorkflowRepository(connection),
  );
}

export function reviewActionService() {
  initializeRuntime();
  if (!connection) throw new Error('Runtime unavailable during build');
  return new ReviewActionService(
    characterService(),
    new SnapshotRepository(connection),
    new ReleaseRepository(connection),
    path.join(loadConfig().storageRoot, 'published'),
    path.join(repositoryRoot, 'packages/contracts/fixtures'),
    new GeneratedReviewSources(
      new WorkflowRepository(connection),
      new SnapshotRepository(connection),
      new CharacterRepository(connection),
      new ArtifactStore(
        path.join(loadConfig().storageRoot, 'generated', 'attempts'),
      ),
    ),
  );
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
