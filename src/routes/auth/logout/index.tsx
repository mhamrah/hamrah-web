import type { RequestHandler } from "@builder.io/qwik-city";
import { getCurrentUser } from "~/lib/auth/utils";
import { invalidateSession, deleteSessionTokenCookie } from "~/lib/auth/session";

export const onPost: RequestHandler = async (event) => {
  const { session } = await getCurrentUser(event);
  
  if (session) {
    await invalidateSession(event, session.id);
  }
  
  deleteSessionTokenCookie(event);
  throw event.redirect(302, "/auth/login");
};

export const onGet: RequestHandler = async (event) => {
  // For GET requests, also handle logout
  const { session } = await getCurrentUser(event);
  
  if (session) {
    await invalidateSession(event, session.id);
  }
  
  deleteSessionTokenCookie(event);
  throw event.redirect(302, "/auth/login");
};