import assert from 'node:assert/strict';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { launch, stop, unusedPort, waitForHealth } from '../processes.mjs';

// Real built SvelteKit routes, migrated SQLite and actual approval/publication.
export async function publishedApiTest(binary) {
  const gameplayPaths = [
    'project.godot',
    'scenes/main.tscn',
    'scenes/fighter.tscn',
    'scripts/fighter.gd',
    'scripts/fixtures.gd',
    'scripts/arena.gd',
    'scripts/enemy_brain.gd',
  ];
  const fingerprint = () =>
    Promise.all(
      gameplayPaths.map(async (path) =>
        createHash('sha256')
          .update(await readFile(resolve('apps/game', path)))
          .digest('hex'),
      ),
    );
  const before = await fingerprint();
  const temporaryRoot = process.env.TMPDIR || '/tmp/opencode';
  await mkdir(temporaryRoot, { recursive: true });
  const directory = await mkdtemp(join(temporaryRoot, 'doodle-runtime-'));
  const port = await unusedPort();
  const env = {
    ...process.env,
    DOODLEFORGE_STORAGE_ROOT: directory,
    DOODLEFORGE_DATABASE_PATH: join(directory, 'db/test.sqlite'),
    HOST: '127.0.0.1',
    PORT: String(port),
    ORIGIN: `http://127.0.0.1:${port}`,
    DOODLEFORGE_PUBLISHED_API_URL: `http://127.0.0.1:${port}`,
  };
  let studio;
  let control;
  try {
    for (const args of [
      ['--import', 'tsx', 'tools/content-cli/src/index.ts', 'migrate'],
      ['--import', 'tsx', 'tools/content-cli/src/runtime-seed.ts'],
    ]) {
      const result = await promisify(execFile)(process.execPath, args, {
        env,
        timeout: 30000,
      });
      process.stdout.write(result.stdout);
      process.stderr.write(result.stderr);
    }
    studio = launch(process.execPath, ['apps/studio/build/index.js'], { env });
    await waitForHealth(`${env.ORIGIN}/api/health`, studio);
    const result = await promisify(execFile)(
      binary,
      [
        '--headless',
        '--path',
        resolve('apps/game'),
        '--script',
        'res://tests/published_api.gd',
      ],
      { env, timeout: 30000 },
    );
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
    assert.doesNotMatch(result.stderr, /SCRIPT ERROR|ERROR:/);
    assert.match(result.stdout, /"status":"passed"/);
    const saved = new Map();
    // A test-only coordination server. All content still comes from real studio.
    control = createServer(async (request, response) => {
      try {
        if (request.url === '/advance') {
          await promisify(execFile)(
            process.execPath,
            [
              '--import',
              'tsx',
              'tools/content-cli/src/runtime-seed.ts',
              'advance',
            ],
            { env, timeout: 15000 },
          );
        } else if (['/corrupt', '/corrupt-index'].includes(request.url)) {
          const indexResponse = await fetch(`${env.ORIGIN}/api/content/index`, {
            signal: AbortSignal.timeout(5000),
          });
          assert.equal(indexResponse.status, 200);
          const index = await indexResponse.json();
          let filename;
          if (request.url === '/corrupt-index') {
            filename = join(
              directory,
              'published/releases',
              index.releaseId,
              'index.json',
            );
          } else {
            const manifest = JSON.parse(
              await readFile(
                'packages/contracts/fixtures/comet/v1/character.json',
                'utf8',
              ),
            );
            filename = join(
              directory,
              'published/characters',
              manifest.characterId,
              'v1',
              manifest.assets[manifest.animations.idle.assetId].path,
            );
          }
          saved.set(request.url, { filename, bytes: await readFile(filename) });
          await chmod(filename, 0o644);
          await writeFile(filename, 'deliberate integration-test corruption');
        } else if (['/restore', '/restore-index'].includes(request.url)) {
          const { filename, bytes } = saved.get(
            request.url.replace('restore', 'corrupt'),
          );
          await writeFile(filename, bytes);
          await chmod(filename, 0o444);
        } else {
          throw new Error('Unknown test action');
        }
        response.writeHead(200).end('ok');
      } catch (error) {
        console.error(error);
        response.writeHead(500).end('test action failed');
      }
    });
    await new Promise((resolve) => control.listen(0, '127.0.0.1', resolve));
    const arena = await promisify(execFile)(
      binary,
      [
        '--headless',
        '--path',
        resolve('apps/game'),
        '--script',
        'res://tests/published_arena.gd',
        '--',
        `--content-api=${env.ORIGIN}`,
      ],
      {
        env: {
          ...env,
          DOODLEFORGE_ARENA_CONTROL: `http://127.0.0.1:${control.address().port}`,
        },
        timeout: 60000,
      },
    );
    process.stdout.write(arena.stdout);
    process.stderr.write(arena.stderr);
    assert.doesNotMatch(arena.stderr, /SCRIPT ERROR|ERROR:/);
    assert.match(arena.stdout, /"suite":"published_arena"/);
    assert.match(arena.stdout, /"status":"passed"/);
    assert.deepEqual(await fingerprint(), before, 'Gameplay source changed');
  } catch (error) {
    if (error.stdout) process.stdout.write(error.stdout);
    if (error.stderr) process.stderr.write(error.stderr);
    throw error;
  } finally {
    if (control) await new Promise((resolve) => control.close(resolve));
    await stop(studio);
    await rm(directory, { recursive: true, force: true });
  }
}
