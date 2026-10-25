import { test, expect } from '@playwright/test';

test('gantry delivers all 3 parts into the bin without dropping any', async ({ page }) => {
  await page.goto('/robot.html');

  await expect(page.locator('#status')).toHaveText('Done', { timeout: 15_000 });
  await expect(page.locator('#in-bin')).toHaveText('3');
  await expect(page.locator('#dropped')).toHaveText('0');
});
