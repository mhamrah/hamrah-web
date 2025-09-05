import {
  component$,
  useSignal,
  $,
  useComputed$,
  type QRL,
} from "@builder.io/qwik";
import { webauthnClient } from "~/lib/auth/webauthn";

interface PasskeySignupProps {
  email?: string;
  onSuccess?: QRL<(user: any) => void>;
  onError?: QRL<(error: string) => void>;
  onCancel?: QRL<() => void>;
  onRequiresOAuth?: QRL<(email: string) => void>;
  oauthVerified?: boolean;
}

export const PasskeySignup = component$<PasskeySignupProps>((props) => {
  const email = useSignal(props.email || "");
  const name = useSignal("");
  const isLoading = useSignal(false);
  const error = useSignal<string>("");

  const canSignUp = useComputed$(() => {
    return (
      email.value.trim().length > 0 &&
      name.value.trim().length > 0 &&
      email.value.includes("@")
    );
  });

  const handlePasskeySignup = $(async () => {
    if (!canSignUp.value) return;

    isLoading.value = true;
    error.value = "";

    try {
      // First attempt registration
      const result = await webauthnClient.registerPasskey({
        email: email.value.trim(),
        name: name.value.trim(),
      });

      if (result.success) {
        // After successful registration, we need to authenticate to get a session
        const authResult = await webauthnClient.authenticateWithPasskey({
          email: email.value.trim(),
        });

        if (authResult.success && authResult.user) {
          await props.onSuccess?.(authResult.user);
        } else {
          error.value =
            "Registration succeeded but sign-in failed. Please try signing in.";
          await props.onError?.(error.value);
        }
      } else {
        // If registration failed, check if it's because user already exists with passkeys
        if (result.error?.includes("existing account") || result.error?.includes("already exists")) {
          // User exists with passkeys - try authentication instead
          try {
            const authResult = await webauthnClient.authenticateWithPasskey({
              email: email.value.trim(),
            });

            if (authResult.success && authResult.user) {
              await props.onSuccess?.(authResult.user);
            } else {
              error.value = "Please use your existing passkey to sign in";
              await props.onError?.(error.value);
            }
          } catch {
            error.value = "Please use your existing passkey to sign in";
            await props.onError?.(error.value);
          }
        } else {
          // Other registration error
          const errorMsg = result.error || "Registration failed";
          error.value = errorMsg;
          await props.onError?.(errorMsg);
        }
      }
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : "Registration failed";
      error.value = errorMsg;
      await props.onError?.(errorMsg);
    } finally {
      isLoading.value = false;
    }
  });

  const handleCancel = $(async () => {
    await props.onCancel?.();
  });

  return (
    <div class="space-y-6">
      <div class="text-center">
        <div class="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-purple-100">
          <svg
            class="h-8 w-8 text-purple-600"
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
        </div>
        <h3 class="mt-4 text-lg font-semibold text-gray-900">
          Continue with Passkey
        </h3>
        <p class="mt-2 text-sm text-gray-600">
          Sign in or create account using your device's biometric authentication
        </p>
      </div>

      {error.value && (
        <div class="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-600">
          {error.value}
        </div>
      )}

      <div class="space-y-4">
        <div>
          <label
            for="passkey-signup-name"
            class="block text-sm font-medium text-gray-700"
          >
            Full Name
          </label>
          <input
            id="passkey-signup-name"
            type="text"
            value={name.value}
            onInput$={(e) => {
              name.value = (e.target as HTMLInputElement).value;
            }}
            placeholder="Enter your full name"
            disabled={isLoading.value}
            class="mt-1 block w-full rounded-md border-gray-300 px-3 py-2 shadow-sm focus:border-purple-500 focus:ring-purple-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>

        <div>
          <label
            for="passkey-signup-email"
            class="block text-sm font-medium text-gray-700"
          >
            Email Address
          </label>
          <input
            id="passkey-signup-email"
            type="email"
            value={email.value}
            onInput$={(e) => {
              email.value = (e.target as HTMLInputElement).value;
            }}
            placeholder="Enter your email"
            disabled={isLoading.value || !!props.email}
            readOnly={!!props.email}
            class="mt-1 block w-full rounded-md border-gray-300 px-3 py-2 shadow-sm focus:border-purple-500 focus:ring-purple-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 read-only:bg-gray-50 read-only:text-gray-600"
          />
        </div>
      </div>

      <div class="space-y-3">
        <button
          type="button"
          onClick$={handlePasskeySignup}
          disabled={!canSignUp.value || isLoading.value}
          class="flex w-full items-center justify-center rounded-md bg-purple-600 px-4 py-3 text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
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
                  d="M12 4.5v15m7.5-7.5h-15"
                />
              </svg>
              <span>Continue with Passkey</span>
            </div>
          )}
        </button>

        <button
          type="button"
          onClick$={handleCancel}
          disabled={isLoading.value}
          class="w-full rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Use different method
        </button>
      </div>

      <div class="space-y-2 text-center text-xs text-gray-500">
        <p>Your passkey will be securely stored on this device</p>
        <p>No passwords required - use Face ID, Touch ID, or your device PIN</p>
      </div>
    </div>
  );
});
