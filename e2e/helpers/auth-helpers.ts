import type { Page } from '@playwright/test';
import './window-types';

export interface MockUser {
  id: string;
  email: string;
  name?: string;
  handle?: string;
  hasCompletedSetup: boolean;
  firstName?: string;
  lastName?: string;
}

export class AuthHelper {
  private page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * Mock an authenticated user state
   */
  async mockAuthenticatedUser(userData: MockUser) {
    await this.page.addInitScript((data) => {
      // Mock Clerk authentication state
      window.__clerk_publishable_key = 'pk_test_mock';

      // Store mock user data globally
      window.__mock_user_data = {
        isSignedIn: true,
        user: {
          id: data.id,
          emailAddresses: [{ emailAddress: data.email }],
          firstName: data.firstName || data.name?.split(' ')[0] || null,
          lastName:
            data.lastName || data.name?.split(' ').slice(1).join(' ') || null,
        },
        // Convex user data
        name: data.name || '',
        handle: data.handle || '',
        hasCompletedSetup: data.hasCompletedSetup,
      };

      // Mock localStorage auth tokens
      try {
        localStorage.setItem('__clerk_client_jwt', 'mock-jwt-token');
        localStorage.setItem('__clerk_user_id', data.id);
      } catch {
        // Auth token setting failed
      }
    }, userData);
  }

  /**
   * Create a new user (authenticated but needs setup)
   */
  async mockNewUser(overrides: Partial<MockUser> = {}) {
    const newUser: MockUser = {
      id: `user_new_${Date.now()}`,
      email: 'newuser@example.com',
      hasCompletedSetup: false,
      ...overrides,
    };

    await this.mockAuthenticatedUser(newUser);
    return newUser;
  }

  /**
   * Create an existing user (authenticated with completed setup)
   */
  async mockExistingUser(overrides: Partial<MockUser> = {}) {
    const existingUser: MockUser = {
      id: `user_existing_${Date.now()}`,
      email: 'existing@example.com',
      name: '기존 사용자',
      handle: 'existing_user',
      hasCompletedSetup: true,
      ...overrides,
    };

    await this.mockAuthenticatedUser(existingUser);
    return existingUser;
  }

  /**
   * Clear all authentication state
   */
  async clearAuth() {
    await this.page.context().clearCookies();
    await this.page.evaluate(() => {
      try {
        localStorage.clear();
        sessionStorage.clear();
        window.__mock_user_data = undefined;
      } catch {
        // Auth state clear failed
      }
    });
  }

  /**
   * Mock API responses for settings form submission
   */
  async mockApiResponse(success: boolean, data?: Record<string, unknown>) {
    const responseBody = success
      ? { success: true, ...data }
      : { error: '처리 중 오류가 발생했습니다.', ...data };

    await this.page.route('**/api/**', (route) => {
      route.fulfill({
        status: success ? 200 : 400,
        contentType: 'application/json',
        body: JSON.stringify(responseBody),
      });
    });
  }

  /**
   * Mock slow API response to test loading states
   */
  async mockSlowApiResponse(delayMs = 2000) {
    await this.page.route('**/api/**', (route) => {
      setTimeout(() => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        });
      }, delayMs);
    });
  }
}
