import {
  component$,
  useSignal,
  useVisibleTask$,
  $,
  type QRL,
} from "@builder.io/qwik";
import { webauthnClient, type WebAuthnCredential } from "~/lib/auth/webauthn";

interface PasskeyManagementProps {
  userId: string;
  onError?: QRL<(error: string) => void>;
}

export const PasskeyManagement = component$<PasskeyManagementProps>((props) => {
  const passkeys = useSignal<WebAuthnCredential[]>([]);
  const isLoading = useSignal(false);
  const isAdding = useSignal(false);
  const error = useSignal<string>("");
  const success = useSignal<string>("");
  const editingPasskey = useSignal<string | null>(null);
  const editingName = useSignal("");

  const loadPasskeys = $(async () => {
    isLoading.value = true;
    try {
      const userPasskeys = await webauthnClient.getUserPasskeys(props.userId);
      passkeys.value = userPasskeys;
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : "Failed to load passkeys";
      error.value = errorMsg;
      await props.onError?.(errorMsg);
    } finally {
      isLoading.value = false;
    }
  });

  const addPasskey = $(async () => {
    isAdding.value = true;
    error.value = "";
    success.value = "";

    try {
      // Use the authenticated user's addPasskey method (no email required)
      const result = await webauthnClient.addPasskey();

      if (result.success) {
        success.value = "Passkey added successfully!";
        await loadPasskeys();
      } else {
        error.value = result.error || "Failed to add passkey";
      }
    } catch (err) {
      error.value =
        err instanceof Error ? err.message : "Failed to add passkey";
    } finally {
      isAdding.value = false;
    }
  });

  const deletePasskey = $(async (credentialId: string) => {
    if (!confirm("Are you sure you want to delete this passkey?")) {
      return;
    }

    try {
      const deleteResult = await webauthnClient.deletePasskey(credentialId);
      if (deleteResult) {
        await loadPasskeys();
        success.value = "Passkey deleted successfully!";
      } else {
        error.value = "Failed to delete passkey";
      }
    } catch (err) {
      error.value =
        err instanceof Error ? err.message : "Failed to delete passkey";
    }
  });

  const startEditing = $((passkey: WebAuthnCredential) => {
    editingPasskey.value = passkey.id;
    editingName.value = passkey.name || "Passkey";
  });

  const savePasskeyName = $(async (credentialId: string) => {
    if (!editingName.value.trim()) {
      error.value = "Name cannot be empty";
      return;
    }

    try {
      const renameResult = await webauthnClient.renamePasskey(
        credentialId,
        editingName.value.trim(),
      );

      if (renameResult) {
        editingPasskey.value = null;
        editingName.value = "";
        await loadPasskeys();
        success.value = "Passkey renamed successfully!";
      } else {
        error.value = "Failed to rename passkey";
      }
    } catch (err) {
      error.value =
        err instanceof Error ? err.message : "Failed to rename passkey";
    }
  });

  const cancelEditing = $(() => {
    editingPasskey.value = null;
    editingName.value = "";
  });

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async () => {
    await loadPasskeys();
  });

  return (
    <div class="space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-lg font-medium text-gray-900">Passkeys</h3>
          <p class="text-sm text-gray-600">
            Manage your passkeys for secure, passwordless authentication
          </p>
        </div>
        <button
          type="button"
          onClick$={addPasskey}
          disabled={isAdding.value || isLoading.value}
          class="inline-flex items-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isAdding.value ? (
            <div class="flex items-center space-x-1">
              <div class="h-3 w-3 animate-spin rounded-full border border-white border-t-transparent"></div>
              <span>Adding...</span>
            </div>
          ) : (
            <div class="flex items-center space-x-1">
              <svg
                class="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke-width={1.5}
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M12 4.5v15m7.5-7.5h-15"
                />
              </svg>
              <span>Add Passkey</span>
            </div>
          )}
        </button>
      </div>

      {error.value && (
        <div class="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-600">
          {error.value}
        </div>
      )}

      {success.value && (
        <div class="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-600">
          {success.value}
        </div>
      )}

      {isLoading.value ? (
        <div class="flex items-center justify-center py-8">
          <div class="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"></div>
        </div>
      ) : passkeys.value.length === 0 ? (
        <div class="rounded-lg border-2 border-dashed border-gray-300 p-8 text-center">
          <svg
            class="mx-auto h-12 w-12 text-gray-400"
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
          <h3 class="mt-4 text-lg font-semibold text-gray-900">
            No passkeys yet
          </h3>
          <p class="mt-2 text-gray-600">
            Add a passkey to enable secure, passwordless authentication
          </p>
        </div>
      ) : (
        <div class="space-y-3">
          {passkeys.value.map((passkey) => (
            <div
              key={passkey.id}
              class="rounded-lg border border-gray-200 p-4 hover:border-gray-300"
            >
              <div class="flex items-center justify-between">
                <div class="flex items-center space-x-3">
                  <div class="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100">
                    <svg
                      class="h-5 w-5 text-blue-600"
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
                  <div>
                    {editingPasskey.value === passkey.id ? (
                      <div class="flex items-center space-x-2">
                        <input
                          type="text"
                          value={editingName.value}
                          onInput$={(e) => {
                            editingName.value = (
                              e.target as HTMLInputElement
                            ).value;
                          }}
                          class="rounded border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick$={() => savePasskeyName(passkey.id)}
                          class="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick$={cancelEditing}
                          class="rounded bg-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-400"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div>
                        <h4 class="font-medium text-gray-900">
                          {passkey.name || "Passkey"}
                        </h4>
                        <p class="text-sm text-gray-600">
                          Created {formatDate(passkey.created_at)}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
                {editingPasskey.value !== passkey.id && (
                  <div class="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick$={() => startEditing(passkey)}
                      class="rounded p-1 text-gray-400 hover:text-gray-600"
                      title="Rename"
                    >
                      <svg
                        class="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke-width={1.5}
                        stroke="currentColor"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"
                        />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick$={() => deletePasskey(passkey.id)}
                      class="rounded p-1 text-red-400 hover:text-red-600"
                      title="Delete"
                    >
                      <svg
                        class="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke-width={1.5}
                        stroke="currentColor"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
                        />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div class="rounded-lg bg-blue-50 p-4">
        <div class="flex">
          <svg
            class="h-5 w-5 text-blue-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width={1.5}
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z"
            />
          </svg>
          <div class="ml-3">
            <h3 class="text-sm font-medium text-blue-800">About Passkeys</h3>
            <div class="mt-2 text-sm text-blue-700">
              <p>
                Passkeys use your device's biometric authentication (Face ID,
                Touch ID, or Windows Hello) to provide secure, passwordless
                access to your account.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
