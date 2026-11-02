import { expect, test } from '@playwright/test';

test('replays an uncertain enqueue after reload without creating a duplicate', async ({
  page,
}) => {
  async function open() {
    await page.goto('/characters');
    await page
      .getByLabel('Library')
      .getByRole('button', { name: 'Generated preview fixture', exact: true })
      .click();
    await page
      .getByRole('button', { name: '3. Review and history', exact: true })
      .click();
  }
  await open();
  const panel = page.getByLabel('Start mock generation');
  await page
    .getByRole('button', { name: '1. Character details', exact: true })
    .click();
  await page
    .getByLabel('Name', { exact: true })
    .fill('Unsaved generation edit');
  await page
    .getByRole('button', { name: '3. Review and history', exact: true })
    .click();
  await expect(
    panel.getByRole('button', { name: 'Start mock generation' }),
  ).toBeDisabled();
  await page
    .getByRole('button', { name: '1. Character details', exact: true })
    .click();
  await page
    .getByLabel('Name', { exact: true })
    .fill('Generated preview fixture');
  await page
    .getByRole('button', { name: '3. Review and history', exact: true })
    .click();
  await panel.getByLabel('Art style').selectOption('pixel');
  await panel.getByLabel('Seed').fill('123');
  await page.route('**/*enqueueGeneration*', async (route) => {
    await route.fetch(); // Commit on the server, then lose the response.
    await route.abort();
  });
  await panel.getByRole('button', { name: 'Start mock generation' }).click();
  await expect(panel.getByRole('alert')).toContainText('result is uncertain');
  await page.unroute('**/*enqueueGeneration*');
  await open();
  await expect(panel).toContainText('pixel style, seed 123');
  await panel
    .getByRole('button', { name: 'Retry same generation request' })
    .click();
  await expect(panel.getByRole('status')).toContainText('queued');
  const version = await panel.getByRole('status').textContent();
  const number = version!.match(/v(\d+)/)![1];
  await expect(page.getByLabel(`Generation job v${number}`)).toHaveCount(1);
  expect(
    await page.evaluate(
      () =>
        Object.keys(sessionStorage).filter((key) =>
          key.startsWith('doodleforge:pending-generation:'),
        ).length,
    ),
  ).toBe(0);
});
