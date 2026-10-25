import { test, expect } from '@playwright/test';

test('deleting a todo in Active filter removes the correct item', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  const input = page.getByPlaceholder('What needs doing?');
  const addBtn = page.getByRole('button', { name: 'Add' });

  for (const title of ['Buy milk', 'Walk dog', 'Pay rent']) {
    await input.fill(title);
    await addBtn.click();
  }

  await page.getByLabel('Mark Buy milk done').click();
  await page.getByRole('button', { name: 'Active' }).click();
  await expect(page.locator('#list .title')).toHaveText(['Walk dog', 'Pay rent']);

  await page.getByLabel('Delete Walk dog').click();
  await expect(page.locator('#list .title')).toHaveText(['Pay rent']);

  await page.getByRole('button', { name: 'All' }).click();
  await expect(page.locator('#list .title')).toHaveText(['Buy milk', 'Pay rent']);
});
