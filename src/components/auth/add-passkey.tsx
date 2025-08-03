import { component$, useSignal, $, type QRL } from '@builder.io/qwik';
import { server$ } from '@builder.io/qwik-city';
import { startRegistration } from '@simplewebauthn/browser';

interface AddPasskeyProps {
  email: string;
  name: string;
  onSuccess?: QRL<() => void>;
  onError?: QRL<(error: string) => void>;
}

const addPasskey = server$(async function(this: any) {
  const { generateWebAuthnRegistrationOptions } = await import('~/lib/auth/webauthn');
  const { getCurrentUser } = await import('~/lib/auth/utils');

  try {
    const { user } = await getCurrentUser(this as any);
    if (!user) {
      throw new Error('Not authenticated');
    }

    const options = await generateWebAuthnRegistrationOptions(this as any, user);
    return { success: true, options };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

const completeAddPasskey = server$(async function(this: any, response: any, challengeId: string) {
  const { verifyWebAuthnRegistration } = await import('~/lib/auth/webauthn');
  const { getCurrentUser } = await import('~/lib/auth/utils');

  try {
    const { user } = await getCurrentUser(this as any);
    if (!user) {
      throw new Error('Not authenticated');
    }

    const result = await verifyWebAuthnRegistration(this as any, response, challengeId, user);

    if (!result.verified) {
      throw new Error('Failed to verify passkey registration');
    }

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

export const AddPasskey = component$<AddPasskeyProps>((props) => {
  const isLoading = useSignal(false);
  const error = useSignal<string>('');
  
  // QRL functions don't need noSerialize
  const { onSuccess, onError } = props;

  const handleAddPasskey = $(async () => {
    isLoading.value = true;
    error.value = '';

    try {
      const beginResult = await addPasskey() as any;

      if (!beginResult.success) {
        throw new Error(beginResult.error || 'Failed to begin passkey registration');
      }

      const { challengeId, ...registrationOptions } = beginResult.options;
      const response = await startRegistration({ optionsJSON: registrationOptions });

      const completeResult = await completeAddPasskey(response, challengeId) as any;

      if (!completeResult.success) {
        throw new Error(completeResult.error || 'Failed to complete passkey registration');
      }

      await onSuccess?.();
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to add passkey';
      error.value = errorMessage;
      await onError?.(errorMessage);
    } finally {
      isLoading.value = false;
    }
  });

  return (
    <div class="space-y-4">
      {error.value && (
        <div class="text-red-600 text-sm bg-red-50 border border-red-200 rounded-md p-3">
          {error.value}
        </div>
      )}

      <button
        type="button"
        onClick$={handleAddPasskey}
        disabled={isLoading.value}
        class="w-full flex justify-center items-center px-4 py-3 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isLoading.value ? (
          <>
            <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Adding passkey...
          </>
        ) : (
          <>
            <svg class="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
            Add Passkey
          </>
        )}
      </button>
    </div>
  );
});