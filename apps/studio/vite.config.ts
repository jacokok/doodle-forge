import { defineConfig } from 'vite';
import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [
    tailwindcss(),
    sveltekit({ adapter: adapter(), preprocess: vitePreprocess() }),
  ],
  ssr: { noExternal: ['@doodleforge/shared', '@doodleforge/database'] },
});
