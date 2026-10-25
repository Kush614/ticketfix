import { test, expect } from '@playwright/test';

test('Done filter displays only completed todos', async ({ page }) => {
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
  await page.getByRole('button', { name: 'Done', exact: true }).click();

  await expect(page.locator('#list .title')).toHaveText(['Buy milk']);
});
