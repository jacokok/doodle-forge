import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { launch, stop } from './processes.mjs';

// Load .env only from the workspace root; inherited variables take precedence.
if (existsSync('.env')) process.loadEnvFile(resolve('.env'));
const children = [];
let stopping = false;
async function shutdown(code) {
  if (stopping) return;
  stopping = true;
  await Promise.all(children.map(stop));
  process.exitCode = code;
}
process.once('SIGINT', () => {
  void shutdown(0);
});
process.once('SIGTERM', () => {
  void shutdown(0);
});
try {
  // Launch actual entrypoints rather than pnpm wrappers so signals reach them.
  children.push(
    launch(
      process.execPath,
      [
        'node_modules/vite/bin/vite.js',
        '--host',
        process.env.HOST || '127.0.0.1',
        '--port',
        process.env.PORT || '5173',
        '--strictPort',
      ],
      { cwd: resolve('apps/studio') },
    ),
  );
  children.push(
    launch(process.execPath, ['--import', 'tsx', 'apps/worker/src/index.ts']),
  );
  const first = await Promise.race(children.map((child) => child.done));
  await shutdown(stopping ? 0 : first.code || 1);
} catch (error) {
  console.error(error.message);
  await shutdown(1);
}
