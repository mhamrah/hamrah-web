import { component$, useSignal, $, type QRL } from "@builder.io/qwik";
import { server$ } from "@builder.io/qwik-city";
import {
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";

interface UnifiedAuthProps {
  onSuccess?: QRL<(user: any) => void>;
  onError?: QRL<(error: string) => void>;
  redirectUrl?: string;
}

// Server function for passkey authentication/registration
const passkeyAuthServer = server$(async function (this: any, email?: string) {
  const {
    generateWebAuthnAuthenticationOptions,
    generateWebAuthnRegistrationOptionsForNewUser,
  } = await import("~/lib/auth/webauthn");
  const { getDB, users } = await import("~/lib/db");
  const { eq } = await import("drizzle-orm");

  try {
    // First, try to generate authentication options (existing user)
    try {
      const authOptions = await generateWebAuthnAuthenticationOptions(
        this as any,
        email,
      );
      return {
        success: true,
        type: "authentication",
        options: authOptions,
        email,
      };
    } catch (authError) {
      // If authentication fails, try registration (new user)
      console.log(
        "Authentication option generation failed, trying registration:",
        authError,
      );

      if (!email) {
        // No email provided, generate registration options without user context
        const regOptions = await generateWebAuthnRegistrationOptionsForNewUser(
          this as any,
          "user@example.com", // Temporary email, will be updated later
          "New User", // Temporary name, will be updated later
        );
        return {
          success: true,
          type: "registration",
          options: regOptions,
          needsProfile: true, // Indicate that we need to collect email/name later
        };
      } else {
        // Email provided, check if user exists
        const db = getDB(this as any);
        const existingUser = await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);

        if (existingUser.length > 0) {
          // User exists but has no passkeys, create registration options
          const regOptions =
            await generateWebAuthnRegistrationOptionsForNewUser(
              this as any,
              email,
              existingUser[0].name,
            );
          return {
            success: true,
            type: "registration",
            options: regOptions,
            email,
            existingUser: existingUser[0],
          };
        } else {
          // New user, create registration options
          const regOptions =
            await generateWebAuthnRegistrationOptionsForNewUser(
              this as any,
              email,
              "New User", // Will be updated after registration
            );
          return {
            success: true,
            type: "registration",
            options: regOptions,
            email,
            needsProfile: email ? false : true,
          };
        }
      }
    }
  } catch (error: any) {
    console.error("Passkey auth error:", error);
    return { success: false, error: error.message };
  }
});

const completePasskeyAuth = server$(async function (
  this: any,
  response: any,
  challengeId: string,
  type: "authentication" | "registration",
  email?: string,
  name?: string,
) {
  const { verifyWebAuthnAuthentication, verifyWebAuthnRegistration } =
    await import("~/lib/auth/webauthn");
  const { generateSessionToken, createSession, setSessionTokenCookie } =
    await import("~/lib/auth/session");
  const { generateUserId } = await import("~/lib/auth/utils");
  const { getDB, users } = await import("~/lib/db");
  const { eq } = await import("drizzle-orm");

  try {
    if (type === "authentication") {
      // Existing user authentication
      const result = await verifyWebAuthnAuthentication(
        this as any,
        response,
        challengeId,
      );

      if (!result.verified || !result.user || !result.sessionToken) {
        throw new Error("Authentication failed");
      }

      const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30); // 30 days
      setSessionTokenCookie(this as any, result.sessionToken, expiresAt);

      return { success: true, user: result.user };
    } else {
      // New user registration
      const db = getDB(this as any);
      let user = null;

      // Check if user already exists (for cases where they have OAuth but adding passkey)
      if (email) {
        const existingUser = await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);

        if (existingUser.length > 0) {
          user = existingUser[0];
        }
      }

      // If no existing user, create one
      if (!user) {
        const userId = generateUserId();
        const newUser = {
          id: userId,
          email: email || `user-${userId}@temp.com`, // Temporary email if none provided
          name: name || "New User", // Temporary name if none provided
          picture: null,
          provider: null, // Passkey-only user
          providerId: null,
          lastLoginPlatform: null,
          lastLoginAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        await db.insert(users).values(newUser);
        user = newUser;
      }

      // Verify the registration
      const result = await verifyWebAuthnRegistration(
        this as any,
        response,
        challengeId,
        user,
      );

      if (!result.verified) {
        throw new Error("Registration verification failed");
      }

      // Create session
      const sessionToken = generateSessionToken();
      await createSession(this as any, sessionToken, user.id);
      const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30); // 30 days
      setSessionTokenCookie(this as any, sessionToken, expiresAt);

      return {
        success: true,
        user: result.user || user,
        needsProfile:
          !email || email.includes("@temp.com") || !name || name === "New User",
      };
    }
  } catch (error: any) {
    console.error("Complete passkey auth error:", error);
    return { success: false, error: error.message };
  }
});

export const UnifiedAuth = component$<UnifiedAuthProps>((props) => {
  const isLoading = useSignal(false);
  const error = useSignal<string>("");
  const showEmailInput = useSignal(false);
  const email = useSignal("");

  // QRL functions don't need noSerialize
  const { onSuccess, onError } = props;
  const redirectUrl = props.redirectUrl;

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

  const handlePasskeyAuth = $(async () => {
    isLoading.value = true;
    error.value = "";

    try {
      // Begin passkey authentication/registration
      const beginResult = (await (passkeyAuthServer as any)(
        showEmailInput.value ? email.value : undefined,
      )) as any;

      if (!beginResult.success) {
        throw new Error(
          beginResult.error || "Failed to begin passkey authentication",
        );
      }

      const { challengeId, ...options } = beginResult.options as any;
      let response;

      if (beginResult.type === "authentication") {
        // Existing user - authenticate
        response = await startAuthentication({ optionsJSON: options });
      } else {
        // New user - register
        response = await startRegistration({ optionsJSON: options });
      }

      // Complete the authentication/registration
      const completeResult = (await completePasskeyAuth(
        response,
        challengeId,
        beginResult.type,
        beginResult.email,
        beginResult.email ? "New User" : undefined,
      )) as any;

      if (!completeResult.success) {
        throw new Error(
          completeResult.error || "Failed to complete passkey authentication",
        );
      }

      // Check if user needs to complete their profile
      if (completeResult.needsProfile) {
        // Redirect to profile completion page
        if (redirectUrl) {
          window.location.href = `/auth/complete-profile?redirect=${encodeURIComponent(redirectUrl)}`;
        } else {
          window.location.href = "/auth/complete-profile";
        }
      } else {
        await onSuccess?.(completeResult.user);
        if (redirectUrl) {
          window.location.href = redirectUrl;
        } else {
          window.location.href = "/";
        }
      }
    } catch (err: any) {
      let errorMessage = "Failed to authenticate with passkey";

      if (err.name === "NotAllowedError") {
        errorMessage = "Authentication was cancelled or timed out";
      } else if (err.name === "SecurityError") {
        errorMessage = "Security error during authentication";
      } else if (err.message) {
        errorMessage = err.message;
      }

      error.value = errorMessage;
      await onError?.(errorMessage);
    } finally {
      isLoading.value = false;
    }
  });

  return (
    <div class="space-y-6">
      <div class="text-center">
        <h2 class="text-3xl font-bold text-gray-900">Welcome</h2>
        <p class="mt-2 text-gray-600">
          Sign in to your account or create a new one
        </p>
      </div>

      {error.value && (
        <div class="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-600">
          {error.value}
        </div>
      )}

      <div class="space-y-4">
        {/* Passkey Authentication - Primary Option */}
        <div class="space-y-3">
          {showEmailInput.value && (
            <div>
              <label
                for="email"
                class="block text-sm font-medium text-gray-700"
              >
                Email (optional)
              </label>
              <input
                id="email"
                type="email"
                value={email.value}
                onInput$={(e) =>
                  (email.value = (e.target as HTMLInputElement).value)
                }
                class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 focus:outline-none sm:text-sm"
                placeholder="your@email.com"
              />
              <p class="mt-1 text-xs text-gray-500">
                Help us find your existing account or leave blank for anonymous
                signin
              </p>
            </div>
          )}

          <button
            type="button"
            onClick$={handlePasskeyAuth}
            disabled={isLoading.value}
            class="flex w-full items-center justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-3 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading.value ? (
              <>
                <svg
                  class="mr-3 -ml-1 h-5 w-5 animate-spin text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    class="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    stroke-width="4"
                  ></circle>
                  <path
                    class="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Authenticating...
              </>
            ) : (
              <>
                <svg
                  class="mr-3 h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                  />
                </svg>
                Continue with Passkey
              </>
            )}
          </button>

          <div class="text-center">
            <button
              type="button"
              onClick$={() => (showEmailInput.value = !showEmailInput.value)}
              class="text-sm text-indigo-600 hover:text-indigo-500"
            >
              {showEmailInput.value
                ? "Hide email field"
                : "Add email for account linking"}
            </button>
          </div>

          <div class="text-center text-xs text-gray-500">
            Use your device's built-in security (Face ID, Touch ID, Windows
            Hello, or security key)
          </div>
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
