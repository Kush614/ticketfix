import { test, expect } from '@playwright/test';

test('deleting a todo in Active filter removes that specific todo', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  const input = page.getByPlaceholder('What needs doing?');
  const add = page.getByRole('button', { name: 'Add' });

  for (const title of ['Buy milk', 'Walk dog', 'Pay rent']) {
    await input.fill(title);
    await add.click();
  }

  await page.getByLabel('Mark Buy milk done').click();
  await page.getByRole('button', { name: 'Active' }).click();

  await page.getByLabel('Delete Pay rent').click();

  await expect(page.locator('#list .title')).toHaveText(['Walk dog']);

  await page.getByRole('button', { name: 'All' }).click();
  await expect(page.locator('#list .title')).toHaveText(['Buy milk', 'Walk dog']);
});
