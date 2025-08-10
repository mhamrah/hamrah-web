import { component$, Slot } from "@builder.io/qwik";
import { routeLoader$ } from "@builder.io/qwik-city";
import type { RequestHandler } from "@builder.io/qwik-city";
import { getCurrentUser } from "~/lib/auth/utils";

export const onRequest: RequestHandler = async (event) => {
  // Skip auth check for auth routes and public routes
  if (event.url.pathname.startsWith("/auth/")) {
    return;
  }

  const { user } = await getCurrentUser(event);

  if (!user) {
    throw event.redirect(302, "/auth/login");
  }

  // Store user in shared map for use in components
  event.sharedMap.set("user", user);
};

export const onGet: RequestHandler = async ({ cacheControl }) => {
  // Control caching for this request for best performance and to reduce hosting costs:
  // https://qwik.dev/docs/caching/
  cacheControl({
    // Disable caching for auth-protected pages to prevent stale authentication state
    // This ensures that after logout, the page will always check current auth status
    staleWhileRevalidate: 0,
    maxAge: 0,
    // Set no-cache headers to prevent browser caching of auth state
    public: false,
    noCache: true,
    noStore: true,
  });
};

export const useServerTimeLoader = routeLoader$(() => {
  return {
    date: new Date().toISOString(),
  };
});

export const useUserLoader = routeLoader$(async (event) => {
  return event.sharedMap.get("user") || null;
});

export default component$(() => {
  return (
    <>
      {/* <Header /> */}
      <main>
        <Slot />
      </main>
      {/* <Footer /> */}
    </>
  );
});
