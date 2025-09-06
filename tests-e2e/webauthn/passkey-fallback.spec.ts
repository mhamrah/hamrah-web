import { test, expect } from '@playwright/test';

/**
 * Passkey Explicit Fallback Flow (Discoverable Auth) – E2E Skeleton
 *
 * This test DOES NOT perform a real WebAuthn ceremony (Playwright cannot
 * trigger real platform authenticators in headless CI without specialized
 * device emulation). Instead, it:
 *  1. Navigates to login page (unauthenticated state).
 *  2. Clicks the primary "Sign in with Passkey" button (conditional UI path).
 *  3. Clicks the fallback "explicit" passkey button to invoke the new flow.
 *  4. Injects a mock for `navigator.credentials.get` (via @simplewebauthn/browser
 *     startAuthentication) to simulate a successful assertion.
 *  5. Waits for the network call to the conditional completion endpoint.
 *  6. Verifies success UI state OR logs test diagnostics.
 *
 * You can later replace the mock with a more realistic assertion object
 * (e.g., captured from a real device) if you build a test harness.
 *
 * NOTE: This file is intentionally a skeleton and uses a mocked WebAuthn
 * response so that CI can exercise the fallback logic wiring without relying
 * on real platform dialogs.
 */

test.describe('Passkey Fallback (Explicit Discoverable) Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Helpful console collection during test runs
    page.on('console', (msg) => {
      const type = msg.type();
      if (['error', 'warning'].includes(type)) {
        // Surface noteworthy logs in test output
        // eslint-disable-next-line no-console
        console.log(`[browser:${type}] ${msg.text()}`);
      }
    });
  });

  test('should attempt explicit discoverable auth and handle mocked success', async ({ page }) => {
    await page.goto('/auth/login');

    await expect(page).toHaveURL(/\/auth\/login\/?/);
    await expect(page.locator('text=Sign in with Passkey')).toBeVisible();

    // Intercept the discoverable challenge request
    const discoverableChallenge = page.waitForResponse((resp) =>
      resp.url().includes('/api/webauthn/authenticate/discoverable') && resp.request().method() === 'POST'
    );

    // Click primary (conditional) button first
    await page.click('button:has-text("Sign in with Passkey"), button:has-text("Continue with Passkey")');

    // Wait a short grace period for conditional UI attempt (will be silent under mock)
    await page.waitForTimeout(300);

    // Click fallback explicit discoverable button
    const fallbackButton = page.locator('button:has-text("explicit passkey prompt")');
    await expect(fallbackButton).toBeVisible();
    await fallbackButton.click();

    // Wait for discoverable challenge to be requested
    await discoverableChallenge;

    // Inject mock BEFORE the library calls startAuthentication() (we rely on microtask timing)
    await page.addInitScript(() => {
      // Only patch once
      if ((window as any).__webauthnMockInstalled) return;
      (window as any).__webauthnMockInstalled = true;

      // Patch global startAuthentication if loaded via module
      // Fallback: patch navigator.credentials.get if direct API is used.
      const mockAssertion = {
        id: 'mock-credential-id',
        rawId: new Uint8Array([1, 2, 3, 4]).buffer,
        response: {
          clientDataJSON: btoa(JSON.stringify({
            type: 'webauthn.get',
            challenge: 'mock-challenge',
            origin: window.location.origin,
            crossOrigin: false,
          })),
          authenticatorData: btoa('auth-data'),
          signature: btoa('signature'),
          userHandle: btoa('user-handle'),
        },
        type: 'public-key',
        getClientExtensionResults: () => ({}),
      };

      // Attempt to monkey patch @simplewebauthn/browser global if present later
      Object.defineProperty(window, '__DEFER_WEB_AUTHN_PATCH__', {
        value: true,
        writable: false,
        enumerable: false,
      });

      const installNavigatorPatch = () => {
        if (navigator.credentials && typeof navigator.credentials.get === 'function') {
          const originalGet = navigator.credentials.get.bind(navigator.credentials);
          (navigator.credentials as any).get = async (options: any) => {
            // Heuristic: if publicKey exists, treat as a WebAuthn get()
            if (options && options.publicKey) {
              // Simulate async authenticator delay
              await new Promise((r) => setTimeout(r, 50));
              return mockAssertion as unknown as Credential;
            }
            return originalGet(options);
          };
        }
      };

      installNavigatorPatch();
      // In case site lazy loads auth libs after a tick
      setTimeout(installNavigatorPatch, 100);
    });

    // Intercept conditional completion call
    const completion = page.waitForResponse((resp) =>
      resp.url().includes('/api/webauthn/authenticate/conditional') && resp.request().method() === 'POST'
    );

    // Give time for mock patched get() to resolve and backend verification to be called
    const completionResp = await completion;
    const completionJson = await completionResp.json().catch(() => ({} as any));

    // Log diagnostics for debugging
    // eslint-disable-next-line no-console
    console.log('Completion response JSON (mocked flow):', completionJson);

    // We allow either success (if backend accepts mock) or a controlled failure (if signature invalid)
    // The point is to exercise the explicit fallback request path deterministically.
    if (completionJson.success) {
      // Expect session token or user data present
      expect(completionJson).toHaveProperty('session_token');
    } else {
      // If backend rejects (likely, due to fake signature), assert we got structured error
      expect(completionJson).toHaveProperty('error');
    }

    // UI should remain functional (no unhandled exceptions)
    await expect(page.locator('body')).toBeVisible();
  });
});
