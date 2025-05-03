import { component$ } from "@builder.io/qwik";
import type { DocumentHead } from "@builder.io/qwik-city";
import { useSession } from "~/routes/plugin@auth";

export default component$(() => {
  const session = useSession();

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
            name: {session.value.user.name}
          </p>
          <p class="text-sm text-muted-foreground">
            id: {session.value.user.id}
          </p>
 
        </div>
      ) : (
        <p class="mt-4 text-muted-foreground">
          Please <a href="/auth/signin" class="text-primary hover:underline">sign in</a> to continue
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
