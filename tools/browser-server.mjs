import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launch, stop } from './processes.mjs';

const root = mkdtempSync(join(tmpdir(), 'doodle-browser-'));
const env = {
  ...process.env,
  BODY_SIZE_LIMIT: '10551296',
  DOODLEFORGE_STORAGE_ROOT: root,
  DOODLEFORGE_DATABASE_PATH: join(root, 'db', 'test.sqlite'),
};
let child;
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  await stop(child);
}
process.once('SIGTERM', () => void shutdown());
process.once('SIGINT', () => void shutdown());
try {
  child = launch('pnpm', ['--filter', '@doodleforge/studio', 'build'], { env });
  if ((await child.done).code !== 0)
    throw new Error('Browser studio build failed');
  child = launch('pnpm', ['db:migrate'], { env });
  if ((await child.done).code !== 0)
    throw new Error('Browser database migration failed');
  if (!stopping) {
    child = launch(process.execPath, ['apps/studio/build/index.js'], { env });
    const result = await child.done;
    if (!stopping && result.code !== 0)
      throw new Error('Browser studio failed');
  }
} finally {
  await stop(child);
  rmSync(root, { recursive: true, force: true });
}
