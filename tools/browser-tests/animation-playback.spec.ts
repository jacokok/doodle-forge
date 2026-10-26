import { expect, test } from '@playwright/test';

test('multi-frame preview supports pause, stepping, restart, looping and one-shot completion', async ({
  page,
}) => {
  await page.clock.install();
  await page.goto('/characters');
  await page
    .getByLabel('Library')
    .getByRole('button', { name: 'Motion fixture', exact: true })
    .click();
  await page
    .getByRole('button', { name: '3. Review and history', exact: true })
    .click();
  await page
    .getByLabel('Frozen version', { exact: true })
    .selectOption({ label: 'v1 · published' });
  const panel = page.getByLabel('Frozen animation panel');
  await expect(panel.getByRole('img')).toBeVisible();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  const animation = panel.getByRole('combobox', { name: 'Frozen animation' });
  await animation.selectOption('walk');
  // Wait for the real published PNG to load before advancing the controlled clock.
  await expect(
    panel.getByText('Loading frozen animation artwork…'),
  ).toHaveCount(0);
  await panel
    .getByRole('button', { name: 'Restart preview', exact: true })
    .click();
  await expect(panel.getByRole('img')).toHaveAccessibleName(
    'Frame 1 of 4 for walk',
  );
  await page.clock.runFor(250);
  await expect(panel.getByRole('img')).toHaveAccessibleName(
    'Frame 2 of 4 for walk',
  );
  await panel
    .getByRole('button', { name: 'Pause preview', exact: true })
    .click();
  await page.clock.runFor(2000);
  await expect(panel.getByRole('img')).toHaveAccessibleName(
    'Frame 2 of 4 for walk',
  );
  await panel.getByRole('button', { name: 'Next frame', exact: true }).click();
  await expect(panel.getByRole('img')).toHaveAccessibleName(
    'Frame 3 of 4 for walk',
  );
  await expect(panel.getByRole('img')).toHaveCSS(
    'background-position',
    '0% 100%',
  );
  await panel
    .getByRole('button', { name: 'Play preview', exact: true })
    .focus();
  await page.keyboard.press('Enter');
  await page.clock.runFor(500);
  await expect(panel.getByRole('img')).toHaveAccessibleName(
    'Frame 1 of 4 for walk',
  );

  await animation.selectOption('attack_light');
  await expect(
    panel.getByText('Loading frozen animation artwork…'),
  ).toHaveCount(0);
  await panel
    .getByRole('button', { name: 'Restart preview', exact: true })
    .click();
  await page.clock.runFor(1000);
  await expect(panel.getByRole('img')).toHaveAccessibleName(
    'Frame 4 of 4 for attack_light',
  );
  await expect(
    panel.getByRole('button', { name: 'Play preview', exact: true }),
  ).toBeVisible();
  await page.clock.runFor(1000);
  await expect(panel.getByRole('img')).toHaveAccessibleName(
    'Frame 4 of 4 for attack_light',
  );
  await panel
    .getByRole('button', { name: 'Restart preview', exact: true })
    .click();
  await page.clock.runFor(250);
  await expect(panel.getByRole('img')).toHaveAccessibleName(
    'Frame 2 of 4 for attack_light',
  );

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(
    panel.getByRole('button', { name: 'Play preview', exact: true }),
  ).toBeDisabled();
  await panel
    .getByRole('button', { name: 'Restart preview', exact: true })
    .click();
  await page.clock.runFor(2000);
  await expect(panel.getByRole('img')).toHaveAccessibleName(
    'Frame 1 of 4 for attack_light',
  );
  await panel.getByRole('button', { name: 'Next frame', exact: true }).click();
  await expect(panel.getByRole('img')).toHaveAccessibleName(
    'Frame 2 of 4 for attack_light',
  );
});

test('leaving the review step or hiding the document stops frame advancement', async ({
  page,
}) => {
  await page.clock.install();
  await page.goto('/characters');
  await page
    .getByLabel('Library')
    .getByRole('button', { name: 'Motion fixture', exact: true })
    .click();
  await page
    .getByRole('button', { name: '3. Review and history', exact: true })
    .click();
  await page
    .getByLabel('Frozen version', { exact: true })
    .selectOption({ label: 'v1 · published' });
  const panel = page.getByLabel('Frozen animation panel');
  await expect(panel.getByRole('img')).toBeVisible();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await panel
    .getByRole('combobox', { name: 'Frozen animation' })
    .selectOption('walk');
  await expect(
    panel.getByText('Loading frozen animation artwork…'),
  ).toHaveCount(0);
  await panel
    .getByRole('button', { name: 'Restart preview', exact: true })
    .click();
  await page.clock.runFor(250);
  await page
    .getByRole('button', { name: '1. Character details', exact: true })
    .click();
  await page.clock.runFor(2250);
  await page
    .getByRole('button', { name: '3. Review and history', exact: true })
    .click();
  await expect(panel.getByRole('img')).toHaveAccessibleName(
    'Frame 2 of 4 for walk',
  );
  // Exercise the visibility event deterministically, not an OS focus simulation.
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.clock.runFor(2250);
  await expect(panel.getByRole('img')).toHaveAccessibleName(
    'Frame 2 of 4 for walk',
  );
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      value: false,
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.clock.runFor(250);
  await expect(panel.getByRole('img')).toHaveAccessibleName(
    'Frame 3 of 4 for walk',
  );
});
