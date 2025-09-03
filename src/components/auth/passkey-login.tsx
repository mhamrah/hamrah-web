import { component$, useSignal, $, type QRL } from "@builder.io/qwik";
import { webauthnClient } from "~/lib/auth/webauthn";

interface PasskeyLoginProps {
  email: string;
  onSuccess?: QRL<(user: any, sessionToken: string) => void>;
  onError?: QRL<(error: string) => void>;
  onCancel?: QRL<() => void>;
}

export const PasskeyLogin = component$<PasskeyLoginProps>((props) => {
  const isLoading = useSignal(false);
  const error = useSignal<string>("");

  const handlePasskeyLogin = $(async () => {
    isLoading.value = true;
    error.value = "";

    try {
      const result = await webauthnClient.authenticateWithPasskey(props.email);

      if (result.success && result.user && result.session_token) {
        await props.onSuccess?.(result.user, result.session_token);
      } else {
        const errorMsg = result.error || "Authentication failed";
        error.value = errorMsg;
        await props.onError?.(errorMsg);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Authentication failed";
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
        <div class="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-blue-100">
          <svg
            class="h-8 w-8 text-blue-600"
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
          Sign in with Passkey
        </h3>
        <p class="mt-2 text-sm text-gray-600">
          Use your device's biometric authentication to sign in to{" "}
          <span class="font-medium text-gray-900">{props.email}</span>
        </p>
      </div>

      {error.value && (
        <div class="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-600">
          {error.value}
        </div>
      )}

      <div class="space-y-3">
        <button
          type="button"
          onClick$={handlePasskeyLogin}
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
                  d="M7.864 4.243A7.5 7.5 0 0119.5 10.5c0 2.92-.556 5.709-1.568 8.268M5.742 6.364A7.465 7.465 0 004.5 10.5a7.464 7.464 0 01-1.15 3.993m1.989 3.559A11.209 11.209 0 008.25 10.5a3.75 3.75 0 117.5 0c0 .527-.021 1.049-.064 1.565M12 10.5a14.94 14.94 0 01-3.6 9.75m6.633-4.596a18.666 18.666 0 01-2.485 5.33"
                />
              </svg>
              <span>Use Passkey</span>
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

      <div class="text-center text-xs text-gray-500">
        Your device will prompt you to authenticate using Face ID, Touch ID, or
        your device PIN
      </div>
    </div>
  );
});