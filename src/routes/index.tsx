import { component$ } from "@builder.io/qwik";
import { type DocumentHead } from "@builder.io/qwik-city";
import { useUserLoader } from "./layout";

export default component$(() => {
  const user = useUserLoader();

  return (
    <div class="min-h-screen bg-gray-50 py-8">
      <div class="mx-auto max-w-4xl px-4">
        <div class="rounded-lg bg-white p-6 shadow">
          <div class="mb-6 flex items-center justify-between">
            <h1 class="text-3xl font-bold text-gray-900">Hamrah App</h1>
            <div class="flex space-x-3">
              <a
                href="/settings"
                class="rounded-md bg-gray-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-700"
              >
                Settings
              </a>
              <a
                href="/auth/logout"
                class="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
              >
                Sign Out
              </a>
            </div>
          </div>
          <div class="border-t pt-6">
            <h2 class="mb-4 text-xl font-semibold text-gray-900">
              Welcome back!
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
                <p class="mt-1 text-xs text-gray-500">
                  {user.value.provider 
                    ? `Signed in with ${user.value.provider === "google" ? "Google" : "Apple"}` 
                    : "Signed in with Passkey"
                  }
                </p>
              </div>
            </div>
          </div>

          <div class="mt-8 border-t pt-6">
            <p class="text-muted-foreground">
              You're successfully authenticated! This is your protected
              dashboard.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
});

export const head: DocumentHead = {
  title: "Hamrah App",
  meta: [
    {
      name: "description",
      content: "Hamrah App is a playground for Qwik",
    },
  ],
};
