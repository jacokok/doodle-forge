import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const origin = 'http://127.0.0.1:5193';
const fixtureRoot = 'packages/contracts/fixtures/sprout/v1';
const fixtureManifest = JSON.parse(
  readFileSync(`${fixtureRoot}/character.json`, 'utf8'),
) as { assets: { idle_sheet: { path: string } } };
const fixtureImage = readFileSync(
  `${fixtureRoot}/${fixtureManifest.assets.idle_sheet.path}`,
);

test('keyboard history selection keeps unsaved authoring input and separates approval from ready publication', async ({
  page,
}) => {
  const emptyCreated = await page.request.post('/api/characters', {
    headers: { origin: 'http://127.0.0.1:5193' },
    data: { name: 'No frozen history', description: '', bodyType: 'humanoid' },
  });
  expect(emptyCreated.status()).toBe(201);
  await page.goto('/characters');
  const library = page.getByLabel('Library');
  await expect(
    library.getByRole('button', { name: 'Sprout', exact: true }),
  ).toBeVisible();
  await expect(
    library.getByRole('button', { name: 'Comet', exact: true }),
  ).toBeVisible();
  await library
    .getByRole('button', { name: 'No frozen history', exact: true })
    .click();
  await page
    .getByRole('button', { name: '3. Review and history', exact: true })
    .click();
  await expect(page.getByLabel('Frozen version history')).toContainText(
    'No frozen versions exist for this character.',
  );

  await library.getByRole('button', { name: 'Comet', exact: true }).click();
  await page
    .getByRole('button', { name: '3. Review and history', exact: true })
    .click();
  const cometHistory = page.getByLabel('Frozen version history');
  const cometVersion = cometHistory.getByLabel('Frozen version');
  await expect(cometVersion).toBeVisible();
  await cometVersion.selectOption({ label: 'v1 · approved' });
  await expect(
    cometHistory.getByLabel('Selected frozen version'),
  ).toContainText('Latest decision: approved');
  await expect(cometHistory).toContainText(
    'Not present in any ready published release',
  );
  await expect(cometHistory).toContainText(
    'unpublished versions are not delivered by the published-content boundary',
  );
  await expect(cometHistory.getByRole('img')).toHaveCount(0);

  await library.getByRole('button', { name: 'Sprout', exact: true }).click();
  await page
    .getByRole('button', { name: '3. Review and history', exact: true })
    .click();
  const history = page.getByLabel('Frozen version history');
  const versionSelect = history.getByLabel('Frozen version');
  await expect(versionSelect).toBeVisible();
  await versionSelect.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  const snapshot = history.getByLabel('Selected frozen version');
  await expect(snapshot).toContainText('Frozen version 2');
  await expect(snapshot).toContainText('Sprout revision two');
  await expect(snapshot).toContainText('Latest decision: approved');
  await expect(snapshot).toContainText('Ready release');
  const publishedPreview = snapshot.getByRole('img', {
    name: 'Frame 1 of 1 for attack_light',
  });
  await expect(publishedPreview).toBeVisible();
  await expect(history).toContainText(
    'only a ready release establishes published visibility',
  );
  const name = page.getByLabel('Name', { exact: true });
  const description = page.getByLabel('Description');
  await page
    .getByRole('button', { name: '1. Character details', exact: true })
    .click();
  await name.fill('Unsaved authoring name');
  await description.fill('Unsaved description remains local');
  await page
    .getByRole('button', { name: '3. Review and history', exact: true })
    .click();
  await history
    .getByRole('combobox', { name: 'Frozen version' })
    .selectOption({ label: 'v1 · published' });
  await expect(snapshot).toContainText('Frozen version 1');
  await expect(name).toHaveValue('Unsaved authoring name');
  await expect(description).toHaveValue('Unsaved description remains local');
  await expect(snapshot).toContainText('Sprout');
});

test('ready-release comparison uses authorized original and contract animations while retaining edits', async ({
  page,
}) => {
  const result = await page.request.get('/api/characters');
  const rows = (await result.json()) as {
    characters: { id: string; name: string; editRevision: number }[];
  };
  const sprout = rows.characters.find(
    (character) => character.name === 'Sprout',
  )!;
  const upload = await page.request.post(
    `/api/characters/${sprout.id}/originals`,
    {
      headers: { origin },
      multipart: {
        expectedRevision: String(sprout.editRevision),
        image: {
          name: 'mutable.png',
          mimeType: 'image/png',
          buffer: fixtureImage,
        },
      },
    },
  );
  expect(upload.status()).toBe(201);
  const attached = (await upload.json()) as { originalAssetId: string };
  expect(
    (
      await page.request.get(
        `/api/characters/${sprout.id}/originals/${attached.originalAssetId}/preview`,
      )
    ).status(),
  ).toBe(200);
  const strangerResponse = await page.request.post('/api/characters', {
    headers: { origin },
    data: { name: 'Stranger', description: '', bodyType: 'humanoid' },
  });
  const stranger = (await strangerResponse.json()) as { id: string };
  expect(
    (
      await page.request.get(
        `/api/characters/${stranger.id}/originals/${attached.originalAssetId}/preview`,
      )
    ).status(),
  ).toBe(404);

  await page.route('**/api/characters/*/originals/*/preview', (route) =>
    route.abort('failed'),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/characters');
  const library = page.getByLabel('Library');
  await library.getByRole('button', { name: 'Sprout', exact: true }).click();
  await page
    .getByRole('button', { name: '1. Character details', exact: true })
    .click();
  await page
    .getByLabel('Name', { exact: true })
    .fill('Unsaved comparison draft');
  await page
    .getByRole('button', { name: '3. Review and history', exact: true })
    .click();
  const history = page.getByLabel('Frozen version history');
  await history
    .getByLabel('Frozen version')
    .selectOption({ label: 'v2 · published' });
  const compare = history.getByLabel('Artwork comparison');
  await expect(compare.getByLabel('Current original comparison')).toContainText(
    'not necessarily the source',
  );
  await expect(
    compare.getByAltText(/Current mutable authoring original/),
  ).toBeVisible();
  await expect(compare).toContainText('Current original preview unavailable');
  const animation = compare.getByRole('combobox', { name: 'Frozen animation' });
  await expect(animation.locator('option')).toHaveCount(5);
  await animation.selectOption('walk');
  await expect(compare.getByText(/Reduced motion is preferred/)).toBeVisible();
  await expect(
    compare.getByRole('img', { name: 'Frame 1 of 1 for walk' }),
  ).toBeVisible();
  await compare.getByRole('button', { name: 'Restart preview' }).click();
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue(
    'Unsaved comparison draft',
  );
  await expect(page.locator('html')).toHaveJSProperty('scrollWidth', 390);
  await page.route(
    '**/api/content/characters/*/versions/*/assets/*.png',
    (route) => route.abort('failed'),
  );
  await animation.selectOption('idle');
  await expect(compare).toContainText('Frozen animation unavailable');
});

test('archiving an identity in another browser removes its history from authoring without affecting published history', async ({
  page,
  context,
}) => {
  const name = `Archived ${randomUUID()}`;
  const created = await page.request.post('/api/characters', {
    headers: { origin: 'http://127.0.0.1:5193' },
    data: { name, description: '', bodyType: 'humanoid' },
  });
  expect(created.status()).toBe(201);
  const identity = await created.json();
  await page.goto('/characters');
  const library = page.getByLabel('Library');
  await library.getByRole('button', { name, exact: true }).click();
  await page
    .getByRole('button', { name: '3. Review and history', exact: true })
    .click();
  await expect(page.getByLabel('Frozen version history')).toContainText(
    'No frozen versions exist for this character.',
  );
  const other = await context.newPage();
  const archived = await other.request.delete(
    `/api/characters/${identity.id}`,
    {
      headers: { origin: 'http://127.0.0.1:5193' },
      data: { expectedRevision: identity.editRevision },
    },
  );
  expect(archived.status()).toBe(204);
  await page
    .getByRole('button', { name: 'Reload library and discard local edits' })
    .click();
  await expect(
    page.getByRole('status').filter({
      hasText: 'This character is no longer in the authoring library.',
    }),
  ).toBeVisible();
  await expect(page.getByLabel('Frozen version history')).toHaveCount(0);
  expect(
    (await other.request.get(`/api/characters/${identity.id}`)).status(),
  ).toBe(404);
});

test('history remote pending and failure states do not clear authoring input', async ({
  page,
}) => {
  await page.goto('/characters');
  await expect(
    page
      .getByLabel('Library')
      .getByRole('button', { name: 'Sprout', exact: true }),
  ).toBeVisible();
  let release!: () => void;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/_app/remote/**', async (route) => {
    await hold;
    await route.abort('failed');
  });
  await page
    .getByLabel('Library')
    .getByRole('button', { name: 'Sprout', exact: true })
    .click();
  await page
    .getByRole('button', { name: '3. Review and history', exact: true })
    .click();
  const history = page.getByLabel('Frozen version history');
  await expect(history).toContainText('Loading frozen versions');
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Sprout');
  release();
  await expect(history).toContainText('Version history unavailable');
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Sprout');
});
