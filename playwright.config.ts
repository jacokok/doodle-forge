import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tools/browser-tests',
  use: { baseURL: 'http://127.0.0.1:5193', browserName: 'chromium' },
  webServer: {
    command: 'pnpm db:migrate && node apps/studio/build/index.js',
    url: 'http://127.0.0.1:5193/api/health',
    reuseExistingServer: false,
    env: {
      HOST: '127.0.0.1',
      PORT: '5193',
      ORIGIN: 'http://127.0.0.1:5193',
      DOODLEFORGE_STORAGE_ROOT: 'storage/playwright',
      DOODLEFORGE_DATABASE_PATH: 'storage/playwright/db/test.sqlite',
    },
  },
});
