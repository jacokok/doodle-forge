import { expect, test } from '@playwright/test';

test('retry confirmation and uncertain response require refresh without losing edits', async ({
  page,
}) => {
  await page.goto('/characters');
  await page
    .getByLabel('Library')
    .getByRole('button', { name: 'Generated preview fixture', exact: true })
    .click();
  await page.getByLabel('Name', { exact: true }).fill('Retained retry edit');
  await page
    .getByRole('button', { name: '3. Review and history', exact: true })
    .click();
  const panel = page.getByLabel('Generation and jobs');
  const job = panel.getByLabel('Generation job v2');
  const button = job.getByRole('button', { name: 'Retry generation v2' });
  await expect(button).toBeEnabled();
  page.once('dialog', (dialog) => dialog.dismiss());
  await button.click();
  await expect(job).toContainText('Failed');
  const sent = page.waitForRequest(
    (request) =>
      request.method() === 'POST' && request.url().includes('retryGeneration'),
  );
  await page.route('**/*retryGeneration*', async (route) => {
    await route.fetch();
    await route.abort();
  });
  page.once('dialog', (dialog) => dialog.accept());
  await button.click();
  const request = await sent;
  const denied = await page.request.post(request.url(), {
    headers: {
      'content-type': request.headers()['content-type']!,
      origin: 'http://localhost:1234',
    },
    data: request.postDataBuffer()!,
  });
  expect(denied.status()).toBe(403);
  await expect(panel.getByRole('alert')).toContainText('result is uncertain');
  await expect(button).toBeDisabled();
  await page.unroute('**/*retryGeneration*');
  await panel
    .getByRole('button', { name: 'Refresh generation progress' })
    .click();
  await expect(job).toContainText('Queued');
  await expect(
    job.getByRole('button', { name: 'Retry generation v2' }),
  ).toHaveCount(0);
  await page
    .getByRole('button', { name: '1. Character details', exact: true })
    .click();
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue(
    'Retained retry edit',
  );
});
