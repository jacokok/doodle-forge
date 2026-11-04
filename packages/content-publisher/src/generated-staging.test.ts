import {
  chmod,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { afterEach, expect, it } from 'vitest';
import {
  canonicalJson,
  sha256,
  type CharacterManifest,
  type ReleaseIndex,
} from '@doodleforge/contracts';
import {
  GeneratedPublicationStager,
  type StageGeneratedPublicationInput,
  verifyStagedGeneratedPublication,
} from './generated-staging.js';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function fixtureInput(): Promise<StageGeneratedPublicationInput> {
  const fixture = path.resolve('packages/contracts/fixtures/sprout/v1');
  const raw = JSON.parse(
    await readFile(path.join(fixture, 'character.json'), 'utf8'),
  ) as CharacterManifest;
  const generatedAssets = await Promise.all(
    Object.entries(raw.assets).map(async ([assetId, asset], index) => {
      const pixels = Buffer.alloc(256 * 256 * 4);
      for (let y = 64; y < 192; y++) {
        for (let x = 64; x < 192; x++) {
          const offset = (y * 256 + x) * 4;
          pixels[offset] = 40 + index * 25;
          pixels[offset + 1] = 100;
          pixels[offset + 2] = 200 - index * 20;
          pixels[offset + 3] = 220;
        }
      }
      const bytes = await sharp(pixels, {
        raw: { width: 256, height: 256, channels: 4 },
      })
        .png()
        .toBuffer();
      raw.assets[assetId] = {
        ...asset,
        bytes: bytes.length,
        sha256: sha256(bytes),
        width: 256,
        height: 256,
      };
      return { assetId, bytes };
    }),
  );
  const manifestJson = Buffer.from(canonicalJson(raw));
  const versionId = randomUUID();
  const releaseId = randomUUID();
  const manifestPath = `characters/${raw.characterId}/v${raw.characterVersion}/character.json`;
  const entry = {
    characterId: raw.characterId,
    characterVersionId: versionId,
    characterVersion: raw.characterVersion,
    manifestPath,
    manifestSha256: sha256(manifestJson),
  };
  const index: ReleaseIndex = {
    schemaVersion: 1,
    releaseId,
    characters: [
      {
        characterId: entry.characterId,
        characterVersion: entry.characterVersion,
        manifestPath: entry.manifestPath,
        manifestSha256: entry.manifestSha256,
      },
    ],
  };
  const assetsByPath = new Map(
    generatedAssets.map(({ assetId, bytes }) => [
      raw.assets[assetId]!.path,
      bytes,
    ]),
  );
  const packageAssets = Object.values(raw.assets).map((asset) => {
    const bytes = assetsByPath.get(asset.path)!;
    return {
      path: asset.path,
      bytes,
      expectedSha256: asset.sha256,
      expectedBytes: asset.bytes,
      width: asset.width,
      height: asset.height,
    };
  });
  return {
    publishJobId: randomUUID(),
    canonicalRequestHash: 'a'.repeat(64),
    versionId,
    expectedManifestSha256: sha256(manifestJson),
    manifestJson,
    assets: packageAssets,
    releaseId,
    expectedPreviousReleaseId: null,
    expectedGeneration: 0,
    entries: [entry],
    indexJson: Buffer.from(canonicalJson(index)),
    expectedIndexSha256: sha256(canonicalJson(index)),
  };
}

async function makeRoot() {
  const root = await mkdtemp(
    path.join(tmpdir(), 'doodleforge-generated-stage-'),
  );
  roots.push(root);
  return root;
}

it('stages exact verified manifest, all five PNGs and canonical release index; verifier re-reads them', async () => {
  const root = await makeRoot();
  const input = await fixtureInput();
  const staged = await new GeneratedPublicationStager(root).stage(input);
  expect(staged).toMatchObject({
    versionId: input.versionId,
    characterVersion: 1,
    expectedGeneration: 0,
    staged: true,
    manifestSha256: input.expectedManifestSha256,
    indexSha256: input.expectedIndexSha256,
  });
  expect(staged.assets).toHaveLength(5);
  await expect(
    verifyStagedGeneratedPublication(root, staged),
  ).resolves.toBeUndefined();
  const index = JSON.parse(
    await readFile(path.join(root, staged.indexPath), 'utf8'),
  ) as ReleaseIndex;
  expect(index.releaseId).toBe(staged.releaseId);
  expect(index.characters).toHaveLength(1);
});

it('rejects unbounded/count-invalid buffers before copying and survives crash-left private staging on restart', async () => {
  const root = await makeRoot();
  const input = await fixtureInput();
  const tooMany = { ...input, assets: [...input.assets, input.assets[0]!] };
  await expect(
    new GeneratedPublicationStager(root).stage(tooMany),
  ).rejects.toThrow('pre-copy bounds');
  const malformed = {
    ...input,
    assets: input.assets.map((asset, index) =>
      index === 0 ? { ...asset, bytes: {} as Buffer } : asset,
    ),
  };
  await expect(
    new GeneratedPublicationStager(root).stage(malformed),
  ).rejects.toThrow('pre-copy bounds');

  const { mkdir } = await import('node:fs/promises');
  const staleWork = path.join(
    root,
    '.staging/generated',
    `${input.publishJobId}-crashed`,
  );
  await mkdir(staleWork, { recursive: true });
  const stalePublisherMarker = path.join(root, '.publishers', randomUUID());
  await mkdir(stalePublisherMarker, { recursive: true });
  const staged = await new GeneratedPublicationStager(root).stage(input);
  await expect(
    verifyStagedGeneratedPublication(root, staged),
  ).resolves.toBeUndefined();
  await expect(
    readdir(path.join(root, '.staging/generated')),
  ).resolves.toContain(`${input.publishJobId}-crashed`);
  await expect(
    readdir(path.join(root, '.staging/generated')),
  ).resolves.not.toContain('.install-lock');
});

it('refuses a conflicting legacy publisher package already present at the immutable destination', async () => {
  const root = await makeRoot();
  const input = await fixtureInput();
  const character = JSON.parse(input.manifestJson.toString())
    .characterId as string;
  const packagePath = path.join(root, `characters/${character}/v1`);
  const { mkdir } = await import('node:fs/promises');
  await mkdir(packagePath, { recursive: true });
  await writeFile(
    path.join(packagePath, 'character.json'),
    Buffer.from('legacy-conflict'),
  );
  await expect(
    new GeneratedPublicationStager(root).stage(input),
  ).rejects.toThrow();
  await expect(
    readFile(path.join(packagePath, 'character.json')),
  ).resolves.toEqual(Buffer.from('legacy-conflict'));
});

it('converges concurrent identical installs through atomic rename and collision verification', async () => {
  const root = await makeRoot();
  const input = await fixtureInput();
  const stager = new GeneratedPublicationStager(root);
  const [first, second] = await Promise.all([
    stager.stage(input),
    stager.stage(input),
  ]);
  expect(first).toMatchObject({ releaseId: input.releaseId });
  expect(second).toMatchObject({ releaseId: input.releaseId });
  await expect(
    verifyStagedGeneratedPublication(root, first),
  ).resolves.toBeUndefined();
  await expect(
    verifyStagedGeneratedPublication(root, second),
  ).resolves.toBeUndefined();
});

it('copies caller buffers synchronously before any async staging work', async () => {
  const root = await makeRoot();
  const input = await fixtureInput();
  const manifest = Buffer.from(input.manifestJson);
  const asset = Buffer.from(input.assets[0]!.bytes);
  const manifestHash = input.expectedManifestSha256;
  const firstAssetHash = input.assets[0]!.expectedSha256;
  const pending = new GeneratedPublicationStager(root).stage(input);
  input.manifestJson.fill(0);
  input.assets[0]!.bytes.fill(0);
  await expect(pending).resolves.toMatchObject({
    manifestSha256: manifestHash,
  });
  expect(manifest.length).toBeGreaterThan(0);
  expect(asset.length).toBeGreaterThan(0);
  const staged = await new GeneratedPublicationStager(root).stage(
    await fixtureInput(),
  );
  expect(staged.assets.some((item) => item.sha256 === firstAssetHash)).toBe(
    true,
  );
});

it('rejects missing, extra, duplicate, corrupted assets and manifest/index identity mismatch', async () => {
  const root = await makeRoot();
  const stager = new GeneratedPublicationStager(root);
  const input = await fixtureInput();
  await expect(
    stager.stage({ ...input, assets: input.assets.slice(1) }),
  ).rejects.toThrow('pre-copy bounds');
  await expect(
    stager.stage({ ...input, assets: [...input.assets, input.assets[0]!] }),
  ).rejects.toThrow();
  const badAsset = {
    ...input,
    assets: input.assets.map((asset, index) =>
      index ? asset : { ...asset, bytes: Buffer.from('corrupt') },
    ),
  };
  await expect(stager.stage(badAsset)).rejects.toThrow('descriptor mismatch');
  await expect(
    stager.stage({ ...input, expectedManifestSha256: '0'.repeat(64) }),
  ).rejects.toThrow('manifest hash mismatch');
  const wrongIndex = JSON.parse(input.indexJson.toString()) as ReleaseIndex;
  wrongIndex.releaseId = randomUUID();
  const indexJson = Buffer.from(canonicalJson(wrongIndex));
  await expect(
    stager.stage({
      ...input,
      indexJson,
      expectedIndexSha256: sha256(indexJson),
    }),
  ).rejects.toThrow('entry set');
});

it('never overwrites immutable package collisions and verifier detects post-stage corruption', async () => {
  const root = await makeRoot();
  const input = await fixtureInput();
  const stager = new GeneratedPublicationStager(root);
  const staged = await stager.stage(input);
  await expect(stager.stage(input)).resolves.toMatchObject({
    releaseId: staged.releaseId,
  });
  const assetPath = path.join(root, staged.packageKey, input.assets[0]!.path);
  await chmod(assetPath, 0o600);
  await writeFile(assetPath, Buffer.from('corruption'));
  await expect(
    verifyStagedGeneratedPublication(root, staged),
  ).rejects.toThrow();
  await expect(stager.stage(input)).rejects.toThrow();
});

it('propagates post-rename directory fsync failures and keeps the complete package invisible for retry', async () => {
  const root = await makeRoot();
  const input = await fixtureInput();
  const failing = new GeneratedPublicationStager(root, undefined, async () => {
    throw new Error('injected directory sync failure');
  });
  await expect(failing.stage(input)).rejects.toThrow('directory sync failure');
  const characterId = JSON.parse(input.manifestJson.toString())
    .characterId as string;
  const packagePath = path.join(root, `characters/${characterId}/v1`);
  await expect(readdir(packagePath)).resolves.toContain('character.json');
  await expect(readdir(path.join(root, 'releases'))).rejects.toMatchObject({
    code: 'ENOENT',
  });
  const retry = await new GeneratedPublicationStager(root).stage(input);
  await expect(
    verifyStagedGeneratedPublication(root, retry),
  ).resolves.toBeUndefined();
});

it('verifier rejects a corrupted staged release index', async () => {
  const root = await makeRoot();
  const input = await fixtureInput();
  const staged = await new GeneratedPublicationStager(root).stage(input);
  const indexPath = path.join(root, staged.indexPath);
  await chmod(indexPath, 0o600);
  await writeFile(indexPath, Buffer.from('{}'));
  await expect(
    verifyStagedGeneratedPublication(root, staged),
  ).rejects.toThrow();
});

it('retains completed package as an invisible orphan after index-install fault and cleans private temporary staging', async () => {
  const root = await makeRoot();
  const input = await fixtureInput();
  const stager = new GeneratedPublicationStager(root, (boundary) => {
    if (boundary === 'package-installed')
      throw new Error('injected index-stage fault');
  });
  await expect(stager.stage(input)).rejects.toThrow(
    'injected index-stage fault',
  );
  const pkg = `characters/${JSON.parse(input.manifestJson.toString()).characterId}/v1`;
  await expect(readdir(path.join(root, pkg))).resolves.toContain(
    'character.json',
  );
  const remainingStages = await readdir(path.join(root, '.staging/generated'));
  expect(
    remainingStages.some((name) => name.startsWith(`${input.publishJobId}-`)),
  ).toBe(false);
  await expect(readdir(path.join(root, 'releases'))).rejects.toMatchObject({
    code: 'ENOENT',
  });
});

it('uses the common maintenance exclusion marker and rejects symlinked staged roots', async () => {
  const root = await makeRoot();
  const input = await fixtureInput();
  await import('node:fs/promises').then(({ mkdir }) =>
    mkdir(path.join(root, '.maintenance')),
  );
  await expect(
    new GeneratedPublicationStager(root).stage(input),
  ).rejects.toThrow('maintenance');
  const other = await makeRoot();
  const link = path.join(other, 'linked');
  await import('node:fs/promises').then(({ symlink }) => symlink(root, link));
  await expect(
    new GeneratedPublicationStager(link).stage(input),
  ).rejects.toThrow();
});
