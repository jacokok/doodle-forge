import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

test('keyboard create, structured validation, edit, deliberate archive and persistence', async ({
  page,
}) => {
  const name = `Pencil ${randomUUID()}`;
  await page.goto('/characters');
  await page
    .getByRole('button', { name: 'New character', exact: true })
    .focus();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Name', { exact: true })).toBeFocused();
  await page.keyboard.type('   ');
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Description')).toBeFocused();
  await page.keyboard.type('<script>not executable</script>');
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Body type')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Fighting style')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Special power')).toBeFocused();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('alert')).toContainText(
    'Invalid character input',
  );
  await expect(page.getByLabel('Name', { exact: true })).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  await expect(page.getByLabel('Name', { exact: true })).toBeFocused();
  await expect(page.getByLabel('Description')).toHaveValue(
    '<script>not executable</script>',
  );
  await expect(page.getByLabel('Fighting style')).toHaveValue('light_melee');
  await expect(page.getByLabel('Special power')).toHaveValue('none');
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByRole('button', { name: 'Save metadata' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Metadata saved' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
  await expect(page.getByLabel('Library')).toContainText(
    '<script>not executable</script>',
  );
  await page.reload();
  await page.getByRole('button', { name, exact: true }).click();
  await expect(page.getByLabel('Name', { exact: true })).toBeFocused();
  await expect(page.getByLabel('Fighting style')).toHaveValue('light_melee');
  await page.getByLabel('Fighting style').selectOption('unselected');
  await page.getByLabel('Name', { exact: true }).fill(`${name} edited`);
  await page.getByRole('button', { name: 'Save metadata' }).click();
  await expect(
    page.getByRole('button', { name: `${name} edited`, exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Archive character', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Cancel archive' }),
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('group', { name: 'Confirm archive' }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: `${name} edited`, exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Archive character', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Cancel archive' }),
  ).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('button', { name: 'Confirm archive', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'Published content is unchanged' }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('button', { name: `${name} edited`, exact: true }),
  ).toHaveCount(0);
});

test('two editors retain stale input, block resubmission and require deliberate reload for edit and archive', async ({
  page,
  context,
}) => {
  const name = `Conflict ${randomUUID()}`;
  const created = await page.request.post('/api/characters', {
    headers: { origin: 'http://127.0.0.1:5193' },
    data: { name, description: '', bodyType: 'floating' },
  });
  expect(created.status()).toBe(201);
  await page.goto('/characters');
  const other = await context.newPage();
  await other.goto('/characters');
  for (const editor of [page, other])
    await editor.getByRole('button', { name, exact: true }).click();
  await page.getByLabel('Description').fill('winning edit');
  await page.getByRole('button', { name: 'Save metadata' }).click();
  await expect(page.getByText('Editing metadata revision 2')).toBeVisible();
  await other.getByLabel('Description').fill('my stale input');
  await other.getByLabel('Fighting style').selectOption('light_melee');
  await other.getByRole('button', { name: 'Save metadata' }).click();
  await expect(other.getByRole('alert')).toContainText('Character changed');
  await other
    .getByRole('button', { name: '3. Review and history', exact: true })
    .click();
  await expect(other.getByLabel('Authoring summary')).toContainText(
    'my stale input',
  );
  await expect(other.getByText('Editing metadata revision 1')).toBeVisible();
  await other
    .getByRole('button', { name: '1. Character details', exact: true })
    .click();
  await expect(other.getByLabel('Description')).toHaveValue('my stale input');
  await expect(other.getByLabel('Fighting style')).toHaveValue('light_melee');
  await expect(
    other.getByRole('button', { name: 'Save metadata' }),
  ).toBeDisabled();
  await expect(
    other.getByRole('button', { name: 'Archive character', exact: true }),
  ).toBeDisabled();
  await other
    .getByRole('button', { name: 'Reload library and discard local edits' })
    .click();
  await expect(other.getByLabel('Description')).toHaveValue('winning edit');
  await expect(other.getByLabel('Fighting style')).toHaveValue('unselected');
  await expect(
    other.getByRole('button', { name: 'Save metadata' }),
  ).toBeEnabled();
  await other
    .getByRole('button', { name: 'Archive character', exact: true })
    .click();
  await page.getByLabel('Description').fill('another edit');
  await page.getByRole('button', { name: 'Save metadata' }).click();
  await expect(page.getByText('Editing metadata revision 3')).toBeVisible();
  await other
    .getByRole('button', { name: 'Confirm archive', exact: true })
    .click();
  await expect(other.getByRole('alert')).toContainText('Character changed');
  await expect(
    other.getByRole('button', { name: 'Confirm archive', exact: true }),
  ).toBeDisabled();
  await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
});

test('pending mutation prevents duplicate input; network failure keeps input and explains uncertainty', async ({
  page,
}) => {
  await page.goto('/characters');
  await page
    .getByRole('button', { name: 'New character', exact: true })
    .click();
  await page
    .getByLabel('Name', { exact: true })
    .fill(`Pending ${randomUUID()}`);
  await page.getByLabel('Fighting style').selectOption('light_melee');
  let release!: () => void;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/*', async (route) => {
    if (
      route.request().method() === 'POST' &&
      route.request().url().includes('/_app/remote/')
    ) {
      await hold;
      await route.abort('failed');
    } else await route.continue();
  });
  await page.getByRole('button', { name: 'Save metadata' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Working' }),
  ).toBeVisible();
  await expect(page.getByLabel('Name', { exact: true })).toBeDisabled();
  await expect(page.getByLabel('Fighting style')).toBeDisabled();
  await expect(page.getByLabel('Special power')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Saving…' })).toBeDisabled();
  await expect(
    page.getByRole('button', { name: '2. Private original', exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole('button', { name: 'New character', exact: true }),
  ).toBeDisabled();
  release();
  await expect(page.getByRole('alert')).toContainText(
    'Could not confirm the result',
  );
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue(
    /^Pending /,
  );
  await expect(page.getByLabel('Name', { exact: true })).toBeEnabled();
  await expect(page.getByLabel('Fighting style')).toHaveValue('light_melee');
});
