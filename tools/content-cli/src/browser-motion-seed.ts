// Test-only multi-frame content. Never used by normal studio/worker startup.
import path from 'node:path';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { characterManifestSchema, sha256 } from '@doodleforge/contracts';
import { loadConfig } from '@doodleforge/shared/server';
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
const directory = path.join(config.storageRoot, 'test-motion');
await mkdir(path.join(directory, 'assets'), { recursive: true });
const source = fileURLToPath(
  new URL(
    '../../../packages/contracts/fixtures/sprout/v1/character.json',
    import.meta.url,
  ),
);
const manifest = characterManifestSchema.parse(
  JSON.parse(await readFile(source, 'utf8')),
);
manifest.characterId = '33333333-3333-4333-8333-333333333333';
manifest.name = 'Motion fixture';
// Four visibly distinct frames arranged across two rows exercise atlas positioning.
const frames = await Promise.all(
  ['red', 'green', 'blue', 'yellow'].map((background) =>
    sharp({ create: { width: 256, height: 256, channels: 4, background } })
      .png()
      .toBuffer(),
  ),
);
const sheet = await sharp({
  create: { width: 512, height: 512, channels: 4, background: 'transparent' },
})
  .composite(
    frames.map((input, index) => ({
      input,
      left: (index % 2) * 256,
      top: Math.floor(index / 2) * 256,
    })),
  )
  .png()
  .toBuffer();
const hash = sha256(sheet);
await writeFile(path.join(directory, 'assets', `${hash}.png`), sheet);
for (const animation of Object.values(manifest.animations)) {
  animation.frameCount = 4;
  animation.columns = 2;
  animation.fps = 4;
}
for (const asset of Object.values(manifest.assets)) {
  Object.assign(asset, {
    path: `assets/${hash}.png`,
    sha256: hash,
    bytes: sheet.length,
    width: 512,
    height: 512,
  });
}
const filename = path.join(directory, 'character.json');
await writeFile(filename, JSON.stringify(manifest));
const connection = openDatabase(config.databasePath);
try {
  const snapshots = new SnapshotRepository(connection);
  snapshots.ensureFixtureIdentity({
    id: manifest.characterId,
    name: manifest.name,
    description: manifest.description,
    bodyType: manifest.bodyType,
  });
  const reviews = new ReviewService(snapshots);
  const snapshot = await reviews.freezePackage(filename, {
    kind: 'browser-motion-test',
  });
  if (!snapshot.manifestSha256)
    throw new Error('Motion fixture snapshot missing hash');
  reviews.decide({
    versionId: snapshot.id,
    expectedManifestSha256: snapshot.manifestSha256,
    decision: 'approved',
    actorLabel: 'browser-motion-test',
  });
  await new PublicationService(
    reviews,
    new ReleaseRepository(connection),
    path.join(config.storageRoot, 'published'),
  ).publish({
    versionId: snapshot.id,
    expectedManifestSha256: snapshot.manifestSha256,
    sourceDirectory: directory,
  });
} finally {
  connection.close();
}
