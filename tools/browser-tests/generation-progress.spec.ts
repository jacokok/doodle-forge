import { expect, test } from '@playwright/test';

async function openGenerated(page: import('@playwright/test').Page) {
  await page.goto('/characters');
  await page
    .getByLabel('Library')
    .getByRole('button', { name: 'Generated preview fixture', exact: true })
    .click();
}

test('shows actual bounded job/step states without leaking provider data', async ({
  page,
}) => {
  await openGenerated(page);
  await page
    .getByRole('button', { name: '3. Review and history', exact: true })
    .click();
  const jobs = page.getByLabel('Generation and jobs');
  await expect(jobs.getByLabel('Generation job v1')).toContainText(
    'Waiting for approval (not published) · 27 / 27 stages complete',
  );
  await expect(jobs.getByLabel('Generation job v2')).toContainText(
    'Failed · 0 / 27 stages complete',
  );
  await expect(jobs.getByLabel('Generation job v4')).toContainText(
    'Running · 0 / 27 stages complete',
  );
  await expect(jobs.getByLabel('Generation job v5')).toContainText(
    'Queued · 0 / 27 stages complete',
  );
  const retry = jobs.getByLabel('Generation job v3');
  await retry.getByText('Stage details for v3', { exact: true }).click();
  await expect(retry).toContainText('TRANSIENT_STAGE_FAILURE');
  await expect(retry).toContainText('Retry due');
  const failed = jobs.getByLabel('Generation job v2');
  await failed.getByText('Stage details for v2', { exact: true }).click();
  await expect(failed).toContainText('STAGE_EXECUTION_FAILED');
  await expect(jobs).not.toContainText('/private/mock/provider-message');
  await expect(jobs).not.toContainText('browser-private-worker');
  await expect(
    jobs.getByRole('button', { name: 'Refresh generation progress' }),
  ).toHaveCount(1);
  await expect(
    failed.getByRole('button', { name: 'Retry generation v2' }),
  ).toBeEnabled();
  await page
    .getByLabel('Library')
    .getByRole('button', { name: 'Sprout', exact: true })
    .click();
  await page
    .getByRole('button', { name: '3. Review and history', exact: true })
    .click();
  await expect(jobs).toContainText(
    'No mock generation jobs found for this character.',
  );
  await expect(jobs.getByRole('article')).toHaveCount(0);
});

test('polls only the visible review step, prevents overlap, recovers errors and preserves edits', async ({
  page,
}) => {
  await page.clock.install();
  let requests = 0;
  page.on('request', (request) => {
    if (request.url().includes('generationProgress')) requests++;
  });
  await openGenerated(page);
  await page.getByLabel('Name', { exact: true }).fill('Unsaved progress edit');
  await page.clock.runFor(6000);
  expect(requests).toBe(0);
  await page
    .getByRole('button', { name: '3. Review and history', exact: true })
    .click();
  const jobs = page.getByLabel('Generation and jobs');
  await expect(jobs.getByLabel('Generation job v1')).toBeVisible();
  expect(requests).toBeGreaterThan(0);
  await page.clock.pauseAt(
    new Date((await page.evaluate(() => Date.now())) + 100),
  );
  let before = requests;
  await page.clock.runFor(1100);
  await expect.poll(() => requests).toBeGreaterThan(before);
  await expect(
    jobs.getByRole('button', { name: 'Refresh generation progress' }),
  ).toBeEnabled();
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  before = requests;
  await page.clock.runFor(10000);
  expect(requests).toBe(before);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      value: false,
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.clock.runFor(1100);
  await expect.poll(() => requests).toBeGreaterThan(before);
  await expect(
    jobs.getByRole('button', { name: 'Refresh generation progress' }),
  ).toBeEnabled();
  let release!: () => void;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  let held = 0;
  await page.route('**/*generationProgress*', async (route) => {
    held++;
    await hold;
    await route.abort('failed');
  });
  await jobs
    .getByRole('button', { name: 'Refresh generation progress' })
    .click();
  await expect.poll(() => held).toBe(1);
  await expect(
    jobs.getByRole('button', { name: 'Refresh generation progress' }),
  ).toBeDisabled();
  await page.clock.runFor(6000);
  expect(held).toBe(1);
  release();
  await expect(jobs.getByRole('alert')).toContainText(
    'Generation progress unavailable',
  );
  await page.unroute('**/*generationProgress*');
  await jobs
    .getByRole('button', { name: 'Refresh generation progress' })
    .click();
  await expect(jobs.getByRole('alert')).toHaveCount(0);
  await expect(jobs.getByLabel('Generation job v1')).toBeVisible();
  await page
    .getByRole('button', { name: '1. Character details', exact: true })
    .click();
  before = requests;
  await page.clock.runFor(10000);
  expect(requests).toBe(before);
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue(
    'Unsaved progress edit',
  );
});
