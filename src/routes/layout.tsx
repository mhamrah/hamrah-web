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
    // Always serve a cached response by default, up to a week stale
    staleWhileRevalidate: 60 * 60 * 24 * 7,
    // Max once every 5 seconds, revalidate on the server to get a fresh version of this page
    maxAge: 5,
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
