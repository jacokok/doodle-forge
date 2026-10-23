import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launch, stop, unusedPort, waitForHealth } from './processes.mjs';

const directory = mkdtempSync(join(tmpdir(), 'doodle-smoke-'));
const port = await unusedPort();
let workerPort = await unusedPort();
while (workerPort === port) workerPort = await unusedPort();
const env = {
  ...process.env,
  DOODLEFORGE_STORAGE_ROOT: directory,
  DOODLEFORGE_DATABASE_PATH: join(directory, 'db/test.sqlite'),
  HOST: '127.0.0.1',
  PORT: String(port),
  WORKER_PORT: String(workerPort),
  ORIGIN: `http://127.0.0.1:${port}`,
};
const children = [];
try {
  const migration = launch(
    process.execPath,
    ['--import', 'tsx', 'tools/content-cli/src/index.ts', 'migrate'],
    { env },
  );
  assert.equal((await migration.done).code, 0);
  const initialReconciliation = launch(
    process.execPath,
    ['--import', 'tsx', 'tools/content-cli/src/index.ts', 'reconcile'],
    { env },
  );
  assert.equal((await initialReconciliation.done).code, 0);
  const studio = launch(process.execPath, ['apps/studio/build/index.js'], {
    env,
  });
  const worker = launch(process.execPath, ['apps/worker/dist/index.js'], {
    env,
  });
  children.push(studio, worker);
  assert.deepEqual(await waitForHealth(`${env.ORIGIN}/api/health`, studio), {
    status: 'ok',
    service: 'studio',
    generation: 'unavailable',
  });
  assert.deepEqual(
    await waitForHealth(`http://127.0.0.1:${workerPort}/health`, worker),
    { status: 'ok', service: 'worker', generation: 'unavailable' },
  );
  const page = await fetch(env.ORIGIN);
  assert.equal(page.status, 200);
  assert.match(
    (await page.text()).replace(/\s+/g, ' '),
    /Character creation, generation and publishing are not available yet/,
  );
  assert.equal(
    (await fetch(`${env.ORIGIN}/storage/originals/private.png`)).status,
    404,
  );
  const content = launch(
    process.execPath,
    ['--import', 'tsx', 'tools/content-cli/src/api-smoke.ts'],
    { env },
  );
  assert.equal((await content.done).code, 0);
  const reconcile = launch(
    process.execPath,
    ['--import', 'tsx', 'tools/content-cli/src/index.ts', 'reconcile'],
    { env, stdio: ['ignore', 'pipe', 'inherit'] },
  );
  let reconciliationOutput = '';
  reconcile.stdout.on('data', (chunk) => {
    reconciliationOutput += chunk.toString();
  });
  assert.equal(
    (await reconcile.done).code,
    1,
    'corrupt ready releases must fail the operator check',
  );
  assert.match(reconciliationOutput, /"corruptReady":\["/);
  await stop(worker);
  assert.equal((await worker.done).code, 0);
  const restarted = launch(process.execPath, ['apps/worker/dist/index.js'], {
    env,
  });
  children.push(restarted);
  await waitForHealth(`http://127.0.0.1:${workerPort}/health`, restarted);
  await stop(restarted);
  assert.equal((await restarted.done).code, 0);
  await stop(studio);
  assert.equal((await studio.done).code, 0);
  const development = launch(process.execPath, ['tools/dev.mjs'], { env });
  children.push(development);
  await waitForHealth(`${env.ORIGIN}/api/health`, development);
  await waitForHealth(`http://127.0.0.1:${workerPort}/health`, development);
  development.kill('SIGINT');
  const deadline = setTimeout(() => development.kill('SIGKILL'), 10000);
  try {
    assert.equal((await development.done).code, 0);
  } finally {
    clearTimeout(deadline);
  }
  for (const url of [
    `${env.ORIGIN}/api/health`,
    `http://127.0.0.1:${workerPort}/health`,
  ]) {
    await assert.rejects(fetch(url, { signal: AbortSignal.timeout(1000) }));
  }
  console.log(
    'PASS: built studio/worker health, private storage 404, worker restart/SIGTERM and dev supervisor/SIGINT cleanup',
  );
} finally {
  await Promise.all(children.map(stop));
  rmSync(directory, { recursive: true, force: true });
}
