import assert from 'node:assert/strict';
import { once } from 'node:events';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { launch, stop, unusedPort, waitForHealth } from './processes.mjs';

async function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'doodle-startup-'));
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
  t.after(async () => {
    await Promise.all(children.map(stop));
    rmSync(directory, { recursive: true, force: true });
  });
  function start(args = ['--studio-only'], overrides = {}) {
    const child = launch(process.execPath, ['tools/dev.mjs', ...args], {
      env: { ...env, ...overrides },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    children.push(child);
    let output = '';
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (output += chunk));
    const timer = setTimeout(() => child.kill('SIGKILL'), 25000);
    child.done.finally(() => clearTimeout(timer));
    return { child, output: () => output };
  }
  async function migrate() {
    const child = launch(
      process.execPath,
      ['--import', 'tsx', 'tools/content-cli/src/index.ts', 'migrate'],
      { env, stdio: 'pipe' },
    );
    children.push(child);
    assert.equal((await child.done).code, 0);
  }
  return { env, start, migrate };
}

async function ready(instance, origin) {
  try {
    await waitForHealth(`${origin}/api/health`, instance.child);
  } catch (error) {
    throw new Error(`${error.message}\n${instance.output()}`, { cause: error });
  }
  for (let attempt = 0; attempt < 100; attempt++) {
    if (instance.output().includes('DoodleForge ready:')) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.fail(`No readiness banner: ${instance.output()}`);
}

async function occupy(t, port) {
  const server = createServer((socket) => socket.destroy());
  server.listen(Number(port), '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
}

for (const overrides of [
  { ORIGIN: 'http://127.0.0.1:59999' },
  { HOST: '0.0.0.0' },
]) {
  test(`reject invalid startup configuration ${JSON.stringify(overrides)} before storage creation`, async (t) => {
    const { env, start } = await fixture(t);
    // Ensure the mismatch case cannot coincidentally match the chosen port.
    if (overrides.ORIGIN) overrides.ORIGIN = `http://localhost:${env.PORT}`;
    const instance = start(undefined, overrides);
    assert.equal((await instance.child.done).code, 1);
    assert.match(instance.output(), /DoodleForge startup failed:/);
    assert.doesNotMatch(instance.output(), /DoodleForge ready:/);
    assert.equal(existsSync(env.DOODLEFORGE_DATABASE_PATH), false);
  });
}

test('unmigrated database fails with explicit recovery instructions and no ready banner', async (t) => {
  const { start } = await fixture(t);
  const instance = start();
  assert.equal((await instance.child.done).code, 1);
  assert.match(instance.output(), /Database is not ready/);
  assert.match(instance.output(), /pnpm db:migrate explicitly/);
  assert.match(instance.output(), /No migration or seed is run at startup/);
  assert.doesNotMatch(instance.output(), /DoodleForge ready:/);
});

test('studio-only starts without worker, serves empty library, and restarts with saved data', async (t) => {
  const { env, start, migrate } = await fixture(t);
  await migrate();
  await occupy(t, env.WORKER_PORT);
  const instance = start();
  await ready(instance, env.ORIGIN);
  assert.match(instance.output(), /Studio only; worker not started/);
  assert.match(instance.output(), new RegExp(`${env.ORIGIN}/characters`));
  assert.match(
    instance.output(),
    /Generation remains unavailable; no factory jobs are started/,
  );
  assert.equal((await fetch(`${env.ORIGIN}/characters`)).status, 200);
  assert.deepEqual(await (await fetch(`${env.ORIGIN}/api/characters`)).json(), {
    characters: [],
  });
  const saved = await fetch(`${env.ORIGIN}/api/characters`, {
    method: 'POST',
    headers: { Origin: env.ORIGIN, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Startup test',
      description: 'Temporary synthetic metadata',
      bodyType: 'humanoid',
    }),
  });
  assert.equal(saved.status, 201);
  instance.child.kill('SIGINT');
  assert.equal((await instance.child.done).code, 0);
  await assert.rejects(fetch(`${env.ORIGIN}/api/health`));
  const restarted = start();
  await ready(restarted, env.ORIGIN);
  const library = await (await fetch(`${env.ORIGIN}/api/characters`)).json();
  assert.equal(library.characters.length, 1);
  assert.equal(library.characters[0].name, 'Startup test');
  restarted.child.kill('SIGTERM');
  assert.equal((await restarted.child.done).code, 0);
  await assert.rejects(fetch(`${env.ORIGIN}/api/health`));
});

test('combined dev announces both healthy services and stops both on Ctrl-C', async (t) => {
  const { env, start, migrate } = await fixture(t);
  await migrate();
  const instance = start([]);
  await ready(instance, env.ORIGIN);
  assert.match(
    instance.output(),
    /Studio \+ worker health ready \(no generation jobs\)/,
  );
  assert.equal(
    (await fetch(`http://127.0.0.1:${env.WORKER_PORT}/health`)).status,
    200,
  );
  instance.child.kill('SIGINT');
  assert.equal((await instance.child.done).code, 0);
  for (const url of [
    `${env.ORIGIN}/api/health`,
    `http://127.0.0.1:${env.WORKER_PORT}/health`,
  ]) {
    await assert.rejects(fetch(url));
  }
});

test('occupied studio port fails instead of selecting another port', async (t) => {
  const { env, start, migrate } = await fixture(t);
  await migrate();
  await occupy(t, env.PORT);
  const instance = start();
  assert.equal((await instance.child.done).code, 1);
  assert.match(instance.output(), /Port .* is already in use/);
  assert.match(instance.output(), /port availability/);
  assert.doesNotMatch(instance.output(), /DoodleForge ready:/);
});

test('combined dev worker failure stops studio without claiming readiness', async (t) => {
  const { env, start, migrate } = await fixture(t);
  await migrate();
  await occupy(t, env.WORKER_PORT);
  const instance = start([]);
  assert.equal((await instance.child.done).code, 1);
  assert.match(instance.output(), /worker.start_failed/);
  assert.doesNotMatch(instance.output(), /DoodleForge ready:/);
  await assert.rejects(fetch(`${env.ORIGIN}/api/health`));
});
