
import { component$ } from "@builder.io/qwik"
import { Form } from "@builder.io/qwik-city"
import type { DocumentHead } from "@builder.io/qwik-city"
import { useSignIn } from '~/routes/plugin@auth';

import { Link } from "@builder.io/qwik-city"
export default component$(() => {
  const signInSig = useSignIn()

  return (
    <>
      {/* server-side login with Form action */}
      <Form action={signInSig}>
        <input type="hidden" name="providerId" value="google" />
        <input
          type="hidden"
          name="options.redirectTo"
          value="/"
        />
        <button>Sign In</button>
      </Form>

      {/* submit method */}
      <Link
        onClick$={() => signInSig.submit({ redirectTo: "/" })}
      >
        SignIn
      </Link>
    </>
  )
})

export const head: DocumentHead = {
  title: "Hamrah App: Sign In",
  meta: [
    {
      name: "description",
      content: "Hamrah App is a playground for Qwik",
    },
  ],
};
