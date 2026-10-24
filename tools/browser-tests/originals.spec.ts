import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const fixtureRoot = 'packages/contracts/fixtures/sprout/v1';
const manifest = JSON.parse(
  readFileSync(`${fixtureRoot}/character.json`, 'utf8'),
) as { assets: { idle_sheet: { path: string } } };
const bytes = readFileSync(`${fixtureRoot}/${manifest.assets.idle_sheet.path}`);
const image = {
  name: '../../drawing.png',
  mimeType: 'image/png',
  buffer: bytes,
};
const origin = 'http://127.0.0.1:5193';

test('keyboard upload/preview/replacement persists art, retains unsaved text, rejects unsafe art and stale attachments', async ({
  page,
  context,
}) => {
  const name = `Drawing ${randomUUID()}`;
  const created = await page.request.post('/api/characters', {
    headers: { origin },
    data: { name, description: '', bodyType: 'humanoid' },
  });
  const character = await created.json();
  await page.goto('/characters');
  await page.getByRole('button', { name, exact: true }).click();
  await page.getByLabel('Description').fill('Unsaved local idea');
  await page.getByLabel('Fighting style').selectOption('light_melee');
  await page
    .getByRole('button', { name: '2. Private original', exact: true })
    .click();
  await page.getByLabel('Original image', { exact: true }).setInputFiles({
    name: 'spoof.png',
    mimeType: 'image/png',
    buffer: Buffer.from('not an image'),
  });
  await page
    .getByRole('button', { name: 'Attach original', exact: true })
    .focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('alert')).toContainText('unsafe');
  await expect(page.getByLabel('Description')).toHaveValue(
    'Unsaved local idea',
  );
  await page.getByLabel('Original image', { exact: true }).setInputFiles(image);
  await page
    .getByRole('button', { name: 'Attach original', exact: true })
    .focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Editing metadata revision 2')).toBeVisible();
  await expect(page.getByLabel('Description')).toHaveValue(
    'Unsaved local idea',
  );
  await expect(page.getByLabel('Fighting style')).toHaveValue('light_melee');
  expect(
    (await (await page.request.get(`/api/characters/${character.id}`)).json())
      .fightingStyle,
  ).toBe('unselected');
  const preview = page.getByAltText(
    'Private preview of the attached original drawing',
  );
  await expect(preview).toBeVisible();
  await expect
    .poll(() =>
      preview.evaluate((element: HTMLImageElement) => element.naturalWidth),
    )
    .toBe(256);
  const originalUrl = await page
    .getByRole('link', { name: 'Open private original (new tab)' })
    .getAttribute('href');
  const original = await page.request.get(originalUrl!);
  expect(await original.body()).toEqual(bytes);
  await page
    .getByRole('button', { name: '1. Character details', exact: true })
    .click();
  await page.getByRole('button', { name: 'Save metadata' }).click();
  await expect(page.getByText('Editing metadata revision 3')).toBeVisible();
  const other = await context.newPage();
  await other.goto('/characters');
  await other.getByRole('button', { name, exact: true }).click();
  await page
    .getByRole('button', { name: '2. Private original', exact: true })
    .click();
  await page.getByLabel('Original image', { exact: true }).setInputFiles(image);
  await page.getByRole('button', { name: 'Replace original' }).click();
  await expect(page.getByText('Editing metadata revision 4')).toBeVisible();
  expect(await (await page.request.get(originalUrl!)).body()).toEqual(bytes);
  await other.getByLabel('Description').fill('Stale local idea');
  await other.getByLabel('Fighting style').selectOption('unselected');
  await other
    .getByRole('button', { name: '2. Private original', exact: true })
    .click();
  await other
    .getByLabel('Original image', { exact: true })
    .setInputFiles(image);
  await other.getByRole('button', { name: 'Replace original' }).click();
  await expect(other.getByRole('alert')).toContainText('Character changed');
  await expect(other.getByLabel('Description')).toHaveValue('Stale local idea');
  await expect(other.getByLabel('Fighting style')).toHaveValue('unselected');
  await expect(
    other.getByRole('button', { name: 'Replace original' }),
  ).toBeDisabled();
  expect(
    await other
      .getByLabel('Original image', { exact: true })
      .evaluate((element: HTMLInputElement) => element.files?.length),
  ).toBe(1);
  await other
    .getByRole('button', { name: 'Reload library and discard local edits' })
    .click();
  await expect(other.getByText('Editing metadata revision 4')).toBeVisible();
  await expect(other.getByLabel('Fighting style')).toHaveValue('light_melee');
  await expect(other.getByLabel('Description')).toHaveValue(
    'Unsaved local idea',
  );
  await page.reload();
  await page.getByRole('button', { name, exact: true }).click();
  await page
    .getByRole('button', { name: '2. Private original', exact: true })
    .click();
  await expect(
    page.getByAltText('Private preview of the attached original drawing'),
  ).toBeVisible();
  const stored = (await (
    await page.request.get(`/api/characters/${character.id}`)
  ).json()) as { originalAssetId: string };
  expect(
    (
      await page.request.get(
        `/storage/originals/${stored.originalAssetId}.original`,
      )
    ).status(),
  ).toBe(404);
  await page.route('**/originals/*/preview', (route) => route.abort('failed'));
  await page.reload();
  await page.getByRole('button', { name, exact: true }).click();
  await page
    .getByRole('button', { name: '2. Private original', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText(
    'Private preview unavailable',
  );
});

test('built HTTP upload boundary enforces origin and both adapter/route bounds', async ({
  request,
}) => {
  const created = await request.post('/api/characters', {
    headers: { origin },
    data: {
      name: `HTTP art ${randomUUID()}`,
      description: '',
      bodyType: 'other',
    },
  });
  const character = (await created.json()) as { id: string };
  const url = `/api/characters/${character.id}/originals`;
  const multipart = {
    expectedRevision: '1',
    image: { name: 'image.png', mimeType: 'image/png', buffer: bytes },
  };
  expect((await request.post(url, { multipart })).status()).toBe(403);
  // Greater than adapter-node's default 512K: reaches strict image validation,
  // not a premature transport cap. This deliberately invalid image is not adopted.
  const malformed = await request.post(url, {
    headers: { origin },
    multipart: {
      ...multipart,
      image: { ...multipart.image, buffer: Buffer.alloc(600 * 1024) },
    },
  });
  expect(malformed.status()).toBe(422);
  expect((await malformed.json()).error.code).toBe('invalid_image');
  const excessive = await request.post(url, {
    headers: { origin },
    multipart: {
      ...multipart,
      image: { ...multipart.image, buffer: Buffer.alloc(11 * 1024 * 1024) },
    },
  });
  expect(excessive.status()).toBe(413);
  expect(
    (await (await request.get(`/api/characters/${character.id}`)).json())
      .originalAssetId,
  ).toBeNull();
});

test('pending upload blocks overlap; network failure preserves file/text and requires reload', async ({
  page,
}) => {
  const name = `Upload pending ${randomUUID()}`;
  await page.request.post('/api/characters', {
    headers: { origin },
    data: { name, description: '', bodyType: 'other' },
  });
  await page.goto('/characters');
  await page.getByRole('button', { name, exact: true }).click();
  await page.getByLabel('Description').fill('Keep me');
  await page
    .getByRole('button', { name: '2. Private original', exact: true })
    .click();
  await page.getByLabel('Original image', { exact: true }).setInputFiles(image);
  let release!: () => void;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/characters/*/originals', async (route) => {
    await hold;
    await route.abort('failed');
  });
  await page
    .getByRole('button', { name: 'Attach original', exact: true })
    .click();
  await expect(page.getByRole('button', { name: 'Uploading…' })).toBeDisabled();
  await expect(
    page.getByRole('button', { name: '1. Character details', exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole('button', { name: 'Next step', exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByLabel('Original image', { exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole('button', { name: 'New character', exact: true }),
  ).toBeDisabled();
  release();
  await expect(page.getByRole('alert')).toContainText(
    'Could not confirm upload',
  );
  await expect(page.getByLabel('Description')).toHaveValue('Keep me');
  expect(
    await page
      .getByLabel('Original image', { exact: true })
      .evaluate((element: HTMLInputElement) => element.files?.length),
  ).toBe(1);
  await expect(
    page.getByRole('button', { name: 'Attach original', exact: true }),
  ).toBeDisabled();
});
