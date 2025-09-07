import { test, expect } from '@playwright/test';

/**
 * Passkey Explicit (Single Button) Flow – E2E Skeleton
 *
 * This test exercises the explicit discoverable passkey authentication pathway.
 *
 * Notes:
 * - Real platform authenticator UI cannot be triggered in headless CI; we mock the WebAuthn call.
 * - We intercept:
 *    1. The discoverable "begin" challenge request:  POST /api/webauthn/authenticate/discoverable
 *    2. The verification/complete request:           POST /api/webauthn/authenticate/discoverable/verify
 * - We monkey‑patch navigator.credentials.get (or the underlying call used by @simplewebauthn/browser)
 *   to return a synthetic assertion object.
 *
 * Success Criteria:
 * - Both network calls occur.
 * - The verify response returns either success (unlikely with fake signature unless backend relaxed)
 *   or a structured error object. Either case is acceptable; the goal is to ensure wiring is intact.
 */

test.describe('Explicit Passkey Auth (Single Button)', () => {
  test.beforeEach(async ({ page }) => {
    // Capture browser console noise for debugging CI issues
    page.on('console', (msg) => {
      const t = msg.type();
      if (['error', 'warning'].includes(t)) {
        // eslint-disable-next-line no-console
        console.log(`[browser:${t}] ${msg.text()}`);
      }
    });

    // Install WebAuthn mock before any app bundles execute
    await page.addInitScript(() => {
      if ((window as any).__webauthnMockInstalled) return;
      (window as any).__webauthnMockInstalled = true;

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

      const patch = () => {
        if (navigator.credentials && typeof navigator.credentials.get === 'function') {
          const originalGet = navigator.credentials.get.bind(navigator.credentials);
          (navigator.credentials as any).get = async (options: any) => {
            // Heuristic: if it looks like a WebAuthn publicKey request, return mock
            if (options && options.publicKey) {
              await new Promise((r) => setTimeout(r, 25)); // simulate async delay
              return mockAssertion as unknown as Credential;
            }
            return originalGet(options);
          };
        }
      };

      patch();
      // Re-try shortly in case app lazily hydrates / polyfills later
      setTimeout(patch, 100);
    });
  });

  test('should perform explicit discoverable passkey flow (mocked)', async ({ page }) => {
    await page.goto('/auth/login');

    // Basic page check
    await expect(page).toHaveURL(/\/auth\/login\/?/);
    const passkeyButton = page.locator('button:has-text("Sign in with Passkey")');
    await expect(passkeyButton).toBeVisible();

    // Prepare network intercepts
    const beginPromise = page.waitForResponse((resp) =>
      resp.url().includes('/api/webauthn/authenticate/discoverable') &&
      resp.request().method() === 'POST'
    );

    const verifyPromise = page.waitForResponse((resp) =>
      resp.url().includes('/api/webauthn/authenticate/discoverable/verify') &&
      resp.request().method() === 'POST'
    );

    // Trigger explicit passkey auth
    await passkeyButton.click();

    const beginResp = await beginPromise;
    const beginJson = await beginResp.json().catch(() => ({}));
    // eslint-disable-next-line no-console
    console.log('Begin (discoverable) response:', beginJson);

    expect(beginJson).toHaveProperty('success');

    const verifyResp = await verifyPromise;
    const verifyJson = await verifyResp.json().catch(() => ({}));
    // eslint-disable-next-line no-console
    console.log('Verify (discoverable) response:', verifyJson);

    // We accept either success (unlikely) or a structured failure.
    expect(verifyJson).toHaveProperty('success');
    if (!verifyJson.success) {
      expect(verifyJson).toHaveProperty('error');
    }

    // Page should remain interactive
    await expect(page.locator('body')).toBeVisible();
  });
});
