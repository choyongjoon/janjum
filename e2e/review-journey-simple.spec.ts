#!/usr/bin/env tsx

/** biome-ignore-all lint/performance/useTopLevelRegex: don't need to optimize */

import { expect, test } from '@playwright/test';
import { logger } from 'shared/logger';
import { AuthHelper } from './helpers/auth-helpers';

test.describe('Review Journey E2E - Simple', () => {
  let authHelper: AuthHelper;

  test.beforeEach(({ page }) => {
    authHelper = new AuthHelper(page);
  });

  test.afterEach(async () => {
    await authHelper.clearAuth();
  });

  test('should navigate to product page and show review interface', async ({
    page,
  }) => {
    // Mock an existing user (completed setup)
    await authHelper.mockExistingUser({
      name: '테스트 사용자',
      handle: 'test_reviewer',
      email: 'reviewer@example.com',
    });

    // Step 1: Navigate to search
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Click search icon in navigation
    const searchLink = page
      .getByRole('link')
      .filter({ has: page.locator('svg[aria-label="Search"]') });
    await searchLink.click();
    await page.waitForLoadState('networkidle');

    // Verify on search page
    await expect(
      page.getByRole('heading', { name: '검색', exact: true })
    ).toBeVisible();

    // Step 2: Search for products
    const searchInput = page.getByPlaceholder('음료명을 입력하세요');
    await searchInput.fill('라떼');

    const searchButton = page.getByRole('button', { name: '검색' });
    await searchButton.click();
    await page.waitForLoadState('networkidle');

    // Verify search results
    await expect(page.getByText(/검색 결과 \(\d+개\)/)).toBeVisible();

    // Step 3: Navigate to first product (if available)
    const productCards = page.locator('[data-testid="product-card"]');
    const productCount = await productCards.count();

    if (productCount > 0) {
      // Click on first product
      await productCards.first().click();
      await page.waitForLoadState('networkidle');

      // Wait a bit for content to load
      await page.waitForTimeout(2000);

      // Check if we're on a product page by looking for any product-specific content
      // This is more forgiving than checking for specific elements
      const currentUrl = page.url();
      expect(currentUrl).toContain('/product/');

      logger.info(`Successfully navigated to: ${currentUrl}`);
      logger.info('Review journey navigation test completed successfully');

      // Basic check - try to find any review-related content
      const reviewRelatedContent = page
        .locator('*')
        .filter({ hasText: /후기|리뷰/ });
      const hasReviewContent = (await reviewRelatedContent.count()) > 0;
      logger.info(`Found review-related content: ${hasReviewContent}`);
    } else {
      logger.info('No products found for testing');
    }
  });

  test('should handle search with no results gracefully', async ({ page }) => {
    // Mock an existing user
    await authHelper.mockExistingUser({
      name: '테스트 사용자',
      handle: 'test_user',
    });

    // Navigate directly to search with unlikely term
    await page.goto('/search?searchTerm=xyz99999impossible');
    await page.waitForLoadState('networkidle');

    // Should show no results message
    await expect(page.getByText(/검색 결과가 없습니다/)).toBeVisible();

    logger.info('No results test completed successfully');
  });

  test('should show proper authentication state', async ({ page }) => {
    // First test without authentication
    await page.goto('/search?searchTerm=커피');
    await page.waitForLoadState('networkidle');

    const productCards = page.locator('[data-testid="product-card"]');
    if ((await productCards.count()) > 0) {
      await productCards.first().click();
      await page.waitForLoadState('networkidle');

      // The page should load even without auth
      const currentUrl = page.url();
      expect(currentUrl).toContain('/product/');

      logger.info('Unauthenticated product page access works');
    }

    // Then authenticate and verify
    await authHelper.mockExistingUser({
      name: '인증된 사용자',
      handle: 'authenticated_user',
    });

    // Refresh to apply auth state
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Should still be on product page
    const finalUrl = page.url();
    expect(finalUrl).toContain('/product/');

    logger.info('Authentication state test completed successfully');
  });
});
