import { expect, test } from '@playwright/test';

test.describe('Basic E2E Setup', () => {
  test('should load the home page', async ({ page }) => {
    await page.goto('/');

    // Check if the navbar logo is visible (more specific)
    await expect(page.locator('.navbar a.btn:has-text("잔점")')).toBeVisible();

    // Check if navigation elements are present
    await expect(page.locator('.navbar')).toBeVisible();
  });

  test('should find user button in navbar', async ({ page }) => {
    await page.goto('/');

    // Wait for navbar to load
    await expect(page.locator('.navbar')).toBeVisible();

    // Check if user button exists (for unauthenticated state)
    const userButton = page.locator('button').filter({
      has: page.locator('svg:has(title:text("User"))'),
    });

    await expect(userButton).toBeVisible();
  });

  test('should show search functionality', async ({ page }) => {
    await page.goto('/');

    // Check if search button/link exists
    const searchElement = page
      .locator('a[href*="/search"], button')
      .filter({
        has: page.locator('svg'),
      })
      .first();

    await expect(searchElement).toBeVisible();
  });
});
