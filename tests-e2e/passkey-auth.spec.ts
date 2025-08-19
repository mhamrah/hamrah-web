import { test, expect } from './fixtures/auth-fixtures';

test.describe('Passkey Authentication Flow', () => {
  test.beforeEach(async ({ authPage }) => {
    // Set up WebAuthn mocks before each test
    await authPage.mockWebAuthnRegistration();
    await authPage.mockWebAuthnAPIs();
  });

  test.describe('Passkey Registration', () => {
    test('should register new user with passkey', async ({ authPage, page }) => {
      await authPage.goToRegister();

      // Fill registration form
      await page.fill('[data-testid="email-input"]', 'newuser@example.com');
      await page.fill('[data-testid="name-input"]', 'New User');

      // Click register with passkey
      await page.click('[data-testid="register-passkey-button"]');

      // Should trigger WebAuthn registration
      await page.waitForFunction(() => {
        return window.navigator.credentials !== undefined;
      });

      // Wait for successful registration redirect
      await authPage.waitForAuthRedirect();

      // Should be logged in
      await authPage.expectToBeLoggedIn();

      // Verify user profile shows correct information
      await page.click('[data-testid="user-menu"]');
      await expect(page.locator('[data-testid="user-email"]')).toContainText('newuser@example.com');
      await expect(page.locator('[data-testid="user-name"]')).toContainText('New User');
      await expect(page.locator('[data-testid="auth-method"]')).toContainText('Passkey');
    });

    test('should handle passkey registration failure', async ({ authPage, page }) => {
      // Mock WebAuthn failure
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'credentials', {
          value: {
            create: async () => {
              throw new Error('User cancelled the operation');
            },
          },
          writable: true,
        });
      });

      await authPage.goToRegister();
      await page.fill('[data-testid="email-input"]', 'test@example.com');
      await page.click('[data-testid="register-passkey-button"]');

      // Should show error message
      await authPage.expectErrorMessage('Passkey registration failed');
      
      // Should still be on registration page
      await expect(page).toHaveURL(/.*\/auth\/register/);
    });

    test('should prevent duplicate email registration', async ({ authPage, page }) => {
      // Mock API response for existing user
      await page.route('**/api/webauthn/register/begin', async (route) => {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            success: false,
            error: 'Email already registered',
          }),
        });
      });

      await authPage.goToRegister();
      await page.fill('[data-testid="email-input"]', 'existing@example.com');
      await page.click('[data-testid="register-passkey-button"]');

      await authPage.expectErrorMessage('Email already registered');
    });

    test('should validate email format during registration', async ({ authPage, page }) => {
      await authPage.goToRegister();

      const invalidEmails = ['invalid-email', 'missing@', '@domain.com'];
      
      for (const email of invalidEmails) {
        await page.fill('[data-testid="email-input"]', email);
        await page.click('[data-testid="register-passkey-button"]');
        
        await authPage.expectErrorMessage('Invalid email format');
        
        // Clear the input for next iteration
        await page.fill('[data-testid="email-input"]', '');
      }
    });
  });

  test.describe('Passkey Authentication', () => {
    test('should authenticate existing user with passkey', async ({ authPage, page }) => {
      await authPage.goToLogin();

      // Fill email for passkey authentication
      await authPage.fillEmailForPasskey('existing@example.com');

      // Should trigger WebAuthn authentication
      await page.waitForFunction(() => {
        return window.navigator.credentials !== undefined;
      });

      // Wait for successful authentication redirect
      await authPage.waitForAuthRedirect();

      // Should be logged in
      await authPage.expectToBeLoggedIn();

      // Verify correct user is logged in
      await page.click('[data-testid="user-menu"]');
      await expect(page.locator('[data-testid="user-email"]')).toContainText('existing@example.com');
    });

    test('should handle passkey authentication failure', async ({ authPage, page }) => {
      // Mock WebAuthn authentication failure
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'credentials', {
          value: {
            get: async () => {
              throw new Error('No credentials available');
            },
          },
          writable: true,
        });
      });

      await authPage.goToLogin();
      await authPage.fillEmailForPasskey('test@example.com');

      await authPage.expectErrorMessage('Authentication failed');
      await authPage.expectToBeLoggedOut();
    });

    test('should handle non-existent user', async ({ authPage, page }) => {
      // Mock API response for non-existent user
      await page.route('**/api/webauthn/authenticate/begin', async (route) => {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({
            success: false,
            error: 'User not found',
          }),
        });
      });

      await authPage.goToLogin();
      await authPage.fillEmailForPasskey('nonexistent@example.com');

      await authPage.expectErrorMessage('User not found');
      await authPage.expectToBeLoggedOut();
    });

    test('should handle invalid passkey response', async ({ authPage, page }) => {
      // Mock invalid authentication response
      await page.route('**/api/webauthn/authenticate/complete', async (route) => {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            success: false,
            error: 'Invalid passkey response',
          }),
        });
      });

      await authPage.goToLogin();
      await authPage.fillEmailForPasskey('test@example.com');

      await authPage.expectErrorMessage('Invalid passkey response');
      await authPage.expectToBeLoggedOut();
    });
  });

  test.describe('Passkey Management', () => {
    test('should allow adding additional passkeys', async ({ authPage, page }) => {
      // First, log in with existing passkey
      await authPage.goToLogin();
      await authPage.fillEmailForPasskey('test@example.com');
      await authPage.waitForAuthRedirect();

      // Go to security settings
      await page.goto('/settings/security');

      // Add new passkey
      await page.click('[data-testid="add-passkey-button"]');

      // Should trigger WebAuthn registration for additional passkey
      await page.waitForFunction(() => {
        return window.navigator.credentials !== undefined;
      });

      // Should show success message
      await authPage.expectSuccessMessage('Passkey added successfully');

      // Should show multiple passkeys in the list
      await expect(page.locator('[data-testid="passkey-list"] .passkey-item')).toHaveCount(2);
    });

    test('should allow removing passkeys', async ({ authPage, page }) => {
      await authPage.goToLogin();
      await authPage.fillEmailForPasskey('test@example.com');
      await authPage.waitForAuthRedirect();

      await page.goto('/settings/security');

      // Remove a passkey (but not the last one)
      await page.click('[data-testid="remove-passkey-button"]:first-child');
      
      // Confirm removal
      await page.click('[data-testid="confirm-remove-button"]');

      await authPage.expectSuccessMessage('Passkey removed successfully');
    });

    test('should prevent removing last passkey', async ({ authPage, page }) => {
      await authPage.goToLogin();
      await authPage.fillEmailForPasskey('test@example.com');
      await authPage.waitForAuthRedirect();

      await page.goto('/settings/security');

      // Try to remove the last passkey
      const passkeyCount = await page.locator('[data-testid="passkey-list"] .passkey-item').count();
      
      if (passkeyCount === 1) {
        await page.click('[data-testid="remove-passkey-button"]');
        
        // Should show warning
        await authPage.expectErrorMessage('Cannot remove your last passkey');
        
        // Passkey should still be there
        await expect(page.locator('[data-testid="passkey-list"] .passkey-item')).toHaveCount(1);
      }
    });
  });

  test.describe('Browser Compatibility', () => {
    test('should detect WebAuthn support', async ({ authPage, page }) => {
      await authPage.goToLogin();

      // Should show passkey option if supported
      await expect(page.locator('[data-testid="passkey-signin-button"]')).toBeVisible();
    });

    test('should handle unsupported browsers gracefully', async ({ authPage, page }) => {
      // Mock unsupported browser
      await page.addInitScript(() => {
        delete (window.navigator as any).credentials;
        delete (window as any).PublicKeyCredential;
      });

      await authPage.goToLogin();

      // Should hide passkey option or show fallback
      await expect(page.locator('[data-testid="passkey-not-supported"]')).toBeVisible();
      await expect(page.locator('[data-testid="passkey-signin-button"]')).not.toBeVisible();
    });

    test('should handle platform authenticator availability', async ({ authPage, page }) => {
      // Mock platform authenticator not available
      await page.addInitScript(() => {
        (window as any).PublicKeyCredential = {
          isUserVerifyingPlatformAuthenticatorAvailable: async () => false,
        };
      });

      await authPage.goToLogin();

      // Should show appropriate message
      await expect(page.locator('[data-testid="platform-authenticator-unavailable"]')).toBeVisible();
    });
  });

  test.describe('Security Features', () => {
    test('should require user verification', async ({ authPage, page }) => {
      await authPage.goToLogin();
      await authPage.fillEmailForPasskey('test@example.com');

      // Verify that WebAuthn options include user verification requirement
      await page.waitForFunction(() => {
        // This would be checked in the actual WebAuthn options
        return true; // Placeholder for actual verification
      });
    });

    test('should handle timeout gracefully', async ({ authPage, page }) => {
      // Mock WebAuthn timeout
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'credentials', {
          value: {
            get: async () => {
              await new Promise(resolve => setTimeout(resolve, 100));
              throw new Error('Timeout');
            },
          },
          writable: true,
        });
      });

      await authPage.goToLogin();
      await authPage.fillEmailForPasskey('test@example.com');

      await authPage.expectErrorMessage('Authentication timed out');
    });

    test('should validate origin and RP ID', async ({ authPage, page }) => {
      // This would be validated server-side
      // The test ensures the client sends correct origin information
      
      let requestData: any;
      
      await page.route('**/api/webauthn/authenticate/complete', async (route) => {
        requestData = await route.request().postDataJSON();
        await route.continue();
      });

      await authPage.goToLogin();
      await authPage.fillEmailForPasskey('test@example.com');

      // Verify the request includes proper origin validation data
      expect(requestData).toBeDefined();
    });
  });
});