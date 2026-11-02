import { expect, test } from '@playwright/test';

test('generated review sheets are privately visible but cannot be approved or published', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/characters');
  await page
    .getByLabel('Library')
    .getByRole('button', { name: 'Generated preview fixture', exact: true })
    .click();
  await page
    .getByRole('button', { name: '3. Review and history', exact: true })
    .click();
  await page
    .getByLabel('Frozen version', { exact: true })
    .selectOption({ label: 'v1 · review' });
  const snapshot = page.getByLabel('Selected frozen version');
  await expect(snapshot).toContainText('Generated review is preview-only');
  await expect(snapshot).toContainText('No approval decision recorded');
  await expect(snapshot).toContainText(
    'Not present in any ready published release',
  );
  await expect(
    snapshot.getByRole('button', { name: 'Approve version', exact: true }),
  ).toHaveCount(0);
  await expect(
    snapshot.getByRole('button', { name: 'Publish version', exact: true }),
  ).toHaveCount(0);
  const image = snapshot.getByRole('img', {
    name: 'Frame 1 of 3 for attack_light',
  });
  await expect(image).toBeVisible();
  const sheet = snapshot.locator('img[src*="/versions/"]');
  await expect(sheet).toHaveJSProperty('naturalWidth', 512);
  const src = await sheet.getAttribute('src');
  expect(src).toMatch(
    /^\/api\/characters\/[^/]+\/versions\/[^/]+\/assets\/attack_light_sheet$/,
  );
  const response = await page.request.get(src!);
  expect(response.status()).toBe(200);
  expect(response.headers()['cache-control']).toBe('private, no-store');
  expect(response.headers()['cross-origin-resource-policy']).toBe(
    'same-origin',
  );
  const characterId = src!.split('/')[3]!;
  const index = await (await page.request.get('/api/content/index')).json();
  expect(
    index.characters.some(
      (item: { characterId: string }) => item.characterId === characterId,
    ),
  ).toBe(false);
});
