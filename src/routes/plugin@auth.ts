import { QwikAuth$ } from "@auth/qwik";
import type { DefaultSession } from "@auth/qwik";
import Google from "@auth/qwik/providers/google";
import { D1Adapter } from "@auth/d1-adapter"

declare module "@auth/qwik" {
  /**
   * Returned by the `useSession`EnvGetter hook and the `session` object in the sharedMap
   */
  interface Session {
    user: {
      /** The user's postal address. */
      id: string | undefined
      /**
       * By default, TypeScript merges new interface properties and overwrites existing ones.
       * In this case, the default session user properties will be overwritten,
       * with the new ones defined above. To keep the default session user properties,
       * you need to add them back into the newly declared interface.
       */
    } & DefaultSession["user"]
  }
}


export const { onRequest, useSession, useSignIn, useSignOut } = QwikAuth$(
  (ev) => ({
    providers: [Google],
    callbacks: {
      async session({ session, token, user }) {

        console.log("session", session)
        console.log("token", token)
        console.log("user", user)
        // session.user.id = token.sub as string;
        //console.log("session", session, "token", token, "user", user);
        return session;
      },
      async jwt({ token, user, account, profile }) {
        console.log("jwt", token, "user", user, "account", account, "profile", profile);

        return token;
      },
    },
    experimental: {
      enableWebAuthn: true
    },
    //@ts-ignore
    adapter: D1Adapter(ev.platform.env.DB),
  }),
);
