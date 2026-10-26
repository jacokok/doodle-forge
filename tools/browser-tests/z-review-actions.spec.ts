import { expect, test } from '@playwright/test';

test('pending review blocks overlap and uncertain transport failure requires explicit refresh', async ({
  page,
}) => {
  await page.goto('/characters');
  await page
    .getByLabel('Library')
    .getByRole('button', { name: 'Comet', exact: true })
    .click();
  await page.getByLabel('Description').fill('Retained after uncertain action');
  await page
    .getByRole('button', { name: '3. Review and history', exact: true })
    .click();
  await page
    .getByLabel('Frozen version', { exact: true })
    .selectOption({ label: 'v1 · approved' });
  const actions = page.getByLabel('Frozen version actions');
  await actions
    .getByRole('button', { name: 'Approve version', exact: true })
    .click();
  let release!: () => void;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/_app/remote/**', async (route) => {
    if (route.request().method() === 'POST') {
      await hold;
      await route.abort('failed');
    } else await route.continue();
  });
  const dialog = page.getByRole('dialog');
  await dialog
    .getByRole('button', { name: 'Confirm approve version', exact: true })
    .click();
  await expect(
    dialog.getByRole('button', { name: 'Cancel action' }),
  ).toBeDisabled();
  await expect(
    page.getByRole('button', { name: 'New character', exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByLabel('Frozen version', { exact: true }),
  ).toBeDisabled();
  release();
  await expect(actions.getByRole('alert')).toContainText('may have completed');
  await expect(actions.getByRole('alert')).toBeFocused();
  await expect(
    actions.getByRole('button', { name: 'Approve version', exact: true }),
  ).toBeDisabled();
  await expect(page.getByLabel('Description')).toHaveValue(
    'Retained after uncertain action',
  );
  await page.unrouteAll();
  await actions
    .getByRole('button', { name: 'Refresh review', exact: true })
    .click();
  await expect(
    actions.getByRole('button', { name: 'Approve version', exact: true }),
  ).toBeEnabled();
});

test('keyboard confirmation, stale review recovery, explicit publishing and revocation preserve frozen content', async ({
  page,
  context,
}) => {
  await page.goto('/characters');
  await page
    .getByLabel('Library')
    .getByRole('button', { name: 'Comet', exact: true })
    .click();
  await page.getByLabel('Description').fill('Unsaved during review actions');
  await page
    .getByRole('button', { name: '3. Review and history', exact: true })
    .click();
  await page
    .getByLabel('Frozen version', { exact: true })
    .selectOption({ label: 'v1 · approved' });
  const actions = page.getByLabel('Frozen version actions');
  await actions
    .getByRole('button', { name: 'Reject version', exact: true })
    .click();
  const dialog = page.getByRole('dialog', {
    name: 'Confirm frozen-version action',
  });
  await expect(
    dialog.getByRole('button', { name: 'Cancel action' }),
  ).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(
    actions.getByRole('button', { name: 'Reject version', exact: true }),
  ).toBeFocused();
  await actions
    .getByRole('button', { name: 'Reject version', exact: true })
    .click();
  await expect(
    dialog.getByRole('button', { name: 'Cancel action' }),
  ).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(
    dialog.getByRole('button', { name: 'Confirm reject version', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(actions.getByRole('status')).toContainText(
    'Decision recorded: rejected',
  );
  await expect(
    actions.getByRole('button', { name: 'Publish version', exact: true }),
  ).toBeDisabled();
  await expect(page.getByLabel('Description')).toHaveValue(
    'Unsaved during review actions',
  );

  const other = await context.newPage();
  await other.goto('/characters');
  await other
    .getByLabel('Library')
    .getByRole('button', { name: 'Comet', exact: true })
    .click();
  await other
    .getByRole('button', { name: '3. Review and history', exact: true })
    .click();
  await other
    .getByLabel('Frozen version', { exact: true })
    .selectOption({ label: 'v1 · review' });
  await actions
    .getByRole('button', { name: 'Approve version', exact: true })
    .click();
  await dialog
    .getByRole('button', { name: 'Confirm approve version', exact: true })
    .click();
  await expect(actions.getByRole('status')).toContainText(
    'Decision recorded: approved',
  );
  const otherActions = other.getByLabel('Frozen version actions');
  await otherActions
    .getByRole('button', { name: 'Reject version', exact: true })
    .click();
  await other
    .getByRole('dialog')
    .getByRole('button', { name: 'Confirm reject version', exact: true })
    .click();
  await expect(otherActions.getByRole('alert')).toContainText('Review changed');
  await expect(otherActions.getByRole('alert')).toBeFocused();
  await expect(
    otherActions.getByRole('button', { name: 'Reject version', exact: true }),
  ).toBeDisabled();
  await otherActions
    .getByRole('button', { name: 'Refresh review', exact: true })
    .click();
  await expect(
    otherActions.getByRole('button', { name: 'Publish version', exact: true }),
  ).toBeEnabled();
  await other.close();

  const before = await (await page.request.get('/api/content/index')).json();
  expect(
    before.characters.some(
      (item: { characterId: string }) =>
        item.characterId === '22222222-2222-4222-8222-222222222222',
    ),
  ).toBe(false);
  await actions
    .getByRole('button', { name: 'Publish version', exact: true })
    .click();
  await expect(dialog).toContainText('Manifest SHA-256');
  await dialog.getByRole('button', { name: 'Cancel action' }).click();
  expect(await (await page.request.get('/api/content/index')).json()).toEqual(
    before,
  );
  await actions
    .getByRole('button', { name: 'Publish version', exact: true })
    .click();
  const sent = page.waitForRequest(
    (request) =>
      request.method() === 'POST' && request.url().includes('/_app/remote/'),
  );
  await dialog
    .getByRole('button', { name: 'Confirm publish version', exact: true })
    .click();
  const request = await sent;
  for (const origin of [undefined, 'https://attacker.invalid']) {
    const denied = await page.request.post(request.url(), {
      headers: {
        'content-type': request.headers()['content-type']!,
        ...(origin ? { origin } : {}),
      },
      data: request.postDataBuffer()!,
    });
    expect(denied.status()).toBe(403);
  }
  await expect(actions.getByRole('status')).toContainText(
    'Published. A ready release',
  );
  const after = await (await page.request.get('/api/content/index')).json();
  expect(
    after.characters.some(
      (item: { characterId: string }) =>
        item.characterId === '22222222-2222-4222-8222-222222222222',
    ),
  ).toBe(true);
  await actions
    .getByRole('button', { name: 'Revoke approval', exact: true })
    .click();
  await dialog
    .getByRole('button', { name: 'Confirm revoke approval', exact: true })
    .click();
  await expect(actions.getByRole('status')).toContainText(
    'Decision recorded: revoked',
  );
  expect(await (await page.request.get('/api/content/index')).json()).toEqual(
    after,
  );
  await expect(page.getByLabel('Description')).toHaveValue(
    'Unsaved during review actions',
  );
});
