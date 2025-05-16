import { QwikAuth$ } from "@auth/qwik";
import type { DefaultSession } from "@auth/qwik";
import Google from "@auth/qwik/providers/google";
import Apple from "@auth/qwik/providers/apple";
import { D1Adapter } from "@auth/d1-adapter"
import type { RequestEventCommon } from "@builder.io/qwik-city";

declare module "@auth/qwik" {
  /**
   * Returned by the `useSession` hook and the `session` object in the sharedMap
   */
  interface Session {
    user: {
      /** The user's postal address. */
      id: string | null
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
  (ev: RequestEventCommon) => ({
    providers: [
    //   Auth0({
    //   async profile(profile) {
    //     console.log("profile", profile)
    //     return profile
    //   },
    // }
  //)
  Google,
  Apple
    ],
    callbacks: {
      jwt({ token, user }) {
        // eslint-disable-next-line
        if (user !== undefined) {
          // @ts-ignore
          token.picture = user.image
        }
        return token
      },
      session({ session, token }) {
        console.log("session", session, token)
        if (token && token.sub) {
          session.user.id = token.sub
        }
        return session
      },
    },
    pages: {
      // signIn: "/auth/login",
    },
    // @ts-ignore
    adapter: D1Adapter(ev.platform.env.DB),
  }),

);

