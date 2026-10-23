import { defineConfig } from 'vite';
import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { loadConfig } from '@doodleforge/shared/server';

export default defineConfig({
  plugins: [
    tailwindcss(),
    sveltekit({
      adapter: adapter(),
      paths: { origin: loadConfig().origin },
      preprocess: vitePreprocess(),
      compilerOptions: { experimental: { async: true } },
      experimental: { remoteFunctions: true },
    }),
  ],
  ssr: {
    external: ['sharp'],
    noExternal: [
      '@doodleforge/image-processing',
      '@doodleforge/shared',
      '@doodleforge/database',
      '@doodleforge/content-publisher',
      '@doodleforge/contracts',
    ],
  },
});
