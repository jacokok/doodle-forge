import { randomUUID } from 'node:crypto';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  CharacterRepository,
  migrateDatabase,
  openDatabase,
  WorkflowRepository,
} from '@doodleforge/database';
import {
  canonicalJson,
  sha256,
  type CharacterManifest,
} from '@doodleforge/contracts';
import {
  ArtifactStore,
  enqueueWorkflow,
  executeStage,
  manifestStage,
  manifestOutputSchema,
} from './index.js';

const branches = ['idle', 'walk', 'attack', 'hurt', 'ko'] as const;
const names = ['idle', 'walk', 'attack_light', 'hurt', 'knockout'] as const;
const fixture = JSON.parse(
  readFileSync(
    new URL(
      '../../contracts/fixtures/sprout/v1/character.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as CharacterManifest;
let root: string;
let connection: ReturnType<typeof openDatabase>;
let repo: WorkflowRepository;
let store: ArtifactStore;
let now: number;
const signal = () => new AbortController().signal;
function reopen() {
  connection.close();
  connection = openDatabase(join(root, 'queue.sqlite'));
  repo = new WorkflowRepository(connection, () => now);
  store = new ArtifactStore(join(root, 'artifacts'));
}
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'manifest-integration-'));
  mkdirSync(join(root, 'artifacts'));
  migrateDatabase(join(root, 'queue.sqlite'));
  connection = openDatabase(join(root, 'queue.sqlite'));
  now = 1000;
  repo = new WorkflowRepository(connection, () => now);
  store = new ArtifactStore(join(root, 'artifacts'));
});
afterEach(() => {
  vi.restoreAllMocks();
  connection.close();
  rmSync(root, { recursive: true, force: true });
});
async function prepare() {
  const characterId = new CharacterRepository(connection).create({
    name: 'Manifest',
    description: '',
    bodyType: 'humanoid',
    fightingStyle: 'unselected',
    specialPower: 'none',
  }).id;
  const {
    name,
    description,
    bodyType,
    artStyle,
    stats,
    facing,
    anchors,
    attacks,
    hitboxes,
    hurtboxes,
    abilities,
    effects,
  } = fixture;
  const envelope = {
    schemaVersion: 1,
    characterId,
    characterVersion: 1,
    sourceSnapshotHash: 'b'.repeat(64),
    inputs: {},
    parameters: {},
  };
  const jobId = enqueueWorkflow(repo, {
    schemaVersion: 1,
    characterId,
    characterVersionId: null,
    kind: 'generate',
    idempotencyKey: randomUUID(),
    steps: [
      ...branches.map((branch) => ({
        key: branch,
        stageKey: 'pack-sheet',
        stageVersion: '1',
        targetKey: branch,
        dependencies: [] as string[],
        input: envelope,
      })),
      {
        key: 'manifest',
        stageKey: 'assemble-manifest',
        stageVersion: '1',
        targetKey: '',
        dependencies: [...branches],
        input: {
          ...envelope,
          inputs: {
            character: { name, description, bodyType, artStyle },
            gameplay: {
              stats,
              facing,
              anchors,
              attacks,
              hitboxes,
              hurtboxes,
              abilities,
              effects,
            },
            timing: Object.fromEntries(
              branches.map((b, i) => [
                b,
                {
                  fps: fixture.animations[names[i]!]!.fps,
                  loop: fixture.animations[names[i]!]!.loop,
                },
              ]),
            ),
          },
          parameters: { style: artStyle },
        },
      },
    ],
  });
  const sheets = [];
  for (let i = 0; i < branches.length; i++) {
    const work = repo.claim('sheet')!;
    const index = branches.indexOf(
      work.step.targetKey as (typeof branches)[number],
    );
    expect(index).toBeGreaterThanOrEqual(0);
    const anim = fixture.animations[names[index]!]!;
    const asset = fixture.assets[anim.assetId]!;
    const bytes = readFileSync(
      new URL(
        `../../contracts/fixtures/sprout/v1/${asset.path}`,
        import.meta.url,
      ),
    );
    const image = await store.putPng(work.claim, bytes, signal());
    const output = {
      animation: branches[index],
      image,
      sourceSha256s: Array(anim.frameCount).fill(image.sha256),
      frameWidth: anim.frameWidth,
      frameHeight: anim.frameHeight,
      frameCount: anim.frameCount,
      columns: anim.columns,
      footAnchor: anim.footAnchor,
      style: artStyle,
      resolvedInputHash: 'a'.repeat(64),
    };
    const outputJson = canonicalJson(output);
    expect(repo.complete(work.claim, outputJson)).toBe(true);
    sheets.push({
      branch: branches[index],
      stepId: work.step.id,
      attemptId: work.claim.attemptId,
      outputHash: sha256(outputJson),
      artifactId: image.artifactId,
      sha256: image.sha256,
      image,
    });
  }
  reopen();
  return { jobId, sheets, work: repo.claim('manifest')! };
}

it('adopts a manifest from five selected SQLite checkpoints across restart', async () => {
  const { jobId, sheets, work } = await prepare();
  expect(work.step.stageKey).toBe('assemble-manifest');
  expect(
    await executeStage(repo, work, manifestStage(), signal(), undefined, store),
  ).toBe(true);
  reopen();
  const output = manifestOutputSchema.parse(
    JSON.parse(repo.step(work.step.id)!.outputJson!),
  );
  expect(output.sha256).toBe(sha256(canonicalJson(output.manifest)));
  expect(output.sheets).toEqual(
    branches.map((branch) => {
      const sheet = sheets.find((s) => s.branch === branch)!;
      return {
        branch: sheet.branch,
        stepId: sheet.stepId,
        attemptId: sheet.attemptId,
        outputHash: sheet.outputHash,
        artifactId: sheet.artifactId,
        sha256: sheet.sha256,
      };
    }),
  );
  expect(repo.job(jobId)?.status).toBe('running');
  for (const table of ['character_versions', 'approvals', 'content_releases'])
    expect(
      connection.sqlite.prepare(`SELECT count(*) n FROM ${table}`).get(),
    ).toEqual({ n: 0 });
});

it('does not checkpoint when the lease expires before adoption', async () => {
  const { work } = await prepare();
  const stage = manifestStage();
  const expiring = {
    ...stage,
    async execute(...args: Parameters<typeof stage.execute>) {
      const output = await stage.execute(...args);
      now += 60_000;
      repo.recoverExpired();
      return output;
    },
  };
  expect(
    await executeStage(repo, work, expiring, signal(), undefined, store),
  ).toBe(false);
  expect(repo.step(work.step.id)!.outputJson).toBeNull();
  reopen();
  now += 2000;
  const replacement = repo.claim('replacement')!;
  expect(replacement.step.id).toBe(work.step.id);
  expect(
    await executeStage(repo, replacement, stage, signal(), undefined, store),
  ).toBe(true);
  expect(
    manifestOutputSchema.safeParse(
      JSON.parse(repo.step(work.step.id)!.outputJson!),
    ).success,
  ).toBe(true);
});

it('rejects a corrupted selected sheet without a manifest checkpoint', async () => {
  const { work, sheets } = await prepare();
  const image = sheets[2]!.image;
  const file = join(
    root,
    'artifacts',
    image.stepId,
    image.attemptId,
    `${image.artifactId}.png`,
  );
  chmodSync(file, 0o600);
  writeFileSync(file, Buffer.alloc(image.bytes));
  await expect(
    executeStage(repo, work, manifestStage(), signal(), undefined, store),
  ).rejects.toThrow('Artifact hash mismatch');
  expect(repo.step(work.step.id)!.outputJson).toBeNull();
});
