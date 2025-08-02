import { component$ } from "@builder.io/qwik";
import { type DocumentHead } from "@builder.io/qwik-city";
import { useUserLoader } from "./layout";

export default component$(() => {
  const user = useUserLoader();

  return (
    <div class="min-h-screen bg-gray-50 py-8">
      <div class="max-w-4xl mx-auto px-4">
        <div class="bg-white rounded-lg shadow p-6">
          <div class="flex items-center justify-between mb-6">
            <h1 class="text-3xl font-bold text-gray-900">Hamrah App</h1>
            <a
              href="/auth/logout"
              class="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors"
            >
              Sign Out
            </a>
          </div>
          
          <div class="border-t pt-6">
            <h2 class="text-xl font-semibold text-gray-900 mb-4">Welcome back!</h2>
            <div class="flex items-center space-x-4">
              {user.value.picture && (
                <img
                  src={user.value.picture}
                  alt={user.value.name}
                  width="64"
                  height="64"
                  class="w-16 h-16 rounded-full"
                />
              )}
              <div>
                <p class="text-lg font-medium text-gray-900">{user.value.name}</p>
                <p class="text-sm text-gray-600">{user.value.email}</p>
                <p class="text-xs text-gray-500 mt-1">
                  Signed in with {user.value.provider === 'google' ? 'Google' : 'Apple'}
                </p>
              </div>
            </div>
          </div>
          
          <div class="mt-8 border-t pt-6">
            <p class="text-muted-foreground">
              You're successfully authenticated! This is your protected dashboard.
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
