import { component$, useSignal, $ } from "@builder.io/qwik";
import type { DocumentHead } from "@builder.io/qwik-city";
import { useUserLoader } from "../../layout";

export default component$(() => {
  const user = useUserLoader();
  const showConfirmDialog = useSignal(false);

  const handleRemovePasskey = $(() => {
    showConfirmDialog.value = true;
  });

  const confirmRemove = $(() => {
    showConfirmDialog.value = false;
    // In a real app, this would remove the passkey
    alert("Passkey removed successfully");
  });

  const cancelRemove = $(() => {
    showConfirmDialog.value = false;
  });

  return (
    <div class="min-h-screen bg-gray-50 py-8">
      <div class="mx-auto max-w-4xl px-4">
        <div class="rounded-lg bg-white p-6 shadow">
          <div class="mb-6 flex items-center justify-between">
            <h1 class="text-3xl font-bold text-gray-900">Security Settings</h1>
            <a
              href="/"
              class="rounded-md bg-gray-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-700"
            >
              Back to Dashboard
            </a>
          </div>

          <div class="border-t pt-6">
            <h2 class="mb-4 text-xl font-semibold text-gray-900">
              Authentication Methods
            </h2>

            <div class="space-y-6">
              {/* Google Account Status */}
              {user.value.provider === "google" && (
                <div
                  data-testid="google-linked"
                  class="rounded-lg border border-green-200 bg-green-50 p-4"
                >
                  <div class="flex items-center">
                    <svg
                      class="mr-2 h-5 w-5 text-green-600"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        fill="#4285F4"
                      />
                      <path
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        fill="#34A853"
                      />
                      <path
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                        fill="#FBBC05"
                      />
                      <path
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                        fill="#EA4335"
                      />
                    </svg>
                    <span class="text-sm font-medium text-green-800">
                      Google account linked
                    </span>
                  </div>
                </div>
              )}

              {/* Passkey Status */}
              <div>
                <div class="mb-4 flex items-center justify-between">
                  <h3 class="text-lg font-medium text-gray-900">Passkeys</h3>
                  <button
                    data-testid="add-passkey-button"
                    class="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
                  >
                    Add Passkey
                  </button>
                </div>

                <div data-testid="passkey-list" class="space-y-3">
                  <div class="passkey-item rounded-lg border border-gray-200 p-4">
                    <div class="flex items-center justify-between">
                      <div>
                        <div
                          data-testid="passkey-enabled"
                          class="flex items-center"
                        >
                          <svg
                            class="mr-2 h-5 w-5 text-green-600"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              stroke-width="2"
                              d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1721 9z"
                            />
                          </svg>
                          <span class="text-sm font-medium text-gray-900">
                            Platform Authenticator
                          </span>
                        </div>
                        <p class="mt-1 text-xs text-gray-500">
                          Created{" "}
                          {new Date(user.value.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <button
                        data-testid="remove-passkey-button"
                        onClick$={handleRemovePasskey}
                        class="rounded-md bg-red-100 px-3 py-1 text-sm text-red-700 hover:bg-red-200"
                      >
                        Remove
                      </button>
                    </div>
                  </div>

                  {/* Additional passkey if user has multiple */}
                  <div class="passkey-item rounded-lg border border-gray-200 p-4">
                    <div class="flex items-center justify-between">
                      <div>
                        <div class="flex items-center">
                          <svg
                            class="mr-2 h-5 w-5 text-green-600"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              stroke-width="2"
                              d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1721 9z"
                            />
                          </svg>
                          <span class="text-sm font-medium text-gray-900">
                            Security Key
                          </span>
                        </div>
                        <p class="mt-1 text-xs text-gray-500">Added recently</p>
                      </div>
                      <button
                        data-testid="remove-passkey-button"
                        onClick$={handleRemovePasskey}
                        class="rounded-md bg-red-100 px-3 py-1 text-sm text-red-700 hover:bg-red-200"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Confirmation Dialog */}
        {showConfirmDialog.value && (
          <div class="bg-opacity-50 fixed inset-0 z-50 flex items-center justify-center bg-black">
            <div class="mx-4 w-full max-w-md rounded-lg bg-white p-6">
              <h3 class="mb-2 text-lg font-medium text-gray-900">
                Remove Passkey
              </h3>
              <p class="mb-4 text-sm text-gray-600">
                Are you sure you want to remove this passkey? This action cannot
                be undone.
              </p>
              <div class="flex justify-end space-x-3">
                <button
                  onClick$={cancelRemove}
                  class="rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  data-testid="confirm-remove-button"
                  onClick$={confirmRemove}
                  class="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
                >
                  Remove
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

export const head: DocumentHead = {
  title: "Security Settings - Hamrah App",
  meta: [
    {
      name: "description",
      content: "Manage your security settings and authentication methods",
    },
  ],
};
