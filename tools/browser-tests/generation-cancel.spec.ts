import { expect, test } from '@playwright/test';

test('confirms and cancels a queued job without discarding unsaved input', async ({
  page,
}) => {
  await page.goto('/characters');
  await page
    .getByLabel('Library')
    .getByRole('button', { name: 'Generated preview fixture', exact: true })
    .click();
  await page
    .getByRole('button', { name: '3. Review and history', exact: true })
    .click();
  const panel = page.getByLabel('Start mock generation');
  await panel.getByRole('button', { name: 'Start mock generation' }).click();
  await expect(panel.getByRole('status')).toContainText('queued');
  const number = (await panel.getByRole('status').textContent())!.match(
    /v(\d+)/,
  )![1];
  await page
    .getByRole('button', { name: '1. Character details', exact: true })
    .click();
  await page
    .getByLabel('Name', { exact: true })
    .fill('Unsaved cancellation edit');
  await page
    .getByRole('button', { name: '3. Review and history', exact: true })
    .click();
  const job = page.getByLabel(`Generation job v${number}`);
  const cancel = job.getByRole('button', {
    name: `Cancel generation v${number}`,
  });
  await expect(job).toContainText('Queued');
  page.once('dialog', (dialog) => dialog.dismiss());
  await cancel.click();
  await expect(job).toContainText('Queued');
  await page.route('**/*cancelGeneration*', async (route) => {
    await route.fetch();
    await route.abort();
  });
  page.once('dialog', (dialog) => dialog.accept());
  await cancel.click();
  await expect(
    page.getByLabel('Generation and jobs').getByRole('alert'),
  ).toContainText('result is uncertain');
  await expect(job).toContainText('Cancelled');
  await page.unroute('**/*cancelGeneration*');
  await expect(cancel).toHaveCount(0);
  await page
    .getByRole('button', { name: '1. Character details', exact: true })
    .click();
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue(
    'Unsaved cancellation edit',
  );
});
