import { component$, useOnWindow, $ } from "@builder.io/qwik"
import { Form, Link } from "@builder.io/qwik-city"
import type { DocumentHead } from "@builder.io/qwik-city"
import { useSignIn } from "~/routes/plugin@auth"

export default component$(() => {
    const signInSig = useSignIn()

    useOnWindow("load",
        $((event) => {
            console.log("track")
            signInSig.submit({ providerId: "auth0", redirectTo: "/" })
        }
        ))
    return (
        <>

        </>
    )
})

export const head: DocumentHead = {
    title: "Hamrah App",
    meta: [
        {
            name: "description",
            content: "Hamrah App is a playground for Qwik",
        },
    ],
};
