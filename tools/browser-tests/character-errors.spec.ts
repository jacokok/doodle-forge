import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

test('remote mutations reject wrong/missing origins without creating an identity', async ({
  page,
}) => {
  const name = `Origin ${randomUUID()}`;
  await page.goto('/characters');
  await page
    .getByRole('button', { name: 'New character', exact: true })
    .click();
  await page.getByLabel('Name', { exact: true }).fill(name);
  const sent = page.waitForRequest(
    (request) =>
      request.method() === 'POST' && request.url().includes('/_app/remote/'),
  );
  await page.getByRole('button', { name: 'Save metadata' }).click();
  const request = await sent;
  await expect(page.getByText('Editing metadata revision 1')).toBeVisible();
  for (const origin of [undefined, 'http://localhost:1234']) {
    const response = await page.request.post(request.url(), {
      headers: {
        'content-type': request.headers()['content-type']!,
        ...(origin ? { origin } : {}),
      },
      data: request.postDataBuffer()!,
    });
    expect(response.status()).toBe(403);
  }
  const response = await page.request.get('/api/characters');
  const identities = (await response.json()).characters as { name: string }[];
  expect(identities.filter((item) => item.name === name)).toHaveLength(1);
});

test('query refresh shows pending and recoverable failure without clearing unsaved editor input', async ({
  page,
}) => {
  await page.goto('/characters');
  await page
    .getByRole('button', { name: 'New character', exact: true })
    .click();
  await page.getByLabel('Name', { exact: true }).fill('Kept locally');
  let release!: () => void;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/*', async (route) => {
    if (route.request().url().includes('/_app/remote/')) {
      await hold;
      await route.abort('failed');
    } else await route.continue();
  });
  await page
    .getByRole('button', { name: 'Reload library', exact: true })
    .click();
  await expect(page.getByLabel('Library')).toHaveAttribute('aria-busy', 'true');
  await expect(
    page.getByRole('button', { name: 'New character', exact: true }),
  ).toBeDisabled();
  release();
  await expect(
    page.getByRole('status').filter({ hasText: 'Library reload failed' }),
  ).toBeVisible();
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue(
    'Kept locally',
  );
  await page.unrouteAll();
  await page
    .getByRole('button', { name: 'Reload library', exact: true })
    .click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Library reloaded' }),
  ).toBeVisible();
});
