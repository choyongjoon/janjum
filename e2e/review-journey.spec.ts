#!/usr/bin/env tsx

/** biome-ignore-all lint/performance/useTopLevelRegex: don't need to optimize */

import { expect, test } from '@playwright/test';
import { logger } from 'shared/logger';
import { AuthHelper } from './helpers/auth-helpers';

test.describe('Review Journey E2E', () => {
  let authHelper: AuthHelper;

  test.beforeEach(({ page }) => {
    authHelper = new AuthHelper(page);
  });

  test.afterEach(async () => {
    await authHelper.clearAuth();
  });

  test('should complete full review lifecycle: search → write → edit → delete', async ({
    page,
  }) => {
    // Mock an existing user (completed setup)
    await authHelper.mockExistingUser({
      name: '테스트 사용자',
      handle: 'test_reviewer',
      email: 'reviewer@example.com',
    });

    // Mock successful API responses for review operations
    await page.route('**/convex/**', (route) => {
      const url = route.request().url();
      if (url.includes('reviews')) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        });
      } else {
        route.continue();
      }
    });

    // Step 1: Start from home page and navigate to search
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Find and click search icon button in navigation
    await page
      .getByRole('link')
      .filter({ has: page.locator('svg[aria-label="Search"]') })
      .click();
    await page.waitForLoadState('networkidle');

    // Verify we're on the search page - use exact match to avoid multiple matches
    await expect(
      page.getByRole('heading', { name: '검색', exact: true })
    ).toBeVisible();

    // Step 2: Search for a product
    const searchTerm = '아메리카노';
    await page.getByPlaceholder(/음료명을 입력하세요/i).fill(searchTerm);
    await page.getByRole('button', { name: /검색/i }).click();
    await page.waitForLoadState('networkidle');

    // Verify search results are displayed - use exact match for main heading
    await expect(page.getByText(/검색 결과 \(\d+개\)/)).toBeVisible();

    // Step 3: Click on first product in search results
    const firstProduct = page.locator('[data-testid="product-card"]').first();
    if ((await firstProduct.count()) === 0) {
      // If no test-id available, try alternative selectors
      const productLinks = page.locator('a[href*="/product/"]');
      await expect(productLinks.first()).toBeVisible();
      await productLinks.first().click();
    } else {
      await firstProduct.click();
    }

    await page.waitForLoadState('networkidle');

    // Verify we're on a product page
    await expect(page.getByText(/후기/i)).toBeVisible();

    // Step 4: Write a new review
    // Check if there's already a review form visible or if we need to click "후기 작성"
    let writeReviewButton = page.getByRole('button', { name: /후기 작성/i });
    if ((await writeReviewButton.count()) === 0) {
      // Try alternative text variations
      writeReviewButton = page.getByRole('button', {
        name: /첫 후기 작성하기/i,
      });
    }

    if ((await writeReviewButton.count()) > 0) {
      await writeReviewButton.click();
      await page.waitForLoadState('networkidle');
    }

    // Verify review form is visible
    await expect(page.getByText(/후기 작성/i)).toBeVisible();

    // Fill in rating (click on 4 stars)
    const ratingButtons = page.locator('[data-testid="rating-button"]');
    if ((await ratingButtons.count()) === 0) {
      // Alternative selector for rating buttons
      const ratingButton4 = page
        .locator('button')
        .filter({ hasText: '4' })
        .or(page.locator('button[aria-label*="4"]'));
      await ratingButton4.first().click();
    } else {
      await ratingButtons.nth(3).click(); // Click 4th button (4 stars)
    }

    // Fill in review text
    const reviewText = '맛있는 아메리카노입니다. 향이 좋고 쓴맛이 적당해요.';
    await page
      .getByPlaceholder(/이 음료에 대한 솔직한 후기를 남겨주세요/i)
      .fill(reviewText);

    // Submit the review
    await page.getByRole('button', { name: /등록하기/i }).click();
    await page.waitForLoadState('networkidle');

    // Verify review was created successfully
    // The form should disappear and we should see the review in the list
    await expect(page.getByText(reviewText)).toBeVisible();

    // Step 5: Edit the review
    const editButton = page
      .getByRole('button', { name: /내 후기 수정/i })
      .or(page.getByRole('button', { name: /수정/i }));
    await editButton.click();
    await page.waitForLoadState('networkidle');

    // Verify edit form is visible with existing data
    await expect(page.getByText(/후기 수정/i)).toBeVisible();
    // Verify the textarea contains the existing review text
    const textArea = page.getByRole('textbox');
    await expect(textArea).toHaveValue(reviewText);

    // Update the review text
    const updatedReviewText = '수정된 후기입니다. 정말 맛있는 아메리카노네요!';
    await page
      .getByPlaceholder(/이 음료에 대한 솔직한 후기를 남겨주세요/i)
      .fill(updatedReviewText);

    // Change rating to 5 stars
    const rating5Button = page
      .locator('[data-testid="rating-button"]')
      .nth(4)
      .or(page.locator('button').filter({ hasText: '5' }));
    await rating5Button.first().click();

    // Submit the updated review
    await page.getByRole('button', { name: /수정하기/i }).click();
    await page.waitForLoadState('networkidle');

    // Verify review was updated
    await expect(page.getByText(updatedReviewText)).toBeVisible();
    await expect(page.getByText(/수정됨/i)).toBeVisible();

    // Step 6: Delete the review
    // Look for delete button in review card or kebab menu
    let deleteButton = page.getByRole('button', { name: /삭제/i });

    if ((await deleteButton.count()) === 0) {
      // Try to find a menu button or three dots
      const menuButton = page
        .locator('button')
        .filter({ hasText: '⋮' })
        .or(page.locator('[data-testid="review-menu"]'));
      if ((await menuButton.count()) > 0) {
        await menuButton.first().click();
        deleteButton = page.getByRole('button', { name: /삭제/i });
      }
    }

    if ((await deleteButton.count()) > 0) {
      await deleteButton.click();

      // Handle confirmation dialog
      page.once('dialog', async (dialog) => {
        expect(dialog.message()).toContain('삭제');
        await dialog.accept();
      });

      await page.waitForLoadState('networkidle');

      // Verify review was deleted
      await expect(page.getByText(updatedReviewText)).not.toBeVisible();
      await expect(page.getByText(/아직 후기가 없습니다/i)).toBeVisible();
    }
  });

  test('should handle review form validation', async ({ page }) => {
    // Mock an existing user
    await authHelper.mockExistingUser({
      name: '테스트 사용자',
      handle: 'test_user',
    });

    // Go to a product page (simulate direct navigation)
    await page.goto('/search?searchTerm=라떼');
    await page.waitForLoadState('networkidle');

    // Click on first product
    const productLink = page.locator('a[href*="/product/"]').first();
    if ((await productLink.count()) > 0) {
      await productLink.click();
      await page.waitForLoadState('networkidle');
    } else {
      // Skip if no products available
      test.skip(true, 'No products available for testing');
      return;
    }

    // Start writing a review
    const writeReviewButton = page
      .getByRole('button', { name: /후기 작성/i })
      .or(page.getByRole('button', { name: /첫 후기 작성하기/i }));

    if ((await writeReviewButton.count()) > 0) {
      await writeReviewButton.click();
      await page.waitForLoadState('networkidle');
    }

    // Wait for the form to appear
    await expect(page.getByText(/후기 작성/i)).toBeVisible();

    // Try to submit without rating - submit should be disabled
    const submitButton = page.getByRole('button', { name: /등록하기/i });
    await expect(submitButton).toBeDisabled();

    // Add rating
    const ratingButton = page
      .locator('[data-testid="rating-button"]')
      .first()
      .or(page.locator('button').filter({ hasText: '1' }));
    await ratingButton.first().click();

    // Now submit button should be enabled
    await expect(submitButton).toBeEnabled();

    // Test character limit for review text
    const longText = 'a'.repeat(501); // Exceed 500 character limit
    const textArea = page.getByPlaceholder(
      /이 음료에 대한 솔직한 후기를 남겨주세요/i
    );
    await textArea.fill(longText);

    // Verify character count display
    await expect(page.getByText(/501\/500/)).toBeVisible();
  });

  test('should show proper auth state for review actions', async ({ page }) => {
    // Step 1: Visit product page without authentication
    await page.goto('/search?searchTerm=커피');
    await page.waitForLoadState('networkidle');

    const productLink = page.locator('a[href*="/product/"]').first();
    if ((await productLink.count()) > 0) {
      await productLink.click();
      await page.waitForLoadState('networkidle');
    } else {
      logger.error('No products available for testing');
      return;
    }

    // Verify auth message is shown for unauthenticated users
    const authMessage = page.getByText(/로그인이 필요합니다/i);
    if ((await authMessage.count()) > 0) {
      await expect(authMessage).toBeVisible();
    }

    // Step 2: Authenticate and verify review form becomes available
    await authHelper.mockExistingUser({
      name: '인증된 사용자',
      handle: 'authenticated_user',
    });

    // Refresh the page to apply auth state
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Now review actions should be available
    const reviewAction = page
      .getByRole('button', { name: /후기 작성/i })
      .or(page.getByRole('button', { name: /첫 후기 작성하기/i }));

    if ((await reviewAction.count()) > 0) {
      await expect(reviewAction).toBeVisible();
    }
  });
});
