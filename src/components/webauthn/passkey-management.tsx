import { component$, useSignal, useTask$, $ } from "@builder.io/qwik";
import { server$ } from "@builder.io/qwik-city";

interface PasskeyCredential {
  id: string;
  name: string | null;
  createdAt: Date;
  lastUsed: Date | null;
  credentialDeviceType: string | null;
  credentialBackedUp: boolean;
}

const getCredentials = server$(async function (this: any) {
  try {
    const { getCurrentUser } = await import("~/lib/auth/utils");
    const { getUserWebAuthnCredentials } = await import("~/lib/auth/webauthn");

    const { user } = await getCurrentUser(this as any);
    if (!user) {
      throw new Error("Not authenticated");
    }

    const credentials = await getUserWebAuthnCredentials(this as any, user.id);
    return credentials.map((cred) => ({
      ...cred,
      name: cred.name || `Passkey ${cred.id.slice(-8)}`, // Default name if null
    }));
  } catch (error: any) {
    console.error("Get credentials error:", error);
    throw new Error(error.message || "Failed to get credentials");
  }
});

const deleteCredential = server$(async function (
  this: any,
  credentialId: string,
) {
  try {
    const { getCurrentUser } = await import("~/lib/auth/utils");
    const { deleteWebAuthnCredential } = await import("~/lib/auth/webauthn");

    const { user } = await getCurrentUser(this as any);
    if (!user) {
      throw new Error("Not authenticated");
    }

    const success = await deleteWebAuthnCredential(
      this as any,
      credentialId,
      user.id,
    );
    if (!success) {
      throw new Error("Failed to delete credential");
    }

    return { success: true };
  } catch (error: any) {
    console.error("Delete credential error:", error);
    throw new Error(error.message || "Failed to delete credential");
  }
});

const updateCredentialName = server$(async function (
  this: any,
  credentialId: string,
  name: string,
) {
  try {
    const { getCurrentUser } = await import("~/lib/auth/utils");
    const { updateWebAuthnCredentialName } = await import(
      "~/lib/auth/webauthn"
    );

    const { user } = await getCurrentUser(this as any);
    if (!user) {
      throw new Error("Not authenticated");
    }

    const success = await updateWebAuthnCredentialName(
      this as any,
      credentialId,
      user.id,
      name,
    );
    if (!success) {
      throw new Error("Failed to update credential name");
    }

    return { success: true };
  } catch (error: any) {
    console.error("Update credential error:", error);
    throw new Error(error.message || "Failed to update credential name");
  }
});

export const PasskeyManagement = component$(() => {
  const credentials = useSignal<PasskeyCredential[]>([]);
  const isLoading = useSignal(true);
  const error = useSignal<string>("");
  const editingId = useSignal<string>("");
  const editingName = useSignal<string>("");

  useTask$(async () => {
    try {
      isLoading.value = true;
      credentials.value = await getCredentials();
    } catch (err: any) {
      error.value = err.message || "Failed to load passkeys";
    } finally {
      isLoading.value = false;
    }
  });

  const handleDelete = $(async (credentialId: string) => {
    if (!confirm("Are you sure you want to delete this passkey?")) {
      return;
    }

    try {
      await deleteCredential(credentialId);
      credentials.value = credentials.value.filter(
        (cred) => cred.id !== credentialId,
      );
    } catch (err: any) {
      error.value = err.message || "Failed to delete passkey";
    }
  });

  const handleStartEdit = $((credential: PasskeyCredential) => {
    editingId.value = credential.id;
    editingName.value = credential.name || `Passkey ${credential.id.slice(-8)}`;
  });

  const handleSaveEdit = $(async () => {
    if (!editingId.value || !editingName.value.trim()) {
      return;
    }

    try {
      await updateCredentialName(editingId.value, editingName.value.trim());

      // Update local state
      credentials.value = credentials.value.map((cred) =>
        cred.id === editingId.value
          ? { ...cred, name: editingName.value.trim() }
          : cred,
      );

      editingId.value = "";
      editingName.value = "";
    } catch (err: any) {
      error.value = err.message || "Failed to update passkey name";
    }
  });

  const handleCancelEdit = $(() => {
    editingId.value = "";
    editingName.value = "";
  });

  const formatDate = (date: Date | string) => {
    const dateObj = typeof date === "string" ? new Date(date) : date;
    return dateObj.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (isLoading.value) {
    return (
      <div class="flex items-center justify-center py-8">
        <svg
          class="h-8 w-8 animate-spin text-gray-400"
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
      </div>
    );
  }

  return (
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <h3 class="text-lg font-medium text-gray-900">Your Passkeys</h3>
        <span class="text-sm text-gray-500">
          {credentials.value.length} passkey(s)
        </span>
      </div>

      {error.value && (
        <div class="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-600">
          {error.value}
        </div>
      )}

      {credentials.value.length === 0 ? (
        <div class="py-8 text-center text-gray-500">
          <svg
            class="mx-auto h-12 w-12 text-gray-400"
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
          <p class="mt-2">No passkeys found</p>
          <p class="text-sm">
            Add a passkey to enable secure, passwordless authentication
          </p>
        </div>
      ) : (
        <div class="space-y-3">
          {credentials.value.map((credential) => (
            <div
              key={credential.id}
              class="rounded-lg border border-gray-200 bg-white p-4"
            >
              <div class="flex items-start justify-between">
                <div class="flex-1">
                  {editingId.value === credential.id ? (
                    <div class="mb-2 flex items-center space-x-2">
                      <input
                        type="text"
                        value={editingName.value}
                        onInput$={(e) =>
                          (editingName.value = (
                            e.target as HTMLInputElement
                          ).value)
                        }
                        class="flex-1 rounded border border-gray-300 px-2 py-1 text-sm focus:ring-1 focus:ring-blue-500 focus:outline-none"
                        placeholder="Enter passkey name"
                      />
                      <button
                        onClick$={handleSaveEdit}
                        class="rounded bg-green-600 px-2 py-1 text-xs text-white hover:bg-green-700"
                      >
                        Save
                      </button>
                      <button
                        onClick$={handleCancelEdit}
                        class="rounded bg-gray-600 px-2 py-1 text-xs text-white hover:bg-gray-700"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div class="mb-2 flex items-center space-x-2">
                      <h4 class="font-medium text-gray-900">
                        {credential.name ||
                          `Passkey ${credential.id.slice(-8)}`}
                      </h4>
                      <button
                        onClick$={() => handleStartEdit(credential)}
                        class="text-xs text-blue-600 hover:text-blue-800"
                      >
                        Rename
                      </button>
                    </div>
                  )}

                  <div class="space-y-1 text-sm text-gray-600">
                    <p>Created: {formatDate(credential.createdAt)}</p>
                    {credential.lastUsed && (
                      <p>Last used: {formatDate(credential.lastUsed)}</p>
                    )}
                    <div class="flex items-center space-x-4">
                      {credential.credentialDeviceType && (
                        <span class="inline-flex items-center rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800">
                          {credential.credentialDeviceType === "singleDevice"
                            ? "Device-bound"
                            : "Synced"}
                        </span>
                      )}
                      {credential.credentialBackedUp && (
                        <span class="inline-flex items-center rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
                          Backed up
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  onClick$={() => handleDelete(credential.id)}
                  class="ml-4 text-sm text-red-600 hover:text-red-800"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
