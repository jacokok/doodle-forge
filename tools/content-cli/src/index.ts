import {
  PublicationService,
  ReviewService,
} from '@doodleforge/content-publisher';
import { ensureStorage, loadConfig } from '@doodleforge/shared/server';
import {
  validatePackage,
  characterManifestJsonSchema,
  releaseIndexJsonSchema,
} from '@doodleforge/contracts';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import prettier from 'prettier';
import {
  assertDatabaseReady,
  migrateDatabase,
  openDatabase,
  seedDevelopment,
  SnapshotRepository,
  ReleaseRepository,
} from '@doodleforge/database';

try {
  const command = process.argv[2];
  if (command === 'validate') {
    const manifestPath = process.argv[3];
    if (!manifestPath)
      throw new Error('Usage: content-cli validate <character.json>');
    const result = await validatePackage(manifestPath);
    if (result.errors.length) throw new Error(result.errors.join('\n'));
    console.log(
      JSON.stringify({
        valid: true,
        characterId: result.manifest.characterId,
        characterVersion: result.manifest.characterVersion,
      }),
    );
  } else if (command === 'schema') {
    const directory = process.argv[3] ?? 'packages/contracts/schema';
    await mkdir(directory, { recursive: true });
    await writeFile(
      path.join(directory, 'character-v1.schema.json'),
      await prettier.format(JSON.stringify(characterManifestJsonSchema), {
        parser: 'json',
      }),
    );
    await writeFile(
      path.join(directory, 'release-index-v1.schema.json'),
      await prettier.format(JSON.stringify(releaseIndexJsonSchema), {
        parser: 'json',
      }),
    );
    console.log(
      JSON.stringify({ event: 'contracts.schema.generated', directory }),
    );
  } else if (
    command !== 'migrate' &&
    command !== 'seed' &&
    command !== 'seed-fixtures' &&
    command !== 'reconcile'
  ) {
    throw new Error(
      'Usage: content-cli <migrate|seed|seed-fixtures|reconcile|validate <character.json>|schema [directory]>',
    );
  }
  if (command === 'validate' || command === 'schema') process.exit(0);
  const config = loadConfig();
  ensureStorage(config);
  if (command === 'migrate') {
    migrateDatabase(config.databasePath);
    console.log(JSON.stringify({ event: 'database.migrated' }));
  } else {
    const connection = openDatabase(config.databasePath);
    try {
      assertDatabaseReady(connection);
      if (command === 'reconcile') {
        const publisher = new PublicationService(
          new ReviewService(new SnapshotRepository(connection)),
          new ReleaseRepository(connection),
          path.join(config.storageRoot, 'published'),
        );
        const report = await publisher.reconcile();
        console.log(JSON.stringify(report));
        if (report.corruptReady.length) process.exitCode = 1;
      } else if (command === 'seed-fixtures') {
        const review = new ReviewService(new SnapshotRepository(connection));
        for (const fixture of ['sprout', 'comet'] as const)
          console.log(JSON.stringify(await review.seedFixture(fixture)));
      } else {
        console.log(JSON.stringify(seedDevelopment(connection)));
      }
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
