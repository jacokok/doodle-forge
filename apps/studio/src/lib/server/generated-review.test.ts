import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  CharacterRepository,
  SnapshotRepository,
  ReleaseRepository,
  WorkflowRepository,
  migrateDatabase,
  openDatabase,
} from '@doodleforge/database';
import {
  ArtifactStore,
  GeneratedReviewSources,
  generatedReviewSourceSchema,
} from '@doodleforge/workflow';
import { canonicalJson, sha256 } from '@doodleforge/contracts';
import { mockReviewFixture } from '../../../../../tools/content-cli/src/mock-review-fixture.js';
import { CharacterService } from './characters.js';
import { ReviewActionService } from './review-actions.js';
import { GET as preview } from '../../routes/api/characters/[id]/versions/[versionId]/assets/[assetId]/+server.js';

vi.mock('./runtime.js', () => ({ reviewActionService: () => service }));
let root: string;
let db: ReturnType<typeof openDatabase>;
let workflows: WorkflowRepository;
let snapshots: SnapshotRepository;
let characters: CharacterRepository;
let artifacts: ArtifactStore;
let service: ReviewActionService;
let fixture: Awaited<ReturnType<typeof mockReviewFixture>>;
beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'doodle-generated-review-'));
  migrateDatabase(join(root, 'queue.sqlite'));
  db = openDatabase(join(root, 'queue.sqlite'));
  fixture = await mockReviewFixture(db, root);
  workflows = new WorkflowRepository(db);
  snapshots = new SnapshotRepository(db);
  characters = new CharacterRepository(db);
  artifacts = new ArtifactStore(join(root, 'generated', 'attempts'));
  service = new ReviewActionService(
    new CharacterService(characters, snapshots),
    snapshots,
    new ReleaseRepository(db),
    join(root, 'published'),
    join(root, 'no-fixture-fallback'),
    new GeneratedReviewSources(workflows, snapshots, characters, artifacts),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  db.close();
  rmSync(root, { recursive: true, force: true });
});
function event(assetId = 'idle_sheet') {
  return {
    params: { id: fixture.characterId, versionId: fixture.versionId, assetId },
  } as unknown as Parameters<typeof preview>[0];
}
function source() {
  return generatedReviewSourceSchema.parse(
    JSON.parse(snapshots.get(fixture.versionId)!.sourceSnapshotJson),
  );
}

it('serves all five adopted generated sheets privately through the existing route, without decisions/releases', async () => {
  for (const [assetId, image] of Object.entries(source().assets)) {
    const response = await preview(event(assetId));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('cross-origin-resource-policy')).toBe(
      'same-origin',
    );
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(sha256(new Uint8Array(await response.arrayBuffer()))).toBe(
      image.sha256,
    );
  }
  const history = new CharacterService(characters, snapshots).history(
    fixture.characterId,
  )[0]!;
  expect(history.generatedPreviewOnly).toBe(true);
  expect(history.generatedReviewDecisionSupported).toBe(false);
  expect(snapshots.latestDecision(fixture.versionId)).toBeUndefined();
  expect(new ReleaseRepository(db).state().activeReleaseId).toBeNull();
  const snapshot = snapshots.get(fixture.versionId)!;
  await expect(
    service.publish({
      characterId: fixture.characterId,
      versionId: fixture.versionId,
      expectedManifestSha256: snapshot.manifestSha256,
      expectedDecisionOrder: 0,
    }),
  ).rejects.toMatchObject({ code: 'source_unavailable' });
});

function decision(
  order = 0,
  value: 'approved' | 'rejected' | 'revoked' = 'approved',
) {
  return {
    characterId: fixture.characterId,
    versionId: fixture.versionId,
    expectedManifestSha256: snapshots.get(fixture.versionId)!.manifestSha256!,
    expectedDecisionOrder: order,
    decision: value,
  };
}

it('validates every sheet before approval, keeps approved previews private, and never publishes', async () => {
  const spy = vi.spyOn(artifacts, 'read');
  await service.decide(decision());
  expect(spy).toHaveBeenCalledTimes(5);
  expect(workflows.job(fixture.jobId)!.status).toBe('waiting_publish');
  expect(
    new CharacterService(characters, snapshots)
      .history(fixture.characterId)
      .find((item) => item.id === fixture.versionId)
      ?.generatedReviewDecisionSupported,
  ).toBe(false);
  expect((await preview(event())).status).toBe(200);
  await expect(service.publish(decision(1))).rejects.toMatchObject({
    code: 'invalid_input',
  });
  const publish = {
    characterId: fixture.characterId,
    versionId: fixture.versionId,
    expectedManifestSha256: snapshots.get(fixture.versionId)!.manifestSha256!,
    expectedDecisionOrder: 1,
  };
  await expect(service.publish(publish)).rejects.toMatchObject({
    code: 'source_unavailable',
  });
  expect(new ReleaseRepository(db).state().activeReleaseId).toBeNull();
  await service.decide(decision(1, 'revoked'));
  expect(workflows.job(fixture.jobId)!.status).toBe('waiting_approval');
  expect(
    new CharacterService(characters, snapshots)
      .history(fixture.characterId)
      .find((item) => item.id === fixture.versionId)
      ?.generatedReviewDecisionSupported,
  ).toBe(false);
  expect((await preview(event())).status).toBe(200);
});

it('rejects corruption in a non-previewed sheet without appending a decision', async () => {
  const image = Object.values(source().assets)[4]!;
  const file = join(
    root,
    'generated',
    'attempts',
    image.stepId,
    image.attemptId,
    `${image.artifactId}.png`,
  );
  chmodSync(file, 0o600);
  writeFileSync(file, Buffer.alloc(image.bytes));
  await expect(service.decide(decision())).rejects.toMatchObject({
    code: 'source_unavailable',
  });
  expect(snapshots.latestDecision(fixture.versionId)).toBeUndefined();
  expect(workflows.job(fixture.jobId)!.status).toBe('waiting_approval');
});

it('rejects cancellation during validation without appending a decision', async () => {
  const original = artifacts.read.bind(artifacts);
  vi.spyOn(artifacts, 'read').mockImplementationOnce(async (ref) => {
    const bytes = await original(ref);
    workflows.cancel(fixture.jobId);
    return bytes;
  });
  await expect(service.decide(decision())).rejects.toMatchObject({
    code: 'source_unavailable',
  });
  expect(snapshots.latestDecision(fixture.versionId)).toBeUndefined();
});

it('rejects archival during decision validation', async () => {
  const original = artifacts.read.bind(artifacts);
  vi.spyOn(artifacts, 'read').mockImplementationOnce(async (ref) => {
    const bytes = await original(ref);
    const owner = characters.get(fixture.characterId)!;
    characters.archive(owner.id, owner.editRevision);
    return bytes;
  });
  await expect(service.decide(decision())).rejects.toMatchObject({
    status: 404,
  });
  expect(snapshots.latestDecision(fixture.versionId)).toBeUndefined();
});

it('rejects decision when a selected checkpoint is inconsistent', async () => {
  const registry = source();
  const original = workflows.step.bind(workflows);
  vi.spyOn(workflows, 'step').mockImplementation((id) => {
    const step = original(id);
    return step && id === registry.metadataStepId
      ? { ...step, outputJson: '{}' }
      : step;
  });
  await expect(service.decide(decision())).rejects.toMatchObject({
    code: 'source_unavailable',
  });
  expect(snapshots.latestDecision(fixture.versionId)).toBeUndefined();
});

it('denies approved private previews if the waiting job is cancelled', async () => {
  await service.decide(decision());
  workflows.cancel(fixture.jobId);
  expect((await preview(event())).status).toBe(409);
});

it('rejects a stale decision racing another decision during sheet reads', async () => {
  const original = artifacts.read.bind(artifacts);
  vi.spyOn(artifacts, 'read').mockImplementationOnce(async (ref) => {
    const bytes = await original(ref);
    workflows.recordGeneratedReviewDecision({
      ...decision(),
      actorLabel: 'other',
      note: '',
      expectedSourceSha256: sha256(
        snapshots.get(fixture.versionId)!.sourceSnapshotJson,
      ),
    });
    return bytes;
  });
  await expect(service.decide(decision())).rejects.toMatchObject({
    code: 'stale_review',
  });
  expect(snapshots.latestDecision(fixture.versionId)!.decision).toBe(
    'approved',
  );
});

it('denies missing/cross-owner/archived identities and unlisted/path/prototype asset keys', async () => {
  await expect(
    service.preview(randomUUID(), fixture.versionId, 'idle_sheet'),
  ).rejects.toMatchObject({ status: 404 });
  await expect(
    service.preview(fixture.characterId, randomUUID(), 'idle_sheet'),
  ).rejects.toMatchObject({ status: 404 });
  for (const key of ['../character.json', '__proto__', 'unknown'])
    expect((await preview(event(key))).status).toBe(404);
  const owner = characters.get(fixture.characterId)!;
  characters.archive(owner.id, owner.editRevision);
  expect((await preview(event())).status).toBe(404);
});

it('denies cancellation both before and during an otherwise valid artifact read', async () => {
  const original = artifacts.read.bind(artifacts);
  vi.spyOn(artifacts, 'read').mockImplementationOnce(async (ref) => {
    const bytes = await original(ref);
    workflows.cancel(fixture.jobId);
    return bytes;
  });
  expect((await preview(event())).status).toBe(409);
  expect((await preview(event())).status).toBe(409);
  expect(snapshots.latestDecision(fixture.versionId)).toBeUndefined();
});

it('rechecks owner archival after decoding', async () => {
  const original = artifacts.read.bind(artifacts);
  vi.spyOn(artifacts, 'read').mockImplementationOnce(async (ref) => {
    const bytes = await original(ref);
    const owner = characters.get(fixture.characterId)!;
    characters.archive(owner.id, owner.editRevision);
    return bytes;
  });
  expect((await preview(event())).status).toBe(404);
});

it('never treats a copied source JSON record in a different snapshot as authority', async () => {
  const original = snapshots.get(fixture.versionId)!;
  const manifest = JSON.parse(original.manifestJson!);
  manifest.characterVersion++;
  const forged = snapshots.freeze({
    characterId: original.characterId,
    version: manifest.characterVersion,
    manifestJson: canonicalJson(manifest),
    manifestSha256: sha256(canonicalJson(manifest)),
    sourceSnapshotJson: original.sourceSnapshotJson,
  });
  await expect(
    service.preview(fixture.characterId, forged.id, 'idle_sheet'),
  ).rejects.toMatchObject({ status: 409 });
});

it.each(['attempt', 'metadata', 'dependency'])(
  'rejects an inconsistent selected %s checkpoint',
  async (fault) => {
    const registry = source();
    const original = workflows.step.bind(workflows);
    vi.spyOn(workflows, 'step').mockImplementation((id) => {
      const step = original(id);
      if (!step) return step;
      if (fault === 'attempt' && id === registry.assets.idle_sheet!.stepId)
        return { ...step, leaseToken: step.leaseToken + 1 };
      if (fault === 'metadata' && id === registry.metadataStepId)
        return { ...step, outputJson: '{}' };
      if (fault === 'dependency' && id === registry.validationStepId)
        return { ...step, dependenciesJson: '[]' };
      return step;
    });
    expect((await preview(event())).status).toBe(409);
  },
);

it('returns sanitized failure rather than corrupt PNG bytes or internal paths', async () => {
  const image = source().assets.idle_sheet!;
  const file = join(
    root,
    'generated',
    'attempts',
    image.stepId,
    image.attemptId,
    `${image.artifactId}.png`,
  );
  chmodSync(file, 0o600);
  writeFileSync(file, Buffer.alloc(image.bytes));
  const response = await preview(event());
  expect(response.status).toBe(409);
  const body = await response.text();
  expect(body).toContain('source_unavailable');
  expect(body).not.toContain(root);
  expect(body).not.toContain(image.artifactId);
});
