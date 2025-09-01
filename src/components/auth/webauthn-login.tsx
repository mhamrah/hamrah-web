import { component$, useSignal, $, type QRL } from "@builder.io/qwik";
import { server$ } from "@builder.io/qwik-city";
import {
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";
import { HiFingerPrintOutline } from "@qwikest/icons/heroicons";
import type {
  WebAuthnBeginResponse,
  WebAuthnCompleteResponse,
} from "~/lib/webauthn/types";

interface WebAuthnLoginProps {
  onSuccess?: QRL<(user: any) => void>;
  onError?: QRL<(error: string) => void>;
}

// Server function for WebAuthn authentication
const beginWebAuthnAuthentication = server$(async function (this: any, email?: string): Promise<WebAuthnBeginResponse> {
  const response = await fetch(`${this.url.origin}/api/webauthn/authenticate/begin`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email }),
  });

  if (!response.ok) {
    throw new Error(`Failed to begin authentication: ${response.statusText}`);
  }

  return await response.json();
});

// Server function for completing WebAuthn authentication
const completeWebAuthnAuthentication = server$(async function (this: any, authResponse: any, challengeId: string): Promise<WebAuthnCompleteResponse> {
  const response = await fetch(`${this.url.origin}/api/webauthn/authenticate/complete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      response: authResponse,
      challengeId,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to complete authentication: ${response.statusText}`);
  }

  return await response.json();
});

// Server function for WebAuthn registration (new user)
const beginWebAuthnRegistration = server$(async function (this: any, email: string, name: string): Promise<WebAuthnBeginResponse> {
  const response = await fetch(`${this.url.origin}/api/webauthn/register/begin`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, name }),
  });

  if (!response.ok) {
    throw new Error(`Failed to begin registration: ${response.statusText}`);
  }

  return await response.json();
});

// Server function for completing WebAuthn registration
const completeWebAuthnRegistration = server$(async function (this: any, regResponse: any, challengeId: string, email: string, name: string): Promise<WebAuthnCompleteResponse> {
  const response = await fetch(`${this.url.origin}/api/webauthn/register/complete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      response: regResponse,
      challengeId,
      email,
      name,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to complete registration: ${response.statusText}`);
  }

  return await response.json();
});

export const WebAuthnLogin = component$<WebAuthnLoginProps>(({ onSuccess, onError }) => {
  const isLoading = useSignal(false);
  const email = useSignal("");
  const name = useSignal("");
  const isSignUp = useSignal(false);
  const errorMessage = useSignal("");

  const handleWebAuthnAuth = $(async () => {
    try {
      isLoading.value = true;
      errorMessage.value = "";

      // Step 1: Begin authentication
      const beginResponse = await beginWebAuthnAuthentication(email.value || undefined);
      
      if (!beginResponse.success) {
        throw new Error(beginResponse.error || "Failed to begin authentication");
      }

      // Step 2: Use browser WebAuthn API
      const authResponse = await startAuthentication({
        optionsJSON: beginResponse.options as any,
      });

      // Step 3: Complete authentication
      const completeResponse = await completeWebAuthnAuthentication(
        authResponse,
        (beginResponse.options as any).challengeId
      );

      if (completeResponse.success && completeResponse.user) {
        onSuccess?.(completeResponse.user);
      } else {
        throw new Error(completeResponse.error || "Authentication failed");
      }
    } catch (error: any) {
      console.error("WebAuthn authentication error:", error);
      errorMessage.value = error.message || "Authentication failed";
      onError?.(errorMessage.value);
    } finally {
      isLoading.value = false;
    }
  });

  const handleWebAuthnSignUp = $(async () => {
    try {
      isLoading.value = true;
      errorMessage.value = "";

      if (!email.value || !name.value) {
        throw new Error("Email and name are required for registration");
      }

      // Step 1: Begin registration
      const beginResponse = await beginWebAuthnRegistration(email.value, name.value);
      
      if (!beginResponse.success) {
        throw new Error(beginResponse.error || "Failed to begin registration");
      }

      // Step 2: Use browser WebAuthn API
      const regResponse = await startRegistration({
        optionsJSON: beginResponse.options as any,
      });

      // Step 3: Complete registration
      const completeResponse = await completeWebAuthnRegistration(
        regResponse,
        (beginResponse.options as any).challengeId,
        email.value,
        name.value
      );

      if (completeResponse.success && completeResponse.user) {
        onSuccess?.(completeResponse.user);
      } else {
        throw new Error(completeResponse.error || "Registration failed");
      }
    } catch (error: any) {
      console.error("WebAuthn registration error:", error);
      errorMessage.value = error.message || "Registration failed";
      onError?.(errorMessage.value);
    } finally {
      isLoading.value = false;
    }
  });

  return (
    <div class="space-y-6">
      <div class="text-center">
        <HiFingerPrintOutline class="mx-auto h-16 w-16 text-indigo-600" />
        <h2 class="mt-4 text-2xl font-bold tracking-tight text-gray-900">
          {isSignUp.value ? "Create Account with Passkey" : "Sign In with Passkey"}
        </h2>
        <p class="mt-2 text-sm text-gray-600">
          {isSignUp.value 
            ? "Create a new account using your device's biometric authentication"
            : "Use your device's biometric authentication or security key"
          }
        </p>
      </div>

      {errorMessage.value && (
        <div class="rounded-md bg-red-50 p-4">
          <div class="text-sm text-red-800">{errorMessage.value}</div>
        </div>
      )}

      <div class="space-y-4">
        {(isSignUp.value || email.value) && (
          <div>
            <label for="email" class="block text-sm font-medium text-gray-700">
              Email address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email.value}
              onInput$={(e) => (email.value = (e.target as HTMLInputElement).value)}
              class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
              placeholder="Enter your email"
              disabled={isLoading.value}
            />
          </div>
        )}

        {isSignUp.value && (
          <div>
            <label for="name" class="block text-sm font-medium text-gray-700">
              Full name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              autoComplete="name"
              required
              value={name.value}
              onInput$={(e) => (name.value = (e.target as HTMLInputElement).value)}
              class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
              placeholder="Enter your full name"
              disabled={isLoading.value}
            />
          </div>
        )}

        <div class="space-y-3">
          {!isSignUp.value ? (
            <button
              type="button"
              onClick$={handleWebAuthnAuth}
              disabled={isLoading.value}
              class="group relative flex w-full justify-center rounded-md border border-transparent bg-indigo-600 py-2 px-4 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <HiFingerPrintOutline class="mr-2 h-5 w-5" />
              {isLoading.value ? "Authenticating..." : "Sign In with Passkey"}
            </button>
          ) : (
            <button
              type="button"
              onClick$={handleWebAuthnSignUp}
              disabled={isLoading.value || !email.value || !name.value}
              class="group relative flex w-full justify-center rounded-md border border-transparent bg-indigo-600 py-2 px-4 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <HiFingerPrintOutline class="mr-2 h-5 w-5" />
              {isLoading.value ? "Creating Account..." : "Create Account with Passkey"}
            </button>
          )}

          <div class="text-center">
            <button
              type="button"
              onClick$={() => {
                isSignUp.value = !isSignUp.value;
                errorMessage.value = "";
                email.value = "";
                name.value = "";
              }}
              class="text-sm text-indigo-600 hover:text-indigo-500"
              disabled={isLoading.value}
            >
              {isSignUp.value 
                ? "Already have an account? Sign in" 
                : "Need an account? Sign up"
              }
            </button>
          </div>

          {!isSignUp.value && (
            <div class="text-center">
              <button
                type="button"
                onClick$={() => {
                  if (email.value) {
                    email.value = "";
                  } else {
                    // Show email input for targeted authentication
                    email.value = " "; // Set to space to show input
                  }
                }}
                class="text-xs text-gray-500 hover:text-gray-700"
                disabled={isLoading.value}
              >
                {email.value ? "Clear email" : "Enter email for specific account"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

export default WebAuthnLogin;