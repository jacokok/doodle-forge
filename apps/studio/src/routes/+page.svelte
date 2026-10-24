<script lang="ts">
  import { resolve } from '$app/paths';
</script>

<svelte:head>
  <title>DoodleForge Studio</title>
  <meta
    name="description"
    content="Turn drawings into approved game characters."
  />
</svelte:head>

<main class="mx-auto max-w-3xl px-6 py-16">
  <p class="font-semibold text-indigo-700">DoodleForge</p>
  <h1 class="mt-3 text-4xl font-bold">Your drawings, ready for adventure.</h1>
  <p class="mt-6 text-lg">
    Create and edit metadata, attach private original art, and inspect frozen
    review history in the library. Generation and approval/publication actions
    are unavailable here; released visibility is shown read-only.
  </p>
  <a
    class="mt-8 mr-4 inline-block rounded-lg bg-indigo-700 px-5 py-3 font-semibold text-white"
    href={resolve('/characters')}>Open character library</a
  >
  <a
    class="mt-8 inline-block rounded-lg bg-indigo-700 px-5 py-3 font-semibold text-white"
    href={resolve('/api/health')}>Check studio health</a
  >
</main>
