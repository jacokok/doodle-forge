import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';

async function keyboardButton(page: Page, name: string) {
  const button = page.getByRole('button', { name, exact: true });
  for (let count = 0; count < 100; count++) {
    if (
      await button.evaluate((element) => element === document.activeElement)
    ) {
      await page.keyboard.press('Enter');
      return;
    }
    await page.keyboard.press('Tab');
  }
  throw new Error(`Could not reach ${name} with Tab`);
}

test('keyboard-only guided create/edit on a narrow viewport retains unsaved input between steps', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const name = `Guided ${randomUUID()}`;
  await page.goto('/characters');
  await keyboardButton(page, 'New character');
  await expect(page.getByLabel('Name', { exact: true })).toBeFocused();
  await page.keyboard.type(name);
  await page.keyboard.press('Tab');
  await page.keyboard.type('A brave paper creature');
  await page.keyboard.press('Tab');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Tab');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(page.getByText('Editing metadata revision 1')).toBeVisible();
  await keyboardButton(page, 'Next step');
  await expect(
    page.getByRole('heading', { name: 'Step 2 of 3: Private original' }),
  ).toBeFocused();
  await expect(
    page.getByText('No original attached.', { exact: true }),
  ).toBeVisible();
  await keyboardButton(page, 'Next step');
  await expect(page.getByLabel('Authoring summary')).toContainText(name);
  await expect(page.getByLabel('Generation and jobs')).toContainText(
    'Unavailable until Phase 6',
  );
  await keyboardButton(page, '1. Character details');
  // Wait for Svelte's transition focus before continuing with Tab.
  await expect(
    page.getByRole('heading', { name: 'Step 1 of 3: Character details' }),
  ).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Name', { exact: true })).toBeFocused();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type(`${name} edited locally`);
  await keyboardButton(page, '3. Review and history');
  await expect(page.getByLabel('Authoring summary')).toContainText(
    'edited locally',
  );
  await keyboardButton(page, '1. Character details');
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue(
    `${name} edited locally`,
  );
  await keyboardButton(page, 'Save metadata');
  await expect(page.getByText('Editing metadata revision 2')).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test('selected upload and unsaved choices survive steps and cancelled character/page navigation', async ({
  page,
}) => {
  const name = `Retention ${randomUUID()}`;
  await page.request.post('/api/characters', {
    headers: { origin: 'http://127.0.0.1:5193' },
    data: { name, description: '', bodyType: 'other' },
  });
  await page.goto('/characters');
  await page.getByRole('button', { name, exact: true }).click();
  await page.getByLabel('Description').fill('Not saved anywhere yet');
  await page.getByLabel('Fighting style').selectOption('light_melee');
  await page
    .getByRole('button', { name: '2. Private original', exact: true })
    .click();
  await page.getByLabel('Original image', { exact: true }).setInputFiles({
    name: 'keep.png',
    mimeType: 'image/png',
    buffer: Buffer.from('invalid image retained for correction'),
  });
  await page
    .getByRole('button', { name: '3. Review and history', exact: true })
    .click();
  await expect(page.getByLabel('Authoring summary')).toContainText(
    'Not saved anywhere yet',
  );
  page.once('dialog', (dialog) => dialog.dismiss());
  await page
    .getByRole('button', { name: 'New character', exact: true })
    .click();
  await expect(page.getByText('Editing metadata revision 1')).toBeVisible();
  page.once('dialog', (dialog) => dialog.dismiss());
  await page
    .getByRole('link', { name: 'DoodleForge home', exact: true })
    .click();
  await expect(page).toHaveURL(/\/characters$/);
  await page
    .getByRole('button', { name: '2. Private original', exact: true })
    .click();
  expect(
    await page
      .getByLabel('Original image', { exact: true })
      .evaluate((input: HTMLInputElement) => input.files?.[0]?.name),
  ).toBe('keep.png');
  await page
    .getByRole('button', { name: 'Attach original', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText('unsafe');
  await page
    .getByRole('button', { name: '1. Character details', exact: true })
    .click();
  await expect(page.getByLabel('Description')).toHaveValue(
    'Not saved anywhere yet',
  );
  await expect(page.getByLabel('Fighting style')).toHaveValue('light_melee');
  page.once('dialog', (dialog) => dialog.accept());
  await page
    .getByRole('button', { name: 'New character', exact: true })
    .click();
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('');
});
