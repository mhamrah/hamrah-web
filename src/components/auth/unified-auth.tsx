import {
  component$,
  useSignal,
  $,
  type QRL,
  useVisibleTask$,
} from "@builder.io/qwik";
import { PasskeyLogin } from "./passkey-login";
import { PasskeySignup } from "./passkey-signup";
import { WebAuthnClient, webauthnClient } from "~/lib/auth/webauthn";

interface UnifiedAuthProps {
  onSuccess?: QRL<(user: any) => void>;
  onError?: QRL<(error: string) => void>;
  redirectUrl?: string;
  initialError?: string;
}

export const UnifiedAuth = component$<UnifiedAuthProps>((props) => {
  const isLoading = useSignal(false);
  const error = useSignal<string>(props.initialError || "");
  const popupBlocked = useSignal(false);
  const success = useSignal<string>("");
  const showPasskeyLogin = useSignal(false);
  const showPasskeySignup = useSignal(false);
  const passkeyEmail = useSignal("");
  const emailInput = useSignal("");
  const showEmailInput = useSignal(false);
  const hasConditionalUI = useSignal(false);
  const passkeyAvailable = useSignal(false);

  const redirectUrl = props.redirectUrl;

  // Check for conditional UI support on component mount
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async () => {
    if (WebAuthnClient.isSupported()) {
      console.log('🔐 Checking WebAuthn capabilities...');
      
      const conditionalSupported =
        await WebAuthnClient.isConditionalMediationAvailable();
      hasConditionalUI.value = conditionalSupported;
      
      // Actually check if passkeys are available for this domain
      if (conditionalSupported) {
        console.log('🔐 Conditional UI supported, checking for available passkeys...');
        const hasPasskeys = await WebAuthnClient.hasPasskeysAvailable();
        passkeyAvailable.value = hasPasskeys;
        console.log('🔐 Passkeys available:', hasPasskeys);
      } else {
        passkeyAvailable.value = false;
        console.log('🔐 Conditional UI not supported');
      }
    }
  });

  const handleGoogleAuth = $(async () => {
    isLoading.value = true;
    error.value = "";
    if (redirectUrl) {
      window.location.href = `/auth/google?redirect=${encodeURIComponent(redirectUrl)}`;
    } else {
      window.location.href = "/auth/google";
    }
  });

  const handleAppleAuth = $(async () => {
    isLoading.value = true;
    error.value = "";
    if (redirectUrl) {
      window.location.href = `/auth/apple?redirect=${encodeURIComponent(redirectUrl)}`;
    } else {
      window.location.href = "/auth/apple";
    }
  });

  const handleDirectPasskeyAuth = $(async () => {
    if (!WebAuthnClient.isSupported()) {
      error.value = "Passkeys are not supported in this browser";
      return;
    }

    isLoading.value = true;
    error.value = "";

    try {
      const result = await webauthnClient.authenticateWithConditionalUI();

      if (result.success && result.user && result.session_token) {
        success.value = "Successfully signed in with passkey!";
        await props.onSuccess?.(result.user);
      } else {
        const errorMsg = result.error || "Authentication failed";
        error.value = errorMsg;
        await props.onError?.(errorMsg);
      }
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : "Authentication failed";
      error.value = errorMsg;
      await props.onError?.(errorMsg);
    } finally {
      isLoading.value = false;
    }
  });

  const handlePasskeyStart = $(async () => {
    if (!WebAuthnClient.isSupported()) {
      error.value = "Passkeys are not supported in this browser";
      return;
    }

    showEmailInput.value = true;
  });

  const handleEmailSubmit = $(async () => {
    const email = emailInput.value.trim();
    if (!email || !email.includes("@")) {
      error.value = "Please enter a valid email address";
      return;
    }

    isLoading.value = true;
    error.value = "";

    try {
      // For security reasons, we no longer check if user has passkeys upfront.
      // We show a unified passkey flow that attempts registration/authentication as needed.
      passkeyEmail.value = email;
      showEmailInput.value = false;

      // Show signup flow - it will handle both new users and existing users appropriately
      showPasskeySignup.value = true;
    } catch {
      error.value = "Failed to start passkey flow. Please try again.";
    } finally {
      isLoading.value = false;
    }
  });

  const handlePasskeySuccess = $(async (user: any) => {
    success.value = "Successfully signed in with passkey!";
    await props.onSuccess?.(user);
  });

  const handlePasskeyError = $(async (errorMsg: string) => {
    error.value = errorMsg;
    await props.onError?.(errorMsg);
  });

  const handlePasskeyCancel = $(async () => {
    showPasskeyLogin.value = false;
    showPasskeySignup.value = false;
    showEmailInput.value = false;
    passkeyEmail.value = "";
    emailInput.value = "";
  });

  const handleRequiresOAuth = $(async (email: string) => {
    // User exists and requires OAuth - redirect to OAuth with return flow
    error.value = `This email is associated with an existing account. Redirecting to sign in...`;

    // Store the email for passkey creation after OAuth
    sessionStorage.setItem("pendingPasskeyEmail", email);
    sessionStorage.setItem("returnToPasskeyCreation", "true");

    // Redirect to OAuth flow
    setTimeout(() => {
      if (redirectUrl) {
        window.location.href = `/auth/google?redirect=${encodeURIComponent(redirectUrl)}&passkey=pending`;
      } else {
        window.location.href = "/auth/google?passkey=pending";
      }
    }, 1500);
  });

  // Show passkey components when activated
  if (showPasskeyLogin.value) {
    return (
      <PasskeyLogin
        email={passkeyEmail.value}
        onSuccess={handlePasskeySuccess}
        onError={handlePasskeyError}
        onCancel={handlePasskeyCancel}
      />
    );
  }

  if (showPasskeySignup.value) {
    return (
      <PasskeySignup
        email={passkeyEmail.value}
        onSuccess={handlePasskeySuccess}
        onError={handlePasskeyError}
        onCancel={handlePasskeyCancel}
        onRequiresOAuth={handleRequiresOAuth}
      />
    );
  }

  return (
    <div class="space-y-6">
      <div class="text-center">
        <h2 class="text-3xl font-bold text-gray-900">Welcome</h2>
        <p class="mt-2 text-gray-600">
          Sign in to your account or create a new one
        </p>
      </div>

      {success.value && (
        <div
          data-testid="success-message"
          class="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700"
        >
          {success.value}
        </div>
      )}

      {error.value && (
        <div
          data-testid="error-message"
          class="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-600"
        >
          {error.value}
        </div>
      )}

      {popupBlocked.value && (
        <div class="space-y-2">
          <div
            data-testid="popup-blocked-message"
            class="rounded-md border border-orange-200 bg-orange-50 p-3 text-sm text-orange-700"
          >
            Popup blocked! Please allow popups for this site to continue with
            authentication.
          </div>
          <div
            data-testid="enable-popups-instructions"
            class="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700"
          >
            <strong>How to enable popups:</strong>
            <ul class="mt-1 list-disc space-y-1 pl-5">
              <li>Click the popup blocker icon in your address bar</li>
              <li>Select "Always allow popups from this site"</li>
              <li>Try signing in again</li>
            </ul>
          </div>
        </div>
      )}

      <div class="space-y-4">
        {/* Passkey Option - Primary */}
        <div class="space-y-3">
          {passkeyAvailable.value && hasConditionalUI.value ? (
            // Direct passkey authentication (no email required)
            <button
              type="button"
              onClick$={handleDirectPasskeyAuth}
              disabled={isLoading.value}
              class="flex w-full items-center justify-center rounded-md bg-blue-600 px-4 py-3 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading.value ? (
                <div class="flex items-center space-x-2">
                  <div class="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                  <span>Authenticating...</span>
                </div>
              ) : (
                <div class="flex items-center space-x-2">
                  <svg
                    class="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke-width={1.5}
                    stroke="currentColor"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1721.75 8.25z"
                    />
                  </svg>
                  <span>Sign in with Passkey</span>
                </div>
              )}
            </button>
          ) : showEmailInput.value ? (
            <div class="space-y-3">
              <div>
                <label
                  for="passkey-email"
                  class="block text-sm font-medium text-gray-700"
                >
                  Email Address
                </label>
                <input
                  id="passkey-email"
                  type="email"
                  value={emailInput.value}
                  onInput$={(e) => {
                    emailInput.value = (e.target as HTMLInputElement).value;
                  }}
                  placeholder="Enter your email"
                  disabled={isLoading.value}
                  class="mt-1 block w-full rounded-md border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:ring-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
              <div class="flex space-x-2">
                <button
                  type="button"
                  onClick$={handleEmailSubmit}
                  disabled={isLoading.value || !emailInput.value.includes("@")}
                  class="flex-1 rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isLoading.value ? "Checking..." : "Continue"}
                </button>
                <button
                  type="button"
                  onClick$={handlePasskeyCancel}
                  disabled={isLoading.value}
                  class="rounded-md border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick$={handlePasskeyStart}
              disabled={isLoading.value}
              class="flex w-full items-center justify-center rounded-md bg-blue-600 px-4 py-3 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <svg
                class="mr-2 h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke-width={1.5}
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z"
                />
              </svg>
              Continue with Passkey
            </button>
          )}
        </div>

        {/* Divider */}
        <div class="relative">
          <div class="absolute inset-0 flex items-center">
            <div class="w-full border-t border-gray-300" />
          </div>
          <div class="relative flex justify-center text-sm">
            <span class="bg-white px-2 text-gray-500">Or continue with</span>
          </div>
        </div>

        {/* OAuth Options */}
        <div class="grid grid-cols-2 gap-3">
          <button
            type="button"
            data-testid="google-signin-button"
            onClick$={handleGoogleAuth}
            disabled={isLoading.value}
            class="inline-flex w-full items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-500 shadow-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg class="mr-2 h-5 w-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Google
          </button>

          <button
            type="button"
            onClick$={handleAppleAuth}
            disabled={isLoading.value}
            class="inline-flex w-full items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-500 shadow-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg class="mr-2 h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
            </svg>
            Apple
          </button>
        </div>
      </div>

      <div class="text-center text-xs text-gray-500">
        By continuing, you agree to our Terms of Service and Privacy Policy
      </div>
    </div>
  );
});
