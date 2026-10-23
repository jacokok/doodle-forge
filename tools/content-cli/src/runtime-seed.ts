// Test-only fixture publication, never called by normal studio/worker startup.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cp, readFile, writeFile } from 'node:fs/promises';
import { loadConfig } from '@doodleforge/shared/server';
import { characterManifestSchema } from '@doodleforge/contracts';
import {
  openDatabase,
  ReleaseRepository,
  SnapshotRepository,
} from '@doodleforge/database';
import {
  PublicationService,
  ReviewService,
} from '@doodleforge/content-publisher';

const config = loadConfig();
const connection = openDatabase(config.databasePath);
try {
  const reviews = new ReviewService(new SnapshotRepository(connection));
  const publisher = new PublicationService(
    reviews,
    new ReleaseRepository(connection),
    path.join(config.storageRoot, 'published'),
  );
  if (process.argv[2] === 'add-comet') {
    const seed = await reviews.seedFixture('comet');
    if (!seed.manifestSha256) throw new Error('Fixture approval missing');
    await publisher.publish({
      versionId: seed.versionId,
      expectedManifestSha256: seed.manifestSha256,
      sourceDirectory: fileURLToPath(
        new URL(
          '../../../packages/contracts/fixtures/comet/v1',
          import.meta.url,
        ),
      ),
    });
  } else if (process.argv[2] === 'advance') {
    const source = fileURLToPath(
      new URL(
        '../../../packages/contracts/fixtures/sprout/v1',
        import.meta.url,
      ),
    );
    const directory = path.join(config.storageRoot, 'test-revision');
    await cp(source, directory, { recursive: true });
    const filename = path.join(directory, 'character.json');
    const manifest = characterManifestSchema.parse(
      JSON.parse(await readFile(filename, 'utf8')),
    );
    manifest.characterVersion = 2;
    manifest.name = 'Sprout revision two';
    manifest.stats.health = 137;
    await writeFile(filename, JSON.stringify(manifest));
    const snapshot = await reviews.freezePackage(filename, {
      kind: 'test-only-pinned-arena-revision',
    });
    reviews.decide({
      versionId: snapshot.id,
      expectedManifestSha256: snapshot.manifestSha256!,
      decision: 'approved',
      actorLabel: 'arena-integration-test',
    });
    await publisher.publish({
      versionId: snapshot.id,
      expectedManifestSha256: snapshot.manifestSha256!,
      sourceDirectory: directory,
    });
  } else {
    for (const name of ['sprout'] as const) {
      const seed = await reviews.seedFixture(name);
      if (!seed.manifestSha256) throw new Error('Fixture approval missing');
      await publisher.publish({
        versionId: seed.versionId,
        expectedManifestSha256: seed.manifestSha256,
        sourceDirectory: fileURLToPath(
          new URL(
            `../../../packages/contracts/fixtures/${name}/v1`,
            import.meta.url,
          ),
        ),
      });
    }
  }
} finally {
  connection.close();
}
