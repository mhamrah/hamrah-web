import { component$, $ } from "@builder.io/qwik";
import type { DocumentHead, RequestHandler } from "@builder.io/qwik-city";
import { UnifiedAuth } from "~/components/auth/unified-auth";

export const onGet: RequestHandler = async ({ cacheControl }) => {
  // Prevent caching of login page to ensure users see current auth state
  cacheControl({
    noCache: true,
    maxAge: 0,
  });
};

export default component$(() => {
  const handleAuthSuccess = $((user: any) => {
    console.log('Authentication successful:', user);
  });

  const handleAuthError = $((error: string) => {
    console.error('Authentication failed:', error);
  });

  // Get redirect URL from query params
  const getRedirectUrl = () => {
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      return url.searchParams.get('redirect') || '/';
    }
    return '/';
  };

  return (
    <div class="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div class="max-w-md w-full space-y-8">
        <UnifiedAuth 
          onSuccess={handleAuthSuccess}
          onError={handleAuthError}
          redirectUrl={getRedirectUrl()}
        />
      </div>
    </div>
  );
});

export const head: DocumentHead = {
  title: "Sign In - Hamrah App",
  meta: [
    {
      name: "description",
      content: "Sign in to your Hamrah App account",
    },
  ],
};