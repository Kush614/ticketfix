import { test, expect } from '@playwright/test';

test.beforeEach(async ({ request }) => {
  await request.post('/api/reset');
});

test.describe('Taskly smoke', () => {
  test('can add and complete a todo', async ({ page }) => {
    await page.goto('/');
    await page.getByPlaceholder('What needs doing?').fill('Buy milk');
    await page.getByRole('button', { name: 'Add' }).click();
    await expect(page.getByText('Buy milk')).toBeVisible();
    await page.getByLabel('Mark Buy milk done').click();
    await expect(page.locator('li.done')).toHaveCount(1);
  });

  test('added todos are stored on the server', async ({ page, request }) => {
    await page.goto('/');
    await page.getByPlaceholder('What needs doing?').fill('Walk dog');
    await page.getByRole('button', { name: 'Add' }).click();
    await expect(page.getByText('Walk dog')).toBeVisible();
    const todos = await request.get('/api/todos').then(r => r.json());
    expect(todos.map(t => t.title)).toEqual(['Walk dog']);
  });
});
