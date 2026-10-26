import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { cp, writeFile } from 'node:fs/promises';
import { canonicalJson, sha256 } from '@doodleforge/contracts';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  CharacterRepository,
  SnapshotRepository,
  ReleaseRepository,
  migrateDatabase,
  openDatabase,
  ReviewConflictError,
} from '@doodleforge/database';
import {
  ReviewService,
  PublicationService,
} from '@doodleforge/content-publisher';
import { CharacterService } from './characters.js';
import { ReviewActionService } from './review-actions.js';
import { POST as decide } from '../../routes/api/characters/[id]/versions/[versionId]/approvals/+server.js';
import { POST as publish } from '../../routes/api/characters/[id]/versions/[versionId]/publish/+server.js';
import { GET as preview } from '../../routes/api/characters/[id]/versions/[versionId]/assets/[assetId]/+server.js';

vi.mock('./runtime.js', () => ({ reviewActionService: () => service }));
let root: string;
let db: ReturnType<typeof openDatabase>;
let snapshots: SnapshotRepository;
let releases: ReleaseRepository;
let characters: CharacterService;
let reviews: ReviewService;
let service: ReviewActionService;
let input: {
  characterId: string;
  versionId: string;
  expectedManifestSha256: string;
  expectedDecisionOrder: number;
};
const fixtureRoot = fileURLToPath(
  new URL('../../../../../packages/contracts/fixtures/', import.meta.url),
);

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'doodle-review-'));
  migrateDatabase(join(root, 'test.sqlite'));
  db = openDatabase(join(root, 'test.sqlite'));
  snapshots = new SnapshotRepository(db);
  releases = new ReleaseRepository(db);
  characters = new CharacterService(new CharacterRepository(db), snapshots);
  reviews = new ReviewService(snapshots);
  const seed = await reviews.seedFixture('comet');
  input = {
    characterId: reviews.getSnapshot(seed.versionId).characterId,
    versionId: seed.versionId,
    expectedManifestSha256: seed.manifestSha256!,
    expectedDecisionOrder: 1,
  };
  service = new ReviewActionService(
    characters,
    snapshots,
    releases,
    join(root, 'published'),
    fixtureRoot,
  );
});
afterEach(() => {
  db.close();
  rmSync(root, { recursive: true, force: true });
});

function event(body: unknown, origin = 'http://localhost') {
  return {
    params: {
      id: input.characterId,
      versionId: input.versionId,
      assetId: 'idle_sheet',
    },
    request: new Request('http://localhost/action', {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  };
}
const body = () => ({
  expectedManifestSha256: input.expectedManifestSha256,
  expectedDecisionOrder: input.expectedDecisionOrder,
});

it('privately previews owned frozen fixture bytes without making a game release, rejects bad ownership and paths', async () => {
  const response = await preview(
    event(null) as unknown as Parameters<typeof preview>[0],
  );
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(response.headers.get('content-type')).toBe('image/png');
  expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
  expect(releases.state().activeReleaseId).toBeNull();
  await expect(
    service.preview(randomUUID(), input.versionId, 'idle_sheet'),
  ).rejects.toMatchObject({ status: 404 });
  await expect(
    service.preview(input.characterId, randomUUID(), 'idle_sheet'),
  ).rejects.toMatchObject({ status: 404 });
  await expect(
    service.preview(input.characterId, input.versionId, '../character.json'),
  ).rejects.toMatchObject({ status: 404 });
});

it('records review decisions with CAS, rejects unapproved publish, explicitly activates and idempotently republishes', async () => {
  const before = reviews.getSnapshot(input.versionId).manifestJson;
  expect(
    (
      await decide(
        event({ ...body(), decision: 'rejected' }) as unknown as Parameters<
          typeof decide
        >[0],
      )
    ).status,
  ).toBe(200);
  await expect(
    service.decide({ ...input, decision: 'approved' }),
  ).rejects.toMatchObject({ code: 'stale_review' });
  input.expectedDecisionOrder = 2;
  expect(
    (await publish(event(body()) as unknown as Parameters<typeof publish>[0]))
      .status,
  ).toBe(409);
  await service.decide({ ...input, decision: 'approved' });
  input.expectedDecisionOrder = 3;
  const result = await publish(
    event(body()) as unknown as Parameters<typeof publish>[0],
  );
  expect(result.status).toBe(200);
  const { releaseId } = await result.json();
  expect(releases.state().activeReleaseId).toBe(releaseId);
  expect(await service.publish(input)).toEqual({ releaseId });
  await service.decide({ ...input, decision: 'revoked' });
  input.expectedDecisionOrder = 4;
  await expect(service.publish(input)).rejects.toMatchObject({
    code: 'approval_required',
  });
  expect(releases.state().activeReleaseId).toBe(releaseId);
  expect(reviews.getSnapshot(input.versionId).manifestJson).toBe(before);
  expect(snapshots.history(input.characterId)[0]!.decisions).toHaveLength(4);
});

it.each(['', 'null', 'https://attacker.invalid'])(
  'rejects wrong or missing origin %s for both mutations',
  async (origin) => {
    for (const route of [decide, publish])
      expect(
        (
          await route(
            event({ ...body(), decision: 'approved' }, origin) as never,
          )
        ).status,
      ).toBe(403);
    expect(snapshots.latestDecision(input.versionId)!.decisionOrder).toBe(1);
    expect(releases.state().activeReleaseId).toBeNull();
  },
);

it('rejects stale hashes, tampered paths, unsupported decisions and invalid tokens without writes', async () => {
  for (const invalid of [
    { ...input, expectedManifestSha256: '0'.repeat(64), decision: 'approved' },
    { ...input, decision: 'approved', sourceDirectory: '/private' },
    { ...input, decision: 'script' },
    { ...input, decision: 'approved', expectedDecisionOrder: -1 },
  ])
    await expect(service.decide(invalid)).rejects.toBeDefined();
  expect(snapshots.latestDecision(input.versionId)!.decisionOrder).toBe(1);
});

it('uses cross-connection CAS and refuses archived review and private previews', async () => {
  const other = openDatabase(join(root, 'test.sqlite'));
  try {
    const rival = new ReviewService(new SnapshotRepository(other));
    rival.decide({
      versionId: input.versionId,
      expectedManifestSha256: input.expectedManifestSha256,
      expectedDecisionOrder: 1,
      decision: 'rejected',
      actorLabel: 'rival',
    });
    await expect(service.publish(input)).rejects.toMatchObject({
      code: 'stale_review',
    });
    await expect(
      service.decide({ ...input, decision: 'approved' }),
    ).rejects.toMatchObject({ code: 'stale_review' });
    characters.archive(input.characterId, { expectedRevision: 1 });
    await expect(
      service.preview(input.characterId, input.versionId, 'idle_sheet'),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      service.decide({ ...input, decision: 'approved' }),
    ).rejects.toMatchObject({ status: 404 });
  } finally {
    other.close();
  }
});

it('ignores sourceSnapshot paths and refuses unregistered unpublished packages', async () => {
  const manifest = JSON.parse(
    reviews.getSnapshot(input.versionId).manifestJson!,
  );
  manifest.characterId = randomUUID();
  snapshots.ensureFixtureIdentity({
    id: manifest.characterId,
    name: 'Unknown source',
    description: '',
    bodyType: 'humanoid',
  });
  const json = canonicalJson(manifest);
  const frozen = snapshots.freeze({
    characterId: manifest.characterId,
    version: 1,
    manifestJson: json,
    manifestSha256: sha256(json),
    sourceSnapshotJson: JSON.stringify({ directory: fixtureRoot }),
  });
  await expect(
    service.decide({
      characterId: manifest.characterId,
      versionId: frozen.id,
      expectedManifestSha256: sha256(json),
      expectedDecisionOrder: 0,
      decision: 'approved',
    }),
  ).rejects.toMatchObject({ code: 'source_unavailable' });
  expect(snapshots.latestDecision(frozen.id)).toBeUndefined();
});

it('sanitizes corrupt source errors and never approves or publishes damaged bytes', async () => {
  const copied = join(root, 'fixtures');
  await cp(join(fixtureRoot, 'comet'), join(copied, 'comet'), {
    recursive: true,
  });
  const manifest = JSON.parse(
    reviews.getSnapshot(input.versionId).manifestJson!,
  );
  await writeFile(
    join(copied, 'comet/v1', manifest.assets.idle_sheet.path),
    'corrupt',
  );
  service = new ReviewActionService(
    characters,
    snapshots,
    releases,
    join(root, 'published'),
    copied,
  );
  const response = await decide(
    event({ ...body(), decision: 'approved' }) as never,
  );
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({
    error: {
      code: 'studio_unavailable',
      message: 'Studio unavailable; try again later.',
    },
  });
  await expect(service.publish(input)).rejects.toThrow('corruption');
  expect(snapshots.latestDecision(input.versionId)!.decisionOrder).toBe(1);
  expect(releases.state().activeReleaseId).toBeNull();
});

it('refuses activation when the identity is archived during filesystem staging', async () => {
  const publisher = new PublicationService(
    reviews,
    releases,
    join(root, 'published'),
    (boundary) => {
      if (boundary === 'before-activation')
        characters.archive(input.characterId, { expectedRevision: 1 });
    },
  );
  await expect(
    publisher.publish({
      ...input,
      sourceDirectory: join(fixtureRoot, 'comet/v1'),
    }),
  ).rejects.toBeInstanceOf(ReviewConflictError);
  expect(releases.state().activeReleaseId).toBeNull();
});

it('inherits bounded JSON transport errors and refuses cross-owner version mutations', async () => {
  for (const handler of [decide, publish]) {
    const oversized = event(null);
    oversized.request = new Request(oversized.request.url, {
      method: 'POST',
      headers: {
        origin: 'http://localhost',
        'content-type': 'application/json',
      },
      body: 'x'.repeat(16_385),
    });
    expect((await handler(oversized as never)).status).toBe(413);
    const wrongType = event(body());
    wrongType.request.headers.set('content-type', 'text/plain');
    expect((await handler(wrongType as never)).status).toBe(415);
  }
  expect(
    (
      await decide(
        event({
          ...body(),
          decision: 'approved',
          characterId: input.characterId,
        }) as never,
      )
    ).status,
  ).toBe(400);
  const stranger = characters.create({
    name: 'Stranger',
    description: '',
    bodyType: 'other',
  });
  await expect(
    service.decide({
      ...input,
      characterId: stranger.id,
      decision: 'approved',
    }),
  ).rejects.toMatchObject({ status: 404 });
  await expect(
    service.publish({ ...input, characterId: stranger.id }),
  ).rejects.toMatchObject({ status: 404 });
});

it('rechecks decision order at activation, preserving the previous release', async () => {
  const publisher = new PublicationService(
    reviews,
    releases,
    join(root, 'published'),
    (boundary) => {
      if (boundary === 'before-activation')
        reviews.decide({
          versionId: input.versionId,
          expectedManifestSha256: input.expectedManifestSha256,
          decision: 'approved',
          actorLabel: 'newer-review',
        });
    },
  );
  await expect(
    publisher.publish({
      ...input,
      sourceDirectory: join(fixtureRoot, 'comet/v1'),
    }),
  ).rejects.toBeInstanceOf(ReviewConflictError);
  expect(releases.state().activeReleaseId).toBeNull();
});
