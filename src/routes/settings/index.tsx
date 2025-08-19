import { component$, $ } from "@builder.io/qwik";
import type { DocumentHead } from "@builder.io/qwik-city";
import { useUserLoader } from "../layout";
import { PasskeyManagement } from "~/components/webauthn/passkey-management";
import { AddPasskey } from "~/components/auth/add-passkey";

export default component$(() => {
  const user = useUserLoader();

  const handlePasskeySuccess = $(() => {
    // Refresh the page to show updated passkey list
    window.location.reload();
  });

  const handlePasskeyError = $((error: string) => {
    console.error("Failed to add passkey:", error);
  });

  return (
    <div class="min-h-screen bg-gray-50 py-8">
      <div class="mx-auto max-w-4xl px-4">
        <div class="rounded-lg bg-white p-6 shadow">
          <div class="mb-6 flex items-center justify-between">
            <h1 class="text-3xl font-bold text-gray-900">Account Settings</h1>
            <a
              href="/"
              class="rounded-md bg-gray-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-700"
            >
              Back to Home
            </a>
          </div>

          {/* User Info Section */}
          <div class="mb-6 border-b pb-6">
            <h2 class="mb-4 text-xl font-semibold text-gray-900">
              Profile Information
            </h2>
            <div class="flex items-center space-x-4">
              {user.value.picture && (
                <img
                  src={user.value.picture}
                  alt={user.value.name}
                  width="64"
                  height="64"
                  class="h-16 w-16 rounded-full"
                />
              )}
              <div>
                <p class="text-lg font-medium text-gray-900">
                  {user.value.name}
                </p>
                <p class="text-sm text-gray-600">{user.value.email}</p>
                {user.value.provider && (
                  <p class="mt-1 text-xs text-gray-500">
                    Connected with{" "}
                    {user.value.provider === "google" ? "Google" : "Apple"}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Passkey Management Section */}
          <div class="space-y-6">
            <div>
              <h2 class="mb-2 text-xl font-semibold text-gray-900">
                Security Settings
              </h2>
              <p class="mb-6 text-sm text-gray-600">
                Manage your passkeys for secure, passwordless authentication.
                Passkeys use your device's built-in security features like Face
                ID, Touch ID, or Windows Hello.
              </p>
            </div>

            {/* Add New Passkey Section */}
            <div class="rounded-lg border border-blue-200 bg-blue-50 p-4">
              <h3 class="mb-2 text-lg font-medium text-gray-900">
                Add a New Passkey
              </h3>
              <p class="mb-4 text-sm text-gray-600">
                Add another passkey to this account for backup or to use on
                different devices.
              </p>
              <div class="max-w-md">
                <AddPasskey
                  email={user.value.email}
                  name={user.value.name}
                  onSuccess={handlePasskeySuccess}
                  onError={handlePasskeyError}
                />
              </div>
            </div>

            {/* Existing Passkeys */}
            <div>
              <PasskeyManagement />
            </div>

            {/* Security Notice */}
            <div class="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <div class="flex">
                <svg
                  class="mt-0.5 mr-3 h-5 w-5 text-amber-400"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fill-rule="evenodd"
                    d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                    clip-rule="evenodd"
                  />
                </svg>
                <div>
                  <h4 class="text-sm font-medium text-amber-800">
                    Security Recommendation
                  </h4>
                  <p class="mt-1 text-sm text-amber-700">
                    We recommend keeping at least one passkey as a backup. If
                    you only have OAuth logins and lose access to your Google or
                    Apple account, having a passkey ensures you can still access
                    your account.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

export const head: DocumentHead = {
  title: "Account Settings - Hamrah App",
  meta: [
    {
      name: "description",
      content: "Manage your account settings and security preferences",
    },
  ],
};
