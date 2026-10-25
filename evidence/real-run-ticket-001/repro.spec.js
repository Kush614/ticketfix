import { test, expect } from '@playwright/test';

test('deleting a todo in the Active filter removes the clicked item, not another one', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  const input = page.getByPlaceholder('What needs doing?');
  for (const title of ['Buy milk', 'Walk dog', 'Pay rent']) {
    await input.fill(title);
    await page.getByRole('button', { name: 'Add' }).click();
  }

  await page.getByLabel('Mark Buy milk done').click();
  await page.getByRole('button', { name: 'Active' }).click();
  await expect(page.locator('#list li')).toHaveCount(2);

  await page.getByLabel('Delete Pay rent').click();

  // In Active filter, 'Walk dog' should remain and 'Pay rent' should be removed
  await expect(page.getByText('Walk dog')).toBeVisible();
  await expect(page.getByText('Pay rent')).toHaveCount(0);

  // Switching back to All should show 'Buy milk' and 'Walk dog'
  await page.getByRole('button', { name: 'All' }).click();
  await expect(page.locator('#list li')).toHaveCount(2);
  await expect(page.getByText('Buy milk')).toBeVisible();
  await expect(page.getByText('Walk dog')).toBeVisible();
  await expect(page.getByText('Pay rent')).toHaveCount(0);
});
