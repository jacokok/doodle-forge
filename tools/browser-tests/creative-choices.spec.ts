import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

test('choice-only save/reload and server validation retain local creative input', async ({
  page,
}) => {
  const name = `Creative ${randomUUID()}`;
  const created = await page.request.post('/api/characters', {
    headers: { origin: 'http://127.0.0.1:5193' },
    data: { name, description: '', bodyType: 'quadruped' },
  });
  expect(created.status()).toBe(201);
  const character = await created.json();
  await page.goto('/characters');
  await page.getByRole('button', { name, exact: true }).click();
  await expect(page.getByLabel('Body type')).toHaveCount(1);
  await expect(page.getByLabel('Special power').locator('option')).toHaveText([
    'None',
  ]);
  await expect(
    page.getByText('The runtime supports light melee only.', { exact: false }),
  ).toBeVisible();
  await page.getByLabel('Fighting style').selectOption('light_melee');
  await page.getByRole('button', { name: 'Save metadata' }).click();
  await expect(page.getByText('Editing metadata revision 2')).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name, exact: true }).click();
  await expect(page.getByLabel('Fighting style')).toHaveValue('light_melee');
  await expect(page.getByLabel('Body type')).toHaveValue('quadruped');
  // Tamper with the native control: the shared server schema must still reject it.
  await page.getByLabel('Special power').evaluate((select) => {
    select.appendChild(new Option('Unsupported fireball', 'fireball'));
  });
  await page.getByLabel('Special power').selectOption('fireball');
  await page.getByLabel('Description').fill('Keep my input');
  await page.getByRole('button', { name: 'Save metadata' }).click();
  await expect(page.getByRole('alert')).toContainText('specialPower');
  await expect(page.getByLabel('Special power')).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  await expect(page.getByLabel('Special power')).toHaveValue('fireball');
  await expect(page.getByLabel('Description')).toHaveValue('Keep my input');
  const persisted = await (
    await page.request.get(`/api/characters/${character.id}`)
  ).json();
  expect(persisted).toMatchObject({
    fightingStyle: 'light_melee',
    specialPower: 'none',
    description: '',
    editRevision: 2,
  });
  await page.getByLabel('Special power').selectOption('none');
  await page.getByRole('button', { name: 'Save metadata' }).click();
  await expect(page.getByText('Editing metadata revision 3')).toBeVisible();
});
