import { component$ } from "@builder.io/qwik";
import { type DocumentHead } from "@builder.io/qwik-city";

export default component$(() => {
  return (
    <>
      <h1>Hamrah App</h1>
      <p class="mt-4 text-muted-foreground">
        Welcome to Hamrah App - a Qwik playground!
      </p>
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
