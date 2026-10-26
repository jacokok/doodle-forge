import { resolve } from 'node:path';
import { loadConfig, repositoryRoot } from '../packages/shared/src/server.ts';
import { launch, stop, waitForHealth } from './processes.mjs';

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
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 1 || args[0] !== '--studio-only'))
    throw new Error('Usage: pnpm dev or pnpm dev:studio');
  const studioOnly = args[0] === '--studio-only';
  // Reuse server validation and root .env loading, including inherited overrides.
  const config = loadConfig();
  const hostname = config.host === '::1' ? '[::1]' : config.host;
  const listenOrigin = new URL(`http://${hostname}:${config.port}`).origin;
  if (config.origin !== listenOrigin)
    throw new Error(
      'HOST, PORT and ORIGIN must describe the same local studio URL; check .env and inherited environment variables',
    );
  // Launch actual entrypoints rather than pnpm wrappers so signals reach them.
  const studio = launch(
    process.execPath,
    [
      resolve(repositoryRoot, 'apps/studio/node_modules/vite/bin/vite.js'),
      '--host',
      config.host,
      '--port',
      String(config.port),
      '--strictPort',
    ],
    { cwd: resolve(repositoryRoot, 'apps/studio') },
  );
  children.push(studio);
  const healthChecks = [waitForHealth(`${config.origin}/api/health`, studio)];
  if (!studioOnly) {
    const worker = launch(process.execPath, [
      '--import',
      'tsx',
      resolve(repositoryRoot, 'apps/worker/src/index.ts'),
    ]);
    children.push(worker);
    healthChecks.push(
      waitForHealth(`http://${hostname}:${config.workerPort}/health`, worker),
    );
  }
  const exited = Promise.race(children.map((child) => child.done));
  await Promise.race([
    Promise.all(healthChecks).then((health) => {
      if (
        health.some(
          (result, index) =>
            result.status !== 'ok' ||
            result.service !== (index === 0 ? 'studio' : 'worker') ||
            result.generation !== 'unavailable',
        )
      )
        throw new Error('Unexpected local service health response');
    }),
    exited.then(() => {
      throw new Error('A local service exited before startup completed');
    }),
  ]);
  if (!stopping) {
    console.log(`\nDoodleForge ready: ${config.origin}/characters`);
    console.log(
      'Create/edit characters, attach private originals, and review/publish supported frozen fixtures. Generation remains unavailable; no factory jobs are started.',
    );
    console.log(
      studioOnly
        ? 'Studio only; worker not started. Ctrl-C stops the studio.'
        : 'Studio + worker health ready (no generation jobs). Ctrl-C stops both.',
    );
  }
  const first = await exited;
  await shutdown(stopping ? 0 : first.code || 1);
} catch (error) {
  if (!stopping) {
    console.error(`DoodleForge startup failed: ${error.message}`);
    console.error(
      'Check .env, inherited environment and port availability. For a new or outdated database, stop services and run pnpm db:migrate explicitly. No migration or seed is run at startup.',
    );
  }
  await shutdown(stopping ? 0 : 1);
}
