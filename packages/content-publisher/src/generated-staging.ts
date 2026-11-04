import { constants } from 'node:fs';
import {
  lstat,
  mkdir,
  open,
  realpath,
  rename,
  rm,
  readdir,
} from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  canonicalJson,
  releaseIndexSchema,
  sha256,
  type CharacterManifest,
} from '@doodleforge/contracts';
import { withPublicationOperation } from './operations.js';
import { validateManifest } from './review.js';
import { validateReviewSheet } from './validation.js';

const manifestLimit = 1_048_576;
const indexLimit = 1_048_576;
const maxAssetBytes = 10 * 1024 * 1024;
const maxTotalAssetBytes = 50 * 1024 * 1024;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const generatedAnimations = [
  'idle',
  'walk',
  'attack_light',
  'hurt',
  'knockout',
] as const;

export type GeneratedPackageAssetInput = {
  path: string;
  bytes: Buffer;
  expectedSha256: string;
  expectedBytes: number;
  width: number;
  height: number;
};

/** DB identity remains distinct from the numeric version encoded by the contract. */
export type GeneratedReleaseEntry = {
  characterId: string;
  characterVersionId: string;
  characterVersion: number;
  manifestPath: string;
  manifestSha256: string;
};

export type StageGeneratedPublicationInput = {
  publishJobId: string;
  canonicalRequestHash: string;
  versionId: string;
  expectedManifestSha256: string;
  manifestJson: Buffer;
  assets: GeneratedPackageAssetInput[];
  releaseId: string;
  expectedPreviousReleaseId: string | null;
  expectedGeneration: number;
  entries: GeneratedReleaseEntry[];
  indexJson: Buffer;
  expectedIndexSha256: string;
};

export type StagedGeneratedPublication = {
  publishJobId: string;
  canonicalRequestHash: string;
  versionId: string;
  characterId: string;
  characterVersion: number;
  packageKey: string;
  manifestPath: string;
  manifestSha256: string;
  assets: Array<{ path: string; sha256: string; bytes: number }>;
  releaseId: string;
  expectedPreviousReleaseId: string | null;
  expectedGeneration: number;
  indexPath: string;
  indexSha256: string;
  indexJson: string;
  entries: GeneratedReleaseEntry[];
  staged: true;
};

type FrozenPackage = {
  manifest: CharacterManifest;
  manifestBytes: Buffer;
  assets: Array<{ path: string; bytes: Buffer; sha256: string }>;
};

function assertUuid(value: string, label: string) {
  if (!uuidPattern.test(value)) throw new Error(`Invalid ${label}`);
}

function safeRelativePath(value: string) {
  if (
    !value ||
    value.includes('\\') ||
    value.includes('\0') ||
    path.posix.isAbsolute(value) ||
    path.posix.normalize(value) !== value ||
    value.split('/').some((part) => !part || part === '.' || part === '..')
  )
    throw new Error('Unsafe package asset path');
  return value;
}

function preflightInputBounds(input: StageGeneratedPublicationInput) {
  if (
    !input ||
    typeof input !== 'object' ||
    !Buffer.isBuffer(input.manifestJson) ||
    input.manifestJson.length < 1 ||
    input.manifestJson.length > manifestLimit ||
    !Buffer.isBuffer(input.indexJson) ||
    input.indexJson.length < 1 ||
    input.indexJson.length > indexLimit ||
    !Array.isArray(input.assets) ||
    input.assets.length !== generatedAnimations.length ||
    !Array.isArray(input.entries) ||
    input.entries.length < 1 ||
    input.entries.length > 1000
  )
    throw new Error('Publication input exceeds pre-copy bounds');
  let totalBytes = 0;
  for (const asset of input.assets) {
    if (
      !asset ||
      typeof asset !== 'object' ||
      !Buffer.isBuffer(asset.bytes) ||
      asset.bytes.length < 1 ||
      asset.bytes.length > maxAssetBytes
    )
      throw new Error('Asset input exceeds pre-copy bounds');
    totalBytes += asset.bytes.length;
    if (totalBytes > maxTotalAssetBytes)
      throw new Error('Package assets exceed pre-copy size limit');
  }
}

function cloneInputs(
  input: StageGeneratedPublicationInput,
): StageGeneratedPublicationInput {
  // Copy every mutable byte buffer before the first asynchronous boundary.
  return {
    ...input,
    manifestJson: Buffer.from(input.manifestJson),
    indexJson: Buffer.from(input.indexJson),
    assets: input.assets.map((asset) => ({
      ...asset,
      bytes: Buffer.from(asset.bytes),
    })),
    entries: input.entries.map((entry) => ({ ...entry })),
  };
}

function parsePackage(input: StageGeneratedPublicationInput): FrozenPackage {
  assertUuid(input.publishJobId, 'publish job ID');
  assertUuid(input.versionId, 'database version ID');
  assertUuid(input.releaseId, 'release ID');
  if (input.expectedPreviousReleaseId !== null)
    assertUuid(input.expectedPreviousReleaseId, 'previous release ID');
  if (
    !/^[a-f0-9]{64}$/.test(input.canonicalRequestHash) ||
    !/^[a-f0-9]{64}$/.test(input.expectedManifestSha256) ||
    !/^[a-f0-9]{64}$/.test(input.expectedIndexSha256) ||
    !Number.isSafeInteger(input.expectedGeneration) ||
    input.expectedGeneration < 0
  )
    throw new Error('Invalid publication identity');
  if (!input.manifestJson.length || input.manifestJson.length > manifestLimit)
    throw new Error('Manifest exceeds size limit');
  if (!input.indexJson.length || input.indexJson.length > indexLimit)
    throw new Error('Release index exceeds size limit');
  if (sha256(input.manifestJson) !== input.expectedManifestSha256)
    throw new Error('Expected approved manifest hash mismatch');
  const manifest = validateManifest(
    JSON.parse(input.manifestJson.toString('utf8')),
  );
  if (!Buffer.from(canonicalJson(manifest)).equals(input.manifestJson))
    throw new Error('Manifest bytes are not canonical');
  if (sha256(input.indexJson) !== input.expectedIndexSha256)
    throw new Error('Release index hash mismatch');
  const index = releaseIndexSchema.parse(
    JSON.parse(input.indexJson.toString('utf8')),
  );
  if (!Buffer.from(canonicalJson(index)).equals(input.indexJson))
    throw new Error('Release index bytes are not canonical');
  if (
    manifest.characterVersion < 1 ||
    input.entries.length < 1 ||
    input.entries.length > 1000
  )
    throw new Error('Invalid release entry set');
  const manifestPath = `characters/${manifest.characterId}/v${manifest.characterVersion}/character.json`;
  const entryByCharacter = new Map<string, GeneratedReleaseEntry>();
  for (const entry of input.entries) {
    assertUuid(entry.characterId, 'entry character ID');
    assertUuid(entry.characterVersionId, 'entry database version ID');
    if (
      !Number.isSafeInteger(entry.characterVersion) ||
      entry.characterVersion < 1 ||
      !/^[a-f0-9]{64}$/.test(entry.manifestSha256) ||
      entryByCharacter.has(entry.characterId)
    )
      throw new Error('Invalid or duplicate release entry');
    entryByCharacter.set(entry.characterId, entry);
  }
  const targetEntry = entryByCharacter.get(manifest.characterId);
  if (
    !targetEntry ||
    targetEntry.characterVersionId !== input.versionId ||
    targetEntry.characterVersion !== manifest.characterVersion ||
    targetEntry.manifestPath !== manifestPath ||
    targetEntry.manifestSha256 !== input.expectedManifestSha256
  )
    throw new Error('Selected generated revision missing from release entries');
  const expectedCharacters = input.entries
    .map((entry) => ({
      characterId: entry.characterId,
      characterVersion: entry.characterVersion,
      manifestPath: entry.manifestPath,
      manifestSha256: entry.manifestSha256,
    }))
    .sort((a, b) => a.characterId.localeCompare(b.characterId));
  if (
    index.releaseId !== input.releaseId ||
    JSON.stringify(index.characters) !== JSON.stringify(expectedCharacters)
  )
    throw new Error('Release index does not match complete entry set');
  assertFiveSheetManifest(manifest);
  if (input.assets.length !== Object.keys(manifest.assets).length)
    throw new Error('Asset inputs do not match frozen manifest');
  const byPath = new Map<string, GeneratedPackageAssetInput>();
  for (const asset of input.assets) {
    const assetPath = safeRelativePath(asset.path);
    if (byPath.has(assetPath)) throw new Error('Duplicate asset input path');
    byPath.set(assetPath, asset);
  }
  const assets: FrozenPackage['assets'] = [];
  const manifestPaths = new Set<string>();
  let total = 0;
  for (const asset of Object.values(manifest.assets)) {
    const assetPath = safeRelativePath(asset.path);
    if (manifestPaths.has(assetPath))
      throw new Error('Duplicate frozen manifest asset path');
    manifestPaths.add(assetPath);
    const supplied = byPath.get(assetPath);
    if (!supplied) throw new Error('Frozen manifest asset is missing');
    if (
      supplied.expectedSha256 !== asset.sha256 ||
      supplied.expectedBytes !== asset.bytes ||
      supplied.width !== asset.width ||
      supplied.height !== asset.height ||
      supplied.bytes.length !== asset.bytes ||
      supplied.bytes.length > maxAssetBytes ||
      sha256(supplied.bytes) !== asset.sha256
    )
      throw new Error('Frozen manifest asset bytes or descriptor mismatch');
    total += supplied.bytes.length;
    if (total > maxTotalAssetBytes)
      throw new Error('Package assets exceed size limit');
    assets.push({
      path: assetPath,
      bytes: Buffer.from(supplied.bytes),
      sha256: asset.sha256,
    });
    byPath.delete(assetPath);
  }
  if (byPath.size) throw new Error('Unexpected package asset input');
  return { manifest, manifestBytes: Buffer.from(input.manifestJson), assets };
}

async function ensureDirectory(root: string, relative: string) {
  let current = root;
  for (const part of relative.split('/').filter(Boolean)) {
    current = path.join(current, part);
    let created = false;
    await mkdir(current, { mode: 0o700 }).then(
      () => {
        created = true;
      },
      (error: NodeJS.ErrnoException) => {
        if (error.code !== 'EEXIST') throw error;
      },
    );
    if (created) await syncDirectory(path.dirname(current));
    const stat = await lstat(current);
    if (!stat.isDirectory() || (await realpath(current)) !== current)
      throw new Error('Unsafe publication directory');
  }
  return current;
}

async function syncDirectory(directory: string) {
  const handle = await open(
    directory,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  );
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function writeDurable(filename: string, bytes: Buffer) {
  const handle = await open(
    filename,
    constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_EXCL |
      constants.O_NOFOLLOW,
    0o400,
  );
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await syncDirectory(path.dirname(filename));
}

async function readExactFile(filename: string, bytes: Buffer) {
  const handle = await open(
    filename,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size !== bytes.length)
      throw new Error('Staged file size mismatch');
    const actual = Buffer.alloc(bytes.length + 1);
    let offset = 0;
    while (offset < actual.length) {
      const result = await handle.read(
        actual,
        offset,
        actual.length - offset,
        null,
      );
      if (!result.bytesRead) break;
      offset += result.bytesRead;
    }
    if (offset !== bytes.length || !actual.subarray(0, offset).equals(bytes))
      throw new Error('Staged file content mismatch');
  } finally {
    await handle.close();
  }
}

async function installCompleteDirectory(
  stage: string,
  destination: string,
  parent: string,
  expectedFiles: Map<string, Buffer>,
  sync: (directory: string) => Promise<void> = syncDirectory,
) {
  try {
    await rename(stage, destination);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'EEXIST' && code !== 'ENOTEMPTY') throw error;
    await verifyDirectory(destination, expectedFiles);
    await sync(destination);
    await sync(parent);
    return;
  }
  // Do not convert a post-install durability failure into success. The complete
  // directory stays invisible as an orphan and the caller may retry/reconcile.
  await sync(parent);
}

async function verifyDirectory(directory: string, files: Map<string, Buffer>) {
  if (
    (await realpath(directory)) !== directory ||
    !(await lstat(directory)).isDirectory()
  )
    throw new Error('Unsafe staged package directory');
  const found: string[] = [];
  const visit = async (current: string, prefix: string) => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const filename = path.join(current, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Symlink in staged package');
      if (entry.isDirectory()) await visit(filename, relative);
      else if (entry.isFile()) found.push(relative);
      else throw new Error('Non-regular staged package entry');
    }
  };
  await visit(directory, '');
  if (found.length !== files.size || found.some((file) => !files.has(file)))
    throw new Error('Staged package membership mismatch');
  for (const [relative, bytes] of files)
    await readExactFile(path.join(directory, relative), bytes);
}

function expectedFiles(pkg: FrozenPackage) {
  const files = new Map<string, Buffer>([
    ['character.json', pkg.manifestBytes],
  ]);
  for (const asset of pkg.assets) files.set(asset.path, asset.bytes);
  return files;
}

function resultFrom(
  input: StageGeneratedPublicationInput,
  pkg: FrozenPackage,
): StagedGeneratedPublication {
  const manifestPath = `characters/${pkg.manifest.characterId}/v${pkg.manifest.characterVersion}/character.json`;
  return {
    publishJobId: input.publishJobId,
    canonicalRequestHash: input.canonicalRequestHash,
    versionId: input.versionId,
    characterId: pkg.manifest.characterId,
    characterVersion: pkg.manifest.characterVersion,
    packageKey: path.posix.dirname(manifestPath),
    manifestPath,
    manifestSha256: input.expectedManifestSha256,
    assets: pkg.assets.map(({ path: assetPath, bytes, sha256: hash }) => ({
      path: assetPath,
      sha256: hash,
      bytes: bytes.length,
    })),
    releaseId: input.releaseId,
    expectedPreviousReleaseId: input.expectedPreviousReleaseId,
    expectedGeneration: input.expectedGeneration,
    indexPath: `releases/${input.releaseId}/index.json`,
    indexSha256: input.expectedIndexSha256,
    indexJson: input.indexJson.toString('utf8'),
    entries: input.entries.map((entry) => ({ ...entry })),
    staged: true,
  };
}

export type GeneratedStagingBoundary = 'package-installed' | 'index-installed';
type FaultHook = (boundary: GeneratedStagingBoundary) => void | Promise<void>;
type DirectorySync = (directory: string) => Promise<void>;

export class GeneratedPublicationStager {
  constructor(
    private readonly root: string,
    private readonly hook: FaultHook = () => {},
    private readonly syncInstalledDirectory: DirectorySync = syncDirectory,
  ) {}

  async stage(
    input: StageGeneratedPublicationInput,
  ): Promise<StagedGeneratedPublication> {
    preflightInputBounds(input);
    const copied = cloneInputs(input);
    const pkg = parsePackage(copied);
    return await withPublicationOperation(this.root, false, () =>
      this.stageCopied(copied, pkg),
    );
  }

  private async stageCopied(
    input: StageGeneratedPublicationInput,
    pkg: FrozenPackage,
  ) {
    await mkdir(this.root, { recursive: true });
    const root = path.resolve(this.root);
    if ((await realpath(root)) !== root || !(await lstat(root)).isDirectory())
      throw new Error('Unsafe publication root');
    const stageBase = await ensureDirectory(root, '.staging/generated');
    const nonce = randomUUID();
    const work = await ensureDirectory(
      stageBase,
      `${input.publishJobId}-${nonce}`,
    );
    const packageStage = path.join(work, 'package');
    const indexStage = path.join(work, 'release');
    const files = expectedFiles(pkg);
    try {
      await mkdir(packageStage, { mode: 0o700 });
      await mkdir(indexStage, { mode: 0o700 });
      for (const [relative, bytes] of files) {
        safeRelativePath(relative);
        const parent = path.dirname(path.join(packageStage, relative));
        await mkdir(parent, { recursive: true, mode: 0o700 });
        await writeDurable(path.join(packageStage, relative), bytes);
      }
      await verifyReviewSheets(pkg);
      await syncDirectory(packageStage);
      const indexBytes = Buffer.from(input.indexJson);
      await writeDurable(path.join(indexStage, 'index.json'), indexBytes);
      await syncDirectory(indexStage);
      const packageKey = `characters/${pkg.manifest.characterId}/v${pkg.manifest.characterVersion}`;
      const packageDestination = path.join(root, packageKey);
      const packageParent = await ensureDirectory(
        root,
        path.posix.dirname(packageKey),
      );
      if (await pathExists(packageDestination))
        await verifyDirectory(packageDestination, files);
      else
        await installCompleteDirectory(
          packageStage,
          packageDestination,
          packageParent,
          files,
          this.syncInstalledDirectory,
        );
      await this.hook('package-installed');
      const releaseRelative = `releases/${input.releaseId}`;
      const releaseParent = await ensureDirectory(root, 'releases');
      const releaseDestination = path.join(root, releaseRelative);
      const indexFiles = new Map([['index.json', input.indexJson]]);
      if (await pathExists(releaseDestination))
        await verifyDirectory(releaseDestination, indexFiles);
      else
        await installCompleteDirectory(
          indexStage,
          releaseDestination,
          releaseParent,
          indexFiles,
          this.syncInstalledDirectory,
        );
      await this.hook('index-installed');
      return resultFrom(input, pkg);
    } finally {
      await rm(work, { recursive: true, force: true });
      await syncDirectory(stageBase);
    }
  }

  async verify(input: StagedGeneratedPublication) {
    await withPublicationOperation(this.root, false, async () => {
      const result = validateStagedPublication(input);
      const manifestPath = `characters/${result.characterId}/v${result.characterVersion}/character.json`;
      const indexPath = `releases/${result.releaseId}/index.json`;
      if (
        result.manifestPath !== manifestPath ||
        result.indexPath !== indexPath
      )
        throw new Error('Staged paths do not match canonical identity');
      const root = path.resolve(this.root);
      if ((await realpath(root)) !== root)
        throw new Error('Unsafe publication root');
      const manifestBytes = await readBounded(
        path.join(root, manifestPath),
        manifestLimit,
      );
      if (sha256(manifestBytes) !== result.manifestSha256)
        throw new Error('Staged manifest hash mismatch');
      const manifest = validateManifest(
        JSON.parse(manifestBytes.toString('utf8')),
      );
      if (
        manifest.characterId !== result.characterId ||
        manifest.characterVersion !== result.characterVersion
      )
        throw new Error('Staged manifest identity mismatch');
      assertFiveSheetManifest(manifest);
      const packageKey = `characters/${result.characterId}/v${result.characterVersion}`;
      if (result.packageKey !== packageKey)
        throw new Error('Staged package key mismatch');
      const expected = new Map<string, Buffer>([
        ['character.json', manifestBytes],
      ]);
      const supplied = new Map(
        result.assets.map((asset) => [safeRelativePath(asset.path), asset]),
      );
      if (
        supplied.size !== result.assets.length ||
        supplied.size !== Object.keys(manifest.assets).length
      )
        throw new Error('Staged asset set mismatch');
      for (const asset of Object.values(manifest.assets)) {
        const staged = supplied.get(safeRelativePath(asset.path));
        if (
          !staged ||
          staged.sha256 !== asset.sha256 ||
          staged.bytes !== asset.bytes
        )
          throw new Error('Staged asset descriptor mismatch');
        const bytes = await readBounded(
          path.join(root, packageKey, asset.path),
          maxAssetBytes,
        );
        if (bytes.length !== asset.bytes || sha256(bytes) !== asset.sha256)
          throw new Error('Staged asset bytes mismatch');
        expected.set(asset.path, bytes);
      }
      for (const name of generatedAnimations) {
        const animation = manifest.animations[name];
        const asset = animation && manifest.assets[animation.assetId];
        if (!animation || !asset)
          throw new Error('Generated animation asset missing');
        await validateReviewSheet(expected.get(asset.path)!, asset, animation);
      }
      for (const entry of result.entries) {
        assertUuid(entry.characterId, 'entry character ID');
        assertUuid(entry.characterVersionId, 'entry database version ID');
        if (
          entry.manifestPath !==
          `characters/${entry.characterId}/v${entry.characterVersion}/character.json`
        )
          throw new Error('Noncanonical release manifest path');
      }
      const selected = result.entries.find(
        (entry) => entry.characterId === result.characterId,
      );
      if (
        !selected ||
        selected.characterVersionId !== result.versionId ||
        selected.characterVersion !== result.characterVersion ||
        selected.manifestSha256 !== result.manifestSha256 ||
        selected.manifestPath !== manifestPath
      )
        throw new Error('Staged selected entry mismatch');
      await verifyDirectory(path.join(root, packageKey), expected);
      const indexBytes = await readBounded(
        path.join(root, indexPath),
        indexLimit,
      );
      if (sha256(indexBytes) !== result.indexSha256)
        throw new Error('Staged release index hash mismatch');
      const index = releaseIndexSchema.parse(
        JSON.parse(indexBytes.toString('utf8')),
      );
      if (
        !Buffer.from(canonicalJson(index)).equals(indexBytes) ||
        !Buffer.from(result.indexJson, 'utf8').equals(indexBytes) ||
        index.releaseId !== result.releaseId
      )
        throw new Error('Staged release index mismatch');
      if (
        JSON.stringify(index.characters) !==
        JSON.stringify(
          result.entries
            .map((entry) => ({
              characterId: entry.characterId,
              characterVersion: entry.characterVersion,
              manifestPath: entry.manifestPath,
              manifestSha256: entry.manifestSha256,
            }))
            .sort((a, b) => a.characterId.localeCompare(b.characterId)),
        )
      )
        throw new Error('Staged release entries mismatch');
      await verifyDirectory(
        path.join(root, `releases/${result.releaseId}`),
        new Map([['index.json', indexBytes]]),
      );
    });
  }
}

/** Re-reads staged immutable files immediately before a caller's fenced DB activation. */
export function verifyStagedGeneratedPublication(
  root: string,
  input: StagedGeneratedPublication,
) {
  return new GeneratedPublicationStager(root).verify(input);
}

function assertFiveSheetManifest(manifest: CharacterManifest) {
  if (
    Object.keys(manifest.animations).length !== generatedAnimations.length ||
    Object.keys(manifest.assets).length !== generatedAnimations.length ||
    generatedAnimations.some((name) => !manifest.animations[name])
  )
    throw new Error('Generated package must contain exactly five animations');
  const referenced = generatedAnimations.map(
    (name) => manifest.animations[name]!.assetId,
  );
  if (
    new Set(referenced).size !== generatedAnimations.length ||
    referenced.some((assetId) => !manifest.assets[assetId]) ||
    Object.keys(manifest.assets).some(
      (assetId) => !referenced.includes(assetId),
    )
  )
    throw new Error('Generated animations must bind five distinct assets');
}

async function verifyReviewSheets(pkg: FrozenPackage) {
  const paths = new Map(pkg.assets.map((asset) => [asset.path, asset.bytes]));
  for (const name of generatedAnimations) {
    const animation = pkg.manifest.animations[name];
    if (!animation) throw new Error('Required generated animation missing');
    const asset = pkg.manifest.assets[animation.assetId];
    const bytes = asset && paths.get(asset.path);
    if (!asset || !bytes) throw new Error('Generated animation asset missing');
    await validateReviewSheet(bytes, asset, animation);
  }
}

async function readBounded(filename: string, limit: number) {
  const handle = await open(
    filename,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > limit)
      throw new Error('Staged file exceeds bounds');
    const data = Buffer.alloc(stat.size + 1);
    let length = 0;
    while (length < data.length) {
      const read = await handle.read(data, length, data.length - length, null);
      if (!read.bytesRead) break;
      length += read.bytesRead;
    }
    if (length !== stat.size) throw new Error('Staged file size changed');
    return data.subarray(0, length);
  } finally {
    await handle.close();
  }
}

async function pathExists(target: string) {
  try {
    await lstat(target);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

function validateStagedPublication(
  input: StagedGeneratedPublication,
): StagedGeneratedPublication {
  if (!input || typeof input !== 'object' || input.staged !== true)
    throw new Error('Invalid staged publication evidence');
  assertUuid(input.publishJobId, 'publish job ID');
  assertUuid(input.versionId, 'database version ID');
  assertUuid(input.characterId, 'character ID');
  assertUuid(input.releaseId, 'release ID');
  if (input.expectedPreviousReleaseId !== null)
    assertUuid(input.expectedPreviousReleaseId, 'previous release ID');
  if (
    !/^[a-f0-9]{64}$/.test(input.canonicalRequestHash) ||
    !/^[a-f0-9]{64}$/.test(input.manifestSha256) ||
    !/^[a-f0-9]{64}$/.test(input.indexSha256) ||
    typeof input.indexJson !== 'string' ||
    Buffer.byteLength(input.indexJson) > indexLimit ||
    !Number.isSafeInteger(input.expectedGeneration) ||
    input.expectedGeneration < 0 ||
    !Number.isSafeInteger(input.characterVersion) ||
    input.characterVersion < 1 ||
    !Array.isArray(input.assets) ||
    input.assets.length > 128 ||
    !Array.isArray(input.entries) ||
    input.entries.length < 1 ||
    input.entries.length > 1000 ||
    input.assets.reduce((sum, asset) => sum + asset.bytes, 0) >
      maxTotalAssetBytes
  )
    throw new Error('Invalid staged publication evidence');
  for (const asset of input.assets) {
    safeRelativePath(asset.path);
    if (
      !/^[a-f0-9]{64}$/.test(asset.sha256) ||
      !Number.isSafeInteger(asset.bytes) ||
      asset.bytes < 1 ||
      asset.bytes > maxAssetBytes
    )
      throw new Error('Invalid staged asset evidence');
  }
  for (const entry of input.entries) {
    assertUuid(entry.characterId, 'entry character ID');
    assertUuid(entry.characterVersionId, 'entry database version ID');
    if (
      !Number.isSafeInteger(entry.characterVersion) ||
      entry.characterVersion < 1 ||
      !/^[a-f0-9]{64}$/.test(entry.manifestSha256) ||
      typeof entry.manifestPath !== 'string'
    )
      throw new Error('Invalid staged release entry');
  }
  return input;
}
