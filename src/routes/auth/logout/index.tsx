import type { RequestHandler } from "@builder.io/qwik-city";
import { createApiClient } from "~/lib/auth/api-client";
import { deleteSessionTokenCookie } from "~/lib/auth/session";

export const onPost: RequestHandler = async (event) => {
  try {
    // Use public logout endpoint which handles cookie-based logout
    const apiClient = createApiClient(event);
    await apiClient.logout();
  } catch (error) {
    // Continue with logout even if API call fails
    console.error("Logout API error:", error);
  }

  // Always clear local cookie
  deleteSessionTokenCookie(event);
  throw event.redirect(302, "/auth/login");
};

export const onGet: RequestHandler = async (event) => {
  try {
    // Use public logout endpoint which handles cookie-based logout
    const apiClient = createApiClient(event);
    await apiClient.logout();
  } catch (error) {
    // Continue with logout even if API call fails
    console.error("Logout API error:", error);
  }

  // Always clear local cookie
  deleteSessionTokenCookie(event);
  throw event.redirect(302, "/auth/login");
};
