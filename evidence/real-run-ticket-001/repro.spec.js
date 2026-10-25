import { test, expect } from '@playwright/test';

test.beforeEach(async ({ request }) => {
  await request.post('/api/reset');
});

test('deleting a todo while a filter is active removes the clicked item', async ({ page }) => {
  await page.goto('/');

  const input = page.getByPlaceholder('What needs doing?');
  const addBtn = page.getByRole('button', { name: 'Add' });

  for (const title of ['Buy milk', 'Walk dog', 'Pay rent']) {
    await input.fill(title);
    await addBtn.click();
    await expect(page.getByText(title)).toBeVisible();
  }

  await page.getByLabel('Mark Buy milk done').click();
  await page.getByRole('button', { name: 'Active' }).click();
  await expect(page.locator('#list .title')).toHaveText(['Walk dog', 'Pay rent']);

  await page.getByLabel('Delete Pay rent').click();
  await expect(page.locator('#list .title')).toHaveText(['Walk dog']);

  await page.getByRole('button', { name: 'All' }).click();
  await expect(page.locator('#list .title')).toHaveText(['Buy milk', 'Walk dog']);
});
