import {
  component$,
  useSignal,
  useVisibleTask$,
  $,
  type QRL,
} from "@builder.io/qwik";
import { webauthnClient } from "~/lib/auth/webauthn";

interface ConditionalPasskeyInputProps {
  placeholder?: string;
  class?: string;
  onPasskeyAuth?: QRL<(result: { user: any; sessionToken: string }) => void>;
  onError?: QRL<(error: string) => void>;
  onEmailSubmit?: QRL<(email: string) => void>;
}

/**
 * Email input component with conditional UI support for passkeys.
 * This component automatically detects if the user has passkeys
 * and shows them as autofill options.
 */
export const ConditionalPasskeyInput = component$<ConditionalPasskeyInputProps>(
  (props) => {
    const emailInput = useSignal<HTMLInputElement>();
    const supportsConditionalUI = useSignal(false);
    const email = useSignal("");

    // Set up conditional UI when component mounts
    // eslint-disable-next-line qwik/no-use-visible-task
    useVisibleTask$(async () => {
      if (!emailInput.value) return;

      // Check if conditional UI is supported
      const isSupported = await webauthnClient.isConditionalUISupported();
      supportsConditionalUI.value = isSupported;

      if (isSupported) {
        try {
          // Set up conditional UI on the input
          await webauthnClient.setupConditionalUI(emailInput.value);

          // Listen for passkey authentication events
          emailInput.value.addEventListener('passkeyAuthenticated', (event: any) => {
            const { user, sessionToken } = event.detail;
            props.onPasskeyAuth?.({ user, sessionToken });
          });
        } catch (error) {
          console.warn('Failed to setup conditional UI:', error);
        }
      }
    });

    const handleSubmit = $(async (event: Event) => {
      event.preventDefault();
      if (email.value.trim()) {
        await props.onEmailSubmit?.(email.value.trim());
      }
    });

    const handleKeyDown = $(async (event: KeyboardEvent) => {
      if (event.key === 'Enter') {
        await handleSubmit(event);
      }
    });

    return (
      <div class="space-y-2">
        <form onSubmit$={handleSubmit} class="space-y-2">
          <input
            ref={emailInput}
            type="email"
            placeholder={props.placeholder || "Enter your email or use your passkey"}
            class={props.class || "w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"}
            value={email.value}
            onInput$={(_, target) => (email.value = target.value)}
            onKeyDown$={handleKeyDown}
            autocomplete={supportsConditionalUI.value ? "username webauthn" : "email"}
            required
          />
          
          {email.value.trim() && (
            <button
              type="submit"
              class="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              Continue
            </button>
          )}
        </form>
        
        {supportsConditionalUI.value && (
          <p class="text-sm text-gray-500 text-center">
            💡 Tip: If you have a passkey saved, it may appear above your keyboard
          </p>
        )}
      </div>
    );
  }
);