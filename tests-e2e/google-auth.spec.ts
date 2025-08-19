import { test, expect } from './fixtures/auth-fixtures';

test.describe('Google OAuth Authentication Flow', () => {
  test.beforeEach(async ({ authPage }) => {
    // Set up Google OAuth mocks before each test
    await authPage.mockGoogleOAuth();
  });

  test.describe('Google Sign-In', () => {
    test('should authenticate new user with Google', async ({ authPage, page }) => {
      await authPage.goToLogin();

      // Mock successful Google OAuth flow
      await page.route('**/auth/google', async (route) => {
        await route.fulfill({
          status: 302,
          headers: {
            'Location': '/auth/google/callback?code=mock_auth_code&state=mock_state',
          },
        });
      });

      await page.route('**/auth/google/callback*', async (route) => {
        // Mock successful token exchange and user creation
        await route.fulfill({
          status: 302,
          headers: {
            'Location': '/?auth=success&user=new',
          },
        });
      });

      // Click Google sign-in button
      await authPage.clickGoogleSignIn();

      // Wait for OAuth flow completion
      await authPage.waitForAuthRedirect();

      // Should be logged in
      await authPage.expectToBeLoggedIn();

      // Verify user profile shows Google authentication
      await page.click('[data-testid="user-menu"]');
      await expect(page.locator('[data-testid="auth-method"]')).toContainText('Google');
    });

    test('should authenticate existing user with Google', async ({ authPage, page }) => {
      await authPage.goToLogin();

      // Mock Google OAuth for existing user
      await page.route('**/auth/google/callback*', async (route) => {
        await route.fulfill({
          status: 302,
          headers: {
            'Location': '/?auth=success&user=existing',
          },
        });
      });

      await authPage.clickGoogleSignIn();
      await authPage.waitForAuthRedirect();

      await authPage.expectToBeLoggedIn();

      // Verify it's the existing user
      await page.click('[data-testid="user-menu"]');
      await expect(page.locator('[data-testid="user-email"]')).toBeVisible();
    });

    test('should handle Google OAuth cancellation', async ({ authPage, page }) => {
      await authPage.goToLogin();

      // Mock user cancelling Google OAuth
      await page.route('**/auth/google', async (route) => {
        await route.fulfill({
          status: 302,
          headers: {
            'Location': '/auth/login?error=access_denied&error_description=User%20cancelled',
          },
        });
      });

      await authPage.clickGoogleSignIn();

      // Should show error message
      await authPage.expectErrorMessage('Authentication was cancelled');
      await authPage.expectToBeLoggedOut();
    });

    test('should handle Google OAuth errors', async ({ authPage, page }) => {
      await authPage.goToLogin();

      // Mock Google OAuth error
      await page.route('**/auth/google', async (route) => {
        await route.fulfill({
          status: 302,
          headers: {
            'Location': '/auth/login?error=invalid_request&error_description=Invalid%20OAuth%20request',
          },
        });
      });

      await authPage.clickGoogleSignIn();

      await authPage.expectErrorMessage('OAuth authentication failed');
      await authPage.expectToBeLoggedOut();
    });

    test('should handle server-side Google token verification failure', async ({ authPage, page }) => {
      await authPage.goToLogin();

      // Mock server-side verification failure
      await page.route('**/auth/google/callback*', async (route) => {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'invalid_token',
            error_description: 'Invalid Google token',
          }),
        });
      });

      await authPage.clickGoogleSignIn();

      await authPage.expectErrorMessage('Invalid Google token');
      await authPage.expectToBeLoggedOut();
    });
  });

  test.describe('Account Linking', () => {
    test('should link Google account to existing passkey user', async ({ authPage, page }) => {
      // First create a user with passkey
      await page.goto('/auth/register');
      await page.fill('[data-testid="email-input"]', 'user@example.com');
      await page.click('[data-testid="register-passkey-button"]');
      await authPage.waitForAuthRedirect();
      
      // Logout
      await authPage.logout();

      // Now login with Google using same email
      await authPage.goToLogin();

      await page.route('**/auth/google/callback*', async (route) => {
        // Mock Google OAuth returning same email
        await route.fulfill({
          status: 302,
          headers: {
            'Location': '/?auth=success&linked=true',
          },
        });
      });

      await authPage.clickGoogleSignIn();
      await authPage.waitForAuthRedirect();

      await authPage.expectToBeLoggedIn();

      // Verify account shows both auth methods
      await page.click('[data-testid="user-menu"]');
      await page.click('[data-testid="account-settings"]');
      
      await expect(page.locator('[data-testid="google-linked"]')).toBeVisible();
      await expect(page.locator('[data-testid="passkey-enabled"]')).toBeVisible();
    });

    test('should handle email mismatch during account linking', async ({ authPage, page }) => {
      // Mock Google returning different email than existing account
      await page.route('**/auth/google/callback*', async (route) => {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'email_mismatch',
            error_description: 'Google email does not match existing account',
          }),
        });
      });

      await authPage.goToLogin();
      await authPage.clickGoogleSignIn();

      await authPage.expectErrorMessage('Email does not match existing account');
    });
  });

  test.describe('Google Profile Data', () => {
    test('should update user profile with Google data', async ({ authPage, page }) => {
      await authPage.goToLogin();

      // Mock Google OAuth with complete profile data
      await page.route('**/auth/google/callback*', async (route) => {
        const url = new URL(route.request().url());
        
        // Mock the server processing Google profile data
        await route.fulfill({
          status: 302,
          headers: {
            'Location': '/?auth=success&profile=updated',
          },
        });
      });

      await authPage.clickGoogleSignIn();
      await authPage.waitForAuthRedirect();

      // Check that profile was updated
      await page.click('[data-testid="user-menu"]');
      await expect(page.locator('[data-testid="user-name"]')).toBeVisible();
      await expect(page.locator('[data-testid="user-avatar"]')).toBeVisible();
    });

    test('should handle partial Google profile data', async ({ authPage, page }) => {
      await authPage.goToLogin();

      // Mock Google OAuth with minimal profile data (just email)
      await page.route('**/auth/google/callback*', async (route) => {
        await route.fulfill({
          status: 302,
          headers: {
            'Location': '/?auth=success&profile=minimal',
          },
        });
      });

      await authPage.clickGoogleSignIn();
      await authPage.waitForAuthRedirect();

      await authPage.expectToBeLoggedIn();
      // Should still work with minimal profile data
    });
  });

  test.describe('OAuth Security', () => {
    test('should validate state parameter', async ({ authPage, page }) => {
      await authPage.goToLogin();

      // Mock OAuth callback with invalid state
      await page.route('**/auth/google/callback*', async (route) => {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'invalid_state',
            error_description: 'State parameter validation failed',
          }),
        });
      });

      await authPage.clickGoogleSignIn();

      await authPage.expectErrorMessage('State parameter validation failed');
      await authPage.expectToBeLoggedOut();
    });

    test('should handle CSRF protection', async ({ authPage, page }) => {
      await authPage.goToLogin();

      // Mock CSRF token mismatch
      await page.route('**/auth/google/callback*', async (route) => {
        await route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'csrf_failure',
            error_description: 'CSRF token validation failed',
          }),
        });
      });

      await authPage.clickGoogleSignIn();

      await authPage.expectErrorMessage('Security validation failed');
    });

    test('should validate OAuth redirect URI', async ({ authPage, page }) => {
      // Mock invalid redirect URI attack
      await page.route('**/auth/google', async (route) => {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'invalid_redirect_uri',
            error_description: 'Redirect URI not whitelisted',
          }),
        });
      });

      await authPage.goToLogin();
      await authPage.clickGoogleSignIn();

      await authPage.expectErrorMessage('Invalid OAuth configuration');
    });
  });

  test.describe('Google API Integration', () => {
    test('should handle Google API rate limiting', async ({ authPage, page }) => {
      await authPage.goToLogin();

      // Mock Google API rate limit response
      await page.route('**/auth/google/callback*', async (route) => {
        await route.fulfill({
          status: 429,
          headers: {
            'Retry-After': '60',
          },
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'rate_limit_exceeded',
            error_description: 'Google API rate limit exceeded',
          }),
        });
      });

      await authPage.clickGoogleSignIn();

      await authPage.expectErrorMessage('Service temporarily unavailable');
    });

    test('should handle Google service outage', async ({ authPage, page }) => {
      await authPage.goToLogin();

      // Mock Google service being down
      await page.route('**/auth/google', async (route) => {
        await route.abort('failed');
      });

      await authPage.clickGoogleSignIn();

      await authPage.expectErrorMessage('Google authentication service unavailable');
    });

    test('should handle token refresh flow', async ({ authPage, page }) => {
      // Login first
      await authPage.goToLogin();
      await authPage.clickGoogleSignIn();
      await authPage.waitForAuthRedirect();
      await authPage.expectToBeLoggedIn();

      // Mock token expiration and refresh
      await page.route('**/api/auth/refresh', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            accessToken: 'new-access-token',
            refreshToken: 'new-refresh-token',
          }),
        });
      });

      // Trigger a protected action that requires token refresh
      await page.click('[data-testid="protected-action"]');

      // Should automatically refresh token and continue
      await expect(page.locator('[data-testid="action-result"]')).toBeVisible();
    });
  });

  test.describe('User Experience', () => {
    test('should show loading state during OAuth flow', async ({ authPage, page }) => {
      await authPage.goToLogin();

      // Add delay to OAuth response to test loading state
      await page.route('**/auth/google', async (route) => {
        await new Promise(resolve => setTimeout(resolve, 1000));
        await route.fulfill({
          status: 302,
          headers: {
            'Location': '/auth/google/callback?code=mock_code&state=mock_state',
          },
        });
      });

      await authPage.clickGoogleSignIn();

      // Should show loading indicator
      await expect(page.locator('[data-testid="auth-loading"]')).toBeVisible();
    });

    test('should preserve redirect after successful authentication', async ({ authPage, page }) => {
      // Try to access protected page
      await page.goto('/protected-page');

      // Should redirect to login
      await authPage.expectToBeLoggedOut();

      // Login with Google
      await authPage.clickGoogleSignIn();
      await authPage.waitForAuthRedirect();

      // Should redirect back to originally requested page
      await expect(page).toHaveURL('/protected-page');
    });

    test('should handle popup blockers gracefully', async ({ authPage, page }) => {
      // Mock popup being blocked
      await page.addInitScript(() => {
        window.open = () => null; // Simulate popup blocker
      });

      await authPage.goToLogin();
      await authPage.clickGoogleSignIn();

      // Should show popup blocker message
      await expect(page.locator('[data-testid="popup-blocked-message"]')).toBeVisible();
      await expect(page.locator('[data-testid="enable-popups-instructions"]')).toBeVisible();
    });
  });
});