import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  PublicationService,
  ReviewService,
} from '@doodleforge/content-publisher';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  CharacterRepository,
  SnapshotRepository,
  ReleaseRepository,
  migrateDatabase,
  openDatabase,
} from '@doodleforge/database';
import { CharacterService } from './characters.js';
import { characterResponse } from './character-response.js';
import { GET as list, POST } from '../../routes/api/characters/+server.js';
import {
  GET,
  PATCH,
  DELETE,
} from '../../routes/api/characters/[id]/+server.js';

vi.mock('./runtime.js', () => ({ characterService: () => service }));
let root: string;
let db: ReturnType<typeof openDatabase>;
let service: CharacterService;
const metadata = {
  name: '  Pencil hero  ',
  description: '  A drawing  ',
  bodyType: 'floating',
};
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'doodle-authoring-'));
  const filename = join(root, 'test.sqlite');
  migrateDatabase(filename);
  db = openDatabase(filename);
  service = new CharacterService(new CharacterRepository(db));
});
afterEach(() => {
  db.close();
  rmSync(root, { recursive: true, force: true });
});

function event(
  method = 'GET',
  input?: unknown,
  id: string = randomUUID(),
  headers: Record<string, string> = {},
) {
  return {
    params: { id },
    request: new Request(`http://localhost/api/characters/${id}`, {
      method,
      headers: {
        origin: 'http://localhost',
        'content-type': 'application/json',
        ...headers,
      },
      ...(input === undefined ? {} : { body: JSON.stringify(input) }),
    }),
  };
}
const create = (input: unknown = metadata) =>
  POST(event('POST', input) as unknown as Parameters<typeof POST>[0]);
const patch = (id: string, input: unknown) =>
  PATCH(event('PATCH', input, id) as Parameters<typeof PATCH>[0]);
const remove = (id: string, revision: number) =>
  DELETE(
    event('DELETE', { expectedRevision: revision }, id) as Parameters<
      typeof DELETE
    >[0],
  );
const get = (id: string) =>
  GET(event('GET', undefined, id) as Parameters<typeof GET>[0]);

it('creates, lists, reads, edits and archives real persisted identities without generating versions', async () => {
  const response = await create();
  expect(response.status).toBe(201);
  const character = await response.json();
  expect(character).toMatchObject({
    name: 'Pencil hero',
    description: 'A drawing',
    bodyType: 'floating',
    editRevision: 1,
    fightingStyle: 'unselected',
    specialPower: 'none',
  });
  expect((await (await get(character.id)).json()).id).toBe(character.id);
  const updated = await patch(character.id, {
    expectedRevision: 1,
    name: '<b>Ink</b>',
    description: '',
    bodyType: 'other',
  });
  expect(updated.status).toBe(200);
  expect(await updated.json()).toMatchObject({
    name: '<b>Ink</b>',
    description: '',
    bodyType: 'other',
    editRevision: 2,
  });
  expect(
    (await (await list({} as Parameters<typeof list>[0])).json()).characters,
  ).toHaveLength(1);
  expect((await remove(character.id, 2)).status).toBe(204);
  expect((await get(character.id)).status).toBe(404);
  expect(
    (await patch(character.id, { expectedRevision: 3, name: 'Gone' })).status,
  ).toBe(404);
  expect((await remove(character.id, 3)).status).toBe(404);
  expect(
    (await (await list({} as Parameters<typeof list>[0])).json()).characters,
  ).toEqual([]);
  expect(
    db.sqlite
      .prepare('SELECT edit_revision, archived_at FROM characters WHERE id = ?')
      .get(character.id),
  ).toMatchObject({ edit_revision: 3, archived_at: expect.any(Number) });
  for (const table of ['character_versions', 'approvals', 'content_releases']) {
    expect(
      db.sqlite.prepare(`SELECT count(*) AS count FROM ${table}`).get(),
    ).toEqual({ count: 0 });
  }
});

it('uses compare-and-swap across connections for edit/archive conflicts and preserves values', async () => {
  const character = service.create(metadata);
  const other = openDatabase(join(root, 'test.sqlite'));
  try {
    const otherService = new CharacterService(new CharacterRepository(other));
    otherService.update(character.id, { expectedRevision: 1, name: 'Winner' });
    expect(
      (await patch(character.id, { expectedRevision: 1, description: 'Stale' }))
        .status,
    ).toBe(409);
    expect((await remove(character.id, 1)).status).toBe(409);
    expect(service.get(character.id)).toMatchObject({
      name: 'Winner',
      description: 'A drawing',
      editRevision: 2,
    });
    expect((await remove(character.id, 2)).status).toBe(204);
    expect(() =>
      otherService.update(character.id, {
        expectedRevision: 2,
        name: 'Resurrect',
      }),
    ).toThrow('not found');
  } finally {
    other.close();
  }
});

it.each([
  { ...metadata, name: '' },
  { ...metadata, name: 'x'.repeat(81) },
  { ...metadata, description: 'x'.repeat(2001) },
  { ...metadata, bodyType: 'script' },
  { ...metadata, id: randomUUID() },
  { ...metadata, fightingStyle: 'code' },
  { ...metadata, specialPower: 'code' },
  { name: 'Missing fields' },
  null,
])('rejects invalid create input without writing: %j', async (input) => {
  const response = await create(input);
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({
    error: {
      code: 'invalid_input',
      fieldErrors: expect.any(Object),
      requestId: expect.any(String),
    },
  });
  expect(service.list()).toEqual([]);
});

it.each([
  { expectedRevision: 1 },
  { name: 'No token' },
  { expectedRevision: 0, name: 'Bad token' },
  { expectedRevision: 1.5, name: 'Fraction' },
  { expectedRevision: Number.MAX_SAFE_INTEGER, name: 'Overflow' },
  { expectedRevision: 1, archivedAt: 1 },
  { expectedRevision: 1, name: ' ' },
])('rejects invalid patches without revision changes: %j', async (input) => {
  const character = service.create(metadata);
  expect((await patch(character.id, input)).status).toBe(400);
  expect(service.get(character.id).editRevision).toBe(1);
});

it('validates IDs and distinguishes missing identities', async () => {
  expect((await get('not-uuid')).status).toBe(400);
  expect((await get(randomUUID())).status).toBe(404);
  expect(
    (await patch(randomUUID(), { expectedRevision: 1, name: 'Missing' }))
      .status,
  ).toBe(404);
});

it.each(['https://attacker.invalid', 'null', ''])(
  'rejects mutations from origin %s',
  async (origin) => {
    const response = await POST(
      event('POST', metadata, undefined, { origin }) as unknown as Parameters<
        typeof POST
      >[0],
    );
    expect(response.status).toBe(403);
    expect(service.list()).toEqual([]);
  },
);

it('requires origin for every mutation including JSON PATCH and DELETE', async () => {
  const character = service.create(metadata);
  for (const [method, handler] of [
    ['POST', POST],
    ['PATCH', PATCH],
    ['DELETE', DELETE],
  ] as const) {
    const input = event(
      method,
      { ...metadata, expectedRevision: 1 },
      character.id,
    );
    input.request.headers.delete('origin');
    expect((await handler(input as never)).status).toBe(403);
  }
  expect(service.get(character.id).editRevision).toBe(1);
});

it('rejects media types, malformed JSON, invalid UTF-8 and oversized streaming bodies', async () => {
  for (const [body, contentType, status] of [
    ['{}', 'text/plain', 415],
    ['{', 'application/json', 400],
    [new Uint8Array([0xff]), 'application/json', 400],
    ['x'.repeat(16_385), 'application/json', 413],
  ] as const) {
    const input = event('POST');
    input.request = new Request(input.request.url, {
      method: 'POST',
      headers: { origin: 'http://localhost', 'content-type': contentType },
      body,
    });
    expect(
      (await POST(input as unknown as Parameters<typeof POST>[0])).status,
    ).toBe(status);
  }
  expect(service.list()).toEqual([]);
});

it('retains frozen snapshots, approvals and ready release membership after edit/archive', async () => {
  const snapshots = new SnapshotRepository(db);
  const reviews = new ReviewService(snapshots);
  const releases = new ReleaseRepository(db);
  const publisher = new PublicationService(
    reviews,
    releases,
    join(root, 'published'),
  );
  const seed = await reviews.seedFixture('sprout');
  const original = reviews.getSnapshot(seed.versionId);
  const releaseId = await publisher.publish({
    versionId: seed.versionId,
    expectedManifestSha256: seed.manifestSha256!,
    sourceDirectory: fileURLToPath(
      new URL(
        '../../../../../packages/contracts/fixtures/sprout/v1',
        import.meta.url,
      ),
    ),
  });
  const published = reviews.getSnapshot(seed.versionId);
  const entries = releases.entries(releaseId);
  const id = original.characterId;
  service.update(id, {
    expectedRevision: 1,
    name: 'New authoring name',
    fightingStyle: 'unselected',
    specialPower: 'none',
  });
  service.archive(id, { expectedRevision: 2 });
  expect(reviews.getSnapshot(seed.versionId)).toEqual(published);
  expect(reviews.getSnapshot(seed.versionId).manifestJson).toBe(
    original.manifestJson,
  );
  expect(() =>
    reviews.requireApproval(seed.versionId, seed.manifestSha256!),
  ).not.toThrow();
  expect(releases.entries(releaseId)).toEqual(entries);
  expect(service.list()).toEqual([]);
});

it('persists choices across restart, preserves omitted legacy choices and shares metadata/archive CAS', async () => {
  const response = await create({
    ...metadata,
    fightingStyle: 'light_melee',
    specialPower: 'none',
  });
  expect(response.status).toBe(201);
  const character = await response.json();
  expect(character.fightingStyle).toBe('light_melee');
  db.close();
  db = openDatabase(join(root, 'test.sqlite'));
  service = new CharacterService(new CharacterRepository(db));
  expect(service.get(character.id)).toMatchObject({
    fightingStyle: 'light_melee',
    specialPower: 'none',
    editRevision: 1,
  });
  const other = openDatabase(join(root, 'test.sqlite'));
  try {
    const rival = new CharacterService(new CharacterRepository(other));
    expect(
      (
        await patch(character.id, {
          expectedRevision: 1,
          fightingStyle: 'unselected',
        })
      ).status,
    ).toBe(200);
    expect(() =>
      rival.update(character.id, { expectedRevision: 1, name: 'Lost' }),
    ).toThrow('changed');
    expect(() => rival.archive(character.id, { expectedRevision: 1 })).toThrow(
      'changed',
    );
    rival.update(character.id, { expectedRevision: 2, name: 'Winner' });
    expect(
      (
        await patch(character.id, {
          expectedRevision: 2,
          fightingStyle: 'light_melee',
        })
      ).status,
    ).toBe(409);
    expect(service.get(character.id)).toMatchObject({
      name: 'Winner',
      fightingStyle: 'unselected',
      editRevision: 3,
    });
    rival.archive(character.id, { expectedRevision: 3 });
    expect(
      (
        await patch(character.id, {
          expectedRevision: 3,
          fightingStyle: 'light_melee',
        })
      ).status,
    ).toBe(404);
  } finally {
    other.close();
  }
  const legacy = new CharacterRepository(db).create({
    ...metadata,
    fightingStyle: 'pending-contract',
    specialPower: 'legacy-power',
  });
  expect(service.get(legacy.id).fightingStyle).toBe('pending-contract');
  service.update(legacy.id, { expectedRevision: 1, name: 'Metadata only' });
  expect(service.get(legacy.id)).toMatchObject({
    fightingStyle: 'pending-contract',
    specialPower: 'legacy-power',
  });
  expect(
    (
      await patch(legacy.id, {
        expectedRevision: 2,
        specialPower: 'legacy-power',
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await patch(legacy.id, {
        expectedRevision: 2,
        fightingStyle: 'light_melee',
        specialPower: 'none',
      })
    ).status,
  ).toBe(200);
  for (const table of [
    'character_versions',
    'character_abilities',
    'abilities',
    'approvals',
    'content_releases',
  ]) {
    expect(
      db.sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get(),
    ).toEqual({ n: 0 });
  }
});

it.each([
  { fightingStyle: 'heavy_melee' },
  { specialPower: 'fireball' },
  { fightingStyle: 'light_melee', parameters: {} },
])('rejects invalid choice PATCH atomically: %j', async (choices) => {
  const character = service.create(metadata);
  expect(
    (
      await patch(character.id, {
        expectedRevision: 1,
        name: 'Must not save',
        ...choices,
      })
    ).status,
  ).toBe(400);
  expect(service.get(character.id)).toEqual(character);
});

it('bounds chunked bodies without Content-Length and cancels excess input', async () => {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.enqueue(new Uint8Array(4096));
    },
    cancel() {
      cancelled = true;
    },
  });
  const input = event('POST');
  input.request = new Request(input.request.url, {
    method: 'POST',
    headers: { origin: 'http://localhost', 'content-type': 'application/json' },
    body,
    duplex: 'half',
  } as RequestInit);
  expect(input.request.headers.has('content-length')).toBe(false);
  expect(
    (await POST(input as unknown as Parameters<typeof POST>[0])).status,
  ).toBe(413);
  expect(cancelled).toBe(true);
  expect(service.list()).toEqual([]);
});

it('returns private sanitized structured errors with request IDs', async () => {
  const response = await characterResponse(() => {
    throw new Error('/private/child/database.sqlite');
  });
  expect(response.status).toBe(503);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  const body = await response.json();
  expect(body.error.requestId).toBe(response.headers.get('x-request-id'));
  expect(JSON.stringify(body)).not.toContain('private');
});
