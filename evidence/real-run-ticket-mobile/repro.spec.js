import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 375, height: 667 } });

test.beforeEach(async ({ request }) => {
  await request.post('/api/reset');
});

test('long todo title keeps the delete button in viewport and clickable on mobile', async ({ page }) => {
  await page.goto('/');

  const input = page.getByPlaceholder('What needs doing?');
  const addBtn = page.getByRole('button', { name: 'Add' });

  await input.fill('Buy milk');
  await addBtn.click();

  const longTitle = 'Call the landlord about the broken heating in the upstairs bedroom before Friday';
  await input.fill(longTitle);
  await addBtn.click();

  await page.getByLabel('Delete Buy milk').click();
  await expect(page.getByText('Buy milk')).toHaveCount(0);

  const delBtn = page.getByLabel(`Delete ${longTitle}`);
  await expect(delBtn).toBeInViewport();
  await delBtn.click({ timeout: 3000 });
  await expect(page.getByText('Nothing here.')).toBeVisible();
});
