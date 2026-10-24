import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

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
    name: 'Validated published artwork from this frozen version',
  });
  await expect(publishedPreview).toBeVisible();
  await expect
    .poll(() =>
      publishedPreview.evaluate(
        (image: HTMLImageElement) => image.naturalWidth,
      ),
    )
    .toBeGreaterThan(0);
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
