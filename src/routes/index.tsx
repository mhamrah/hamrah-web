import { component$ } from '@builder.io/qwik';
import type { DocumentHead } from '@builder.io/qwik-city';
import { Link } from '@builder.io/qwik-city';

export default component$(() => {
  return (
    <div>
      Hello
    </div>
  );
});

export const head: DocumentHead = {
  title: "Hamrah's App",
};
