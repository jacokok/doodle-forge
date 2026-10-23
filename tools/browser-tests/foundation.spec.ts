import { expect, test } from '@playwright/test';

test('studio shell explains unavailable features and has a keyboard-accessible health link', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page).toHaveTitle('DoodleForge Studio');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Your drawings, ready for adventure.',
  );
  await expect(
    page.getByText(
      'Uploads, generation and publishing are not available in this UI yet.',
      { exact: false },
    ),
  ).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('link', { name: 'Open character library' }),
  ).toBeFocused();
  const response = await page.request.get('/api/health');
  expect(response.ok()).toBe(true);
  expect((await response.json()).generation).toBe('unavailable');
});
