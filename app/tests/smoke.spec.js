import { test, expect } from '@playwright/test';

test.describe('Taskly smoke', () => {
  test('can add and complete a todo', async ({ page }) => {
    await page.goto('/');
    await page.getByPlaceholder('What needs doing?').fill('Buy milk');
    await page.getByRole('button', { name: 'Add' }).click();
    await expect(page.getByText('Buy milk')).toBeVisible();
    await page.getByLabel('Mark Buy milk done').click();
    await expect(page.locator('li.done')).toHaveCount(1);
  });
});
