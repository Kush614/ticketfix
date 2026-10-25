import { test, expect } from '@playwright/test';

test.beforeEach(async ({ request }) => {
  await request.post('/api/reset');
});

test('toggling todo done state persists across page reloads', async ({ page }) => {
  await page.goto('/');

  const input = page.getByPlaceholder('What needs doing?');
  const addBtn = page.getByRole('button', { name: 'Add' });

  for (const title of ['Buy milk', 'Walk dog', 'Pay rent']) {
    await input.fill(title);
    await addBtn.click();
    await expect(page.getByText(title)).toBeVisible();
  }

  await page.getByLabel('Mark Buy milk done').click();
  await page.getByLabel('Mark Pay rent done').click();

  await expect(page.locator('li.done')).toHaveCount(2);

  await page.reload();

  await expect(page.getByLabel('Mark Buy milk not done')).toBeChecked();
  await expect(page.getByLabel('Mark Walk dog done')).not.toBeChecked();
  await expect(page.getByLabel('Mark Pay rent not done')).toBeChecked();
  await expect(page.locator('li.done')).toHaveCount(2);
});
