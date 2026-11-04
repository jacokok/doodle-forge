import { expect, test, type Page } from '@playwright/test';

async function exposeGeneratedDecisionControlsForBrowser(page: Page) {
  await page.route('**/_app/remote/**', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    const response = await route.fetch();
    const envelope = JSON.parse(await response.text()) as {
      data?: unknown;
    };
    if (
      typeof envelope.data !== 'string' ||
      !envelope.data.includes('generatedReviewDecisionSupported')
    )
      return route.fulfill({ response });

    // Remote functions encode values as a devalue reference array. Change
    // only this DTO field in the isolated browser response; the real server
    // must report false and continues to process all writes itself.
    const values = JSON.parse(envelope.data) as unknown[];
    const capabilities = values.filter(
      (value): value is Record<string, unknown> =>
        typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value) &&
        Object.hasOwn(value, 'generatedReviewDecisionSupported'),
    );
    if (capabilities.length === 0)
      throw new Error('Could not locate generated decision capability field');
    for (const capability of capabilities) {
      const reference = capability.generatedReviewDecisionSupported;
      const serverValue =
        typeof reference === 'number' ? values[reference] : reference;
      if (serverValue !== false)
        throw new Error('Server unexpectedly enabled generated decisions');
    }
    const trueReference = values.push(true) - 1;
    for (const capability of capabilities)
      capability.generatedReviewDecisionSupported = trueReference;
    return route.fulfill({
      response,
      body: JSON.stringify({ ...envelope, data: JSON.stringify(values) }),
    });
  });
}

test('generated decisions use the validated UI gate but never expose publication', async ({
  browser,
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await exposeGeneratedDecisionControlsForBrowser(page);
  await page.goto('/characters');
  await page
    .getByLabel('Library')
    .getByRole('button', { name: 'Generated preview fixture', exact: true })
    .click();
  await page.getByLabel('Description').fill('Unsaved generated review edit');
  await page
    .getByRole('button', { name: '3. Review and history', exact: true })
    .click();
  await page
    .getByLabel('Frozen version', { exact: true })
    .selectOption({ label: 'v1 · review' });
  const snapshot = page.getByLabel('Selected frozen version');
  const actions = snapshot.getByLabel('Frozen version actions');
  await expect(
    actions.getByRole('button', { name: 'Approve version' }),
  ).toBeEnabled();
  await expect(
    actions.getByRole('button', { name: 'Publish version' }),
  ).toHaveCount(0);
  await expect(snapshot).toContainText(
    'Not present in any ready published release',
  );

  // A second client wins decision-order CAS; the stale tab must refresh before acting.
  const other = await browser.newPage();
  await exposeGeneratedDecisionControlsForBrowser(other);
  await other.goto('/characters');
  await other
    .getByLabel('Library')
    .getByRole('button', { name: 'Generated preview fixture', exact: true })
    .click();
  await other
    .getByRole('button', { name: '3. Review and history', exact: true })
    .click();
  await other.getByLabel('Frozen version', { exact: true }).selectOption({
    label: 'v1 · review',
  });
  const otherActions = other
    .getByLabel('Selected frozen version')
    .getByLabel('Frozen version actions');
  let decisionRequest: import('@playwright/test').Request | undefined;
  other.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes('/_app/remote/'))
      decisionRequest = request;
  });
  await otherActions.getByRole('button', { name: 'Reject version' }).click();
  const otherDialog = other.getByRole('dialog', {
    name: 'Confirm frozen-version action',
  });
  await otherDialog
    .getByRole('button', { name: 'Confirm reject version' })
    .click();
  await expect(otherActions.getByRole('status')).toContainText(
    'Decision recorded: rejected',
  );
  await expect.poll(() => decisionRequest).toBeTruthy();

  // The remote command rejects cross-origin replay independently of UI hiding.
  const denied = await other.request.post(decisionRequest!.url(), {
    headers: {
      'content-type': decisionRequest!.headers()['content-type']!,
      origin: 'https://attacker.invalid',
    },
    data: decisionRequest!.postDataBuffer()!,
  });
  expect(denied.status()).toBe(403);

  await actions.getByRole('button', { name: 'Approve version' }).click();
  const dialog = page.getByRole('dialog', {
    name: 'Confirm frozen-version action',
  });
  await expect(dialog).toContainText('Manifest SHA-256');
  await dialog.getByRole('button', { name: 'Cancel action' }).click();
  await actions.getByRole('button', { name: 'Approve version' }).click();
  await dialog.getByRole('button', { name: 'Confirm approve version' }).click();
  await expect(snapshot.getByRole('alert')).toContainText(
    'refresh before retrying',
  );
  await actions.getByRole('button', { name: 'Refresh review' }).click();
  await expect(snapshot).toContainText('Latest decision: rejected');

  await actions.getByRole('button', { name: 'Approve version' }).click();
  const dropCommittedResponse = async (
    route: import('@playwright/test').Route,
  ) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await route.fetch(); // Commit on the server, then lose the response.
    await route.abort('connectionreset');
  };
  await page.route('**/_app/remote/**', dropCommittedResponse);
  await page
    .getByRole('dialog', { name: 'Confirm frozen-version action' })
    .getByRole('button', { name: 'Confirm approve version' })
    .click();
  await expect(snapshot.getByRole('alert')).toContainText(
    'Refresh review before retrying',
  );
  await page.unroute('**/_app/remote/**', dropCommittedResponse);
  await actions.getByRole('button', { name: 'Refresh review' }).click();
  await expect(snapshot).toContainText('Latest decision: approved');
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
  const preview = await page.request.get(src!);
  expect(preview.status()).toBe(200);
  expect(preview.headers()['cache-control']).toBe('private, no-store');
  expect(preview.headers()['cross-origin-resource-policy']).toBe('same-origin');
  const characterId = src!.split('/')[3]!;
  const index = await (await page.request.get('/api/content/index')).json();
  expect(
    index.characters.some(
      (item: { characterId: string }) => item.characterId === characterId,
    ),
  ).toBe(false);

  await actions.getByRole('button', { name: 'Revoke approval' }).click();
  await dialog.getByRole('button', { name: 'Confirm revoke approval' }).click();
  await expect(actions.getByRole('status')).toContainText(
    'Decision recorded: revoked',
  );
  await expect(page.getByLabel('Description')).toHaveValue(
    'Unsaved generated review edit',
  );
  expect(await (await page.request.get('/api/content/index')).json()).toEqual(
    index,
  );
  await other.close();
});

test('corrupt generated bytes block browser approval and remain unpublished', async ({
  page,
}) => {
  await exposeGeneratedDecisionControlsForBrowser(page);
  await page.goto('/characters');
  await page
    .getByLabel('Library')
    .getByRole('button', { name: 'Generated corrupt fixture', exact: true })
    .click();
  await page
    .getByRole('button', { name: '3. Review and history', exact: true })
    .click();
  await page.getByLabel('Frozen version', { exact: true }).selectOption({
    label: 'v1 · review',
  });
  const snapshot = page.getByLabel('Selected frozen version');
  const actions = snapshot.getByLabel('Frozen version actions');
  await expect(
    actions.getByRole('button', { name: 'Approve version' }),
  ).toBeEnabled();
  const sheet = snapshot.locator('img[src*="/versions/"]').first();
  const baseSrc = await sheet.getAttribute('src');
  expect(baseSrc).toBeTruthy();
  const src = baseSrc!.replace(/\/assets\/[^/]+$/, '/assets/idle_sheet');
  expect((await page.request.get(src!)).status()).toBe(409);

  await actions.getByRole('button', { name: 'Approve version' }).click();
  await page
    .getByRole('dialog', { name: 'Confirm frozen-version action' })
    .getByRole('button', { name: 'Confirm approve version' })
    .click();
  await expect(snapshot.getByRole('alert')).toContainText(
    'Generated review unavailable',
  );
  await expect(snapshot).toContainText('No approval decision recorded');
  const index = await (await page.request.get('/api/content/index')).json();
  expect(
    index.characters.some(
      (item: { characterId: string }) =>
        item.characterId === src!.split('/')[3],
    ),
  ).toBe(false);
});
