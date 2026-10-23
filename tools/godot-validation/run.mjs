import { spawnSync, spawn } from 'node:child_process';
import { readFileSync, accessSync, constants } from 'node:fs';
import { homedir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { contentServers } from './content-server.mjs';
import { publishedApiTest } from './published-api.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const expected = '4.7.2.stable';
const binary = process.env.GODOT_BIN || 'godot';
// Only the intentional native PNG rejection may emit these engine diagnostics.
const decodeErrors = new Set([
  'ERROR: Condition "!success" is true. Returning: ERR_FILE_CORRUPT',
  'ERROR: Condition "err" is true. Returning: Ref<Image>()',
  'ERROR: Condition "image.is_null()" is true. Returning: ERR_PARSE_ERROR',
]);
const templateRoot =
  process.env.GODOT_TEMPLATE_DIR ||
  resolve(
    process.env.XDG_DATA_HOME || resolve(homedir(), '.local/share'),
    'godot/export_templates',
    expected,
  );
function version(command) {
  const result = spawnSync(command, ['--headless', '--version'], {
    encoding: 'utf8',
    timeout: 15000,
  });
  if (
    result.error ||
    result.status !== 0 ||
    !result.stdout.trim().startsWith(`${expected}.`)
  )
    throw new Error(`Expected ${expected} binary: ${command}`);
  return result.stdout.trim();
}
try {
  console.log(`Godot: ${version(binary)}`);
  if (
    readFileSync(resolve(templateRoot, 'version.txt'), 'utf8').trim() !==
    expected
  )
    throw new Error('Export template version mismatch');
  // Foundation host/export target is Linux x86_64 only. Both actual executables
  // must report the pin; a version.txt alone is insufficient.
  for (const name of ['linux_debug.x86_64', 'linux_release.x86_64']) {
    const path = resolve(templateRoot, name);
    accessSync(path, constants.X_OK);
    console.log(`Template: ${version(path)}`);
  }
  if (process.argv.includes('--editor')) {
    const child = spawn(
      binary,
      ['--editor', '--path', resolve(root, 'apps/game')],
      { stdio: 'inherit' },
    );
    child.once('exit', (code) => {
      process.exitCode = code ?? 1;
    });
    child.once('error', (error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
  } else {
    for (const args of [
      [
        '--headless',
        '--editor',
        '--import',
        '--path',
        resolve(root, 'apps/game'),
      ],
      ...['startup.gd', 'gameplay.gd', 'resources.gd'].map((test) => [
        '--headless',
        '--path',
        resolve(root, 'apps/game'),
        '--script',
        `res://tests/${test}`,
      ]),
    ]) {
      const result = spawnSync(binary, args, {
        encoding: 'utf8',
        timeout: 30000,
      });
      process.stdout.write(result.stdout || '');
      process.stderr.write(result.stderr || '');
      const errors = (result.stderr || '')
        .split('\n')
        .filter((line) => line.startsWith('ERROR:'));
      if (
        result.error ||
        result.status !== 0 ||
        /SCRIPT ERROR/.test(result.stderr || '') ||
        errors.some(
          (line) =>
            !args.includes('res://tests/resources.gd') ||
            !decodeErrors.has(line),
        )
      )
        throw new Error('Godot startup validation failed');
      if (
        args.includes('--script') &&
        !result.stdout.includes('"status":"passed"')
      )
        throw new Error('Missing Godot assertion report');
    }
    const peers = await contentServers();
    try {
      for (const test of ['content', 'cache']) {
        const result = await promisify(execFile)(
          binary,
          [
            '--headless',
            '--path',
            resolve(root, 'apps/game'),
            '--script',
            `res://tests/${test}.gd`,
          ],
          {
            env: { ...process.env, ...peers.env },
            timeout: 30000,
          },
        );
        process.stdout.write(result.stdout);
        process.stderr.write(result.stderr);
        if (
          /SCRIPT ERROR|ERROR:/.test(result.stderr) ||
          !result.stdout.includes('"status":"passed"')
        )
          throw new Error('Godot content validation failed');
      }
      peers.verify();
    } finally {
      await peers.close();
    }
    if (process.argv.includes('--published-api'))
      await publishedApiTest(binary);
  }
} catch (error) {
  console.error(
    `${error.message} (template directory: ${dirname(resolve(templateRoot, 'version.txt'))})`,
  );
  process.exitCode = 1;
}
