import { DefaultSession, QwikAuth$ } from "@auth/qwik";
import Auth0 from "@auth/qwik/providers/auth0";


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
  () => ({
    providers: [Auth0({
      async profile(profile) {
        console.log("profile", profile)
        return profile
      },
    })],
    callbacks: {
      jwt({ token, user }) {
        // eslint-disable-next-line
        if (user !== undefined) {
          // @ts-ignore
          token.picture = user.picture
        }
        return token
      },
      session({ session, token }) {
        if (token.sub) {
          session.user.id = token.sub
        }
        return session
      },
    },
    pages: {
      signIn: "/auth/login",
    },
  }),

);
