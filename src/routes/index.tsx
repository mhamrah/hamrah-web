import { component$ } from "@builder.io/qwik";
import { Link, type DocumentHead } from "@builder.io/qwik-city";
import { useSession, useSignOut } from "~/routes/plugin@auth";

export default component$(() => {
  const session = useSession();
  const signOutSig = useSignOut();

  return (
    <>
      <h1>Hamrah App</h1>
      {session.value?.user ? (
        <div class="mt-4">
          <p class="text-lg">Welcome, {session.value.user.email}</p>
          <p class="text-sm text-muted-foreground">
            email: {session.value.user.email}
          </p>
          <p class="text-sm text-muted-foreground">
            image: {session.value.user.image}
          </p>
          <p class="text-sm text-muted-foreground">
            name: {session.value.user.name || "unknown"}
          </p>
          <p class="text-sm text-muted-foreground">
            id: {session.value.user.id}
          </p>
          <Link onClick$={() => signOutSig.submit({ redirectTo: "/" })}>
            Sign Out
          </Link>
        </div>
      ) : (
        <p class="mt-4 text-muted-foreground">
          Please <a href="/auth/login" class="text-primary hover:underline">sign in here</a> to continue
        </p>
      )}
    </>
  );
});

export const head: DocumentHead = {
  title: "Hamrah App",
  meta: [
    {
      name: "description",
      content: "Hamrah App is a playground for Qwik",
    },
  ],
};
