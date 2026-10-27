import { existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

function findRepositoryRoot() {
  let directory = dirname(fileURLToPath(import.meta.url));
  while (!existsSync(resolve(directory, 'pnpm-workspace.yaml'))) {
    const parent = dirname(directory);
    if (parent === directory)
      throw new Error('Run DoodleForge inside its workspace checkout');
    directory = parent;
  }
  return directory;
}
export const repositoryRoot = findRepositoryRoot();
if (existsSync(resolve(repositoryRoot, '.env')))
  process.loadEnvFile(resolve(repositoryRoot, '.env'));
const port = z.coerce.number().int().min(1024).max(65535);
const environmentSchema = z.object({
  DOODLEFORGE_STORAGE_ROOT: z.string().trim().min(1).default('storage'),
  DOODLEFORGE_DATABASE_PATH: z.string().trim().min(1).optional(),
  HOST: z.enum(['127.0.0.1', 'localhost', '::1']).default('127.0.0.1'),
  PORT: port.default(5173),
  WORKER_PORT: port.default(5174),
  DOODLEFORGE_WORKER_CONCURRENCY: z.coerce
    .number()
    .int()
    .min(1)
    .max(4)
    .default(1),
  ORIGIN: z.url().default('http://127.0.0.1:5173'),
});

export function loadConfig(
  environment: NodeJS.ProcessEnv = process.env,
  root = repositoryRoot,
) {
  const parsed = environmentSchema.safeParse(environment);
  if (!parsed.success) {
    throw new Error(
      `Invalid environment: ${parsed.error.issues.map((issue) => issue.path.join('.')).join(', ')}`,
    );
  }
  const env = parsed.data;
  const origin = new URL(env.ORIGIN);
  if (
    origin.protocol !== 'http:' ||
    !['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname) ||
    origin.username ||
    origin.password ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash
  ) {
    throw new Error(
      'ORIGIN must be a loopback HTTP origin without credentials, path, query or fragment',
    );
  }
  if (env.PORT === env.WORKER_PORT)
    throw new Error('PORT and WORKER_PORT must differ');
  const storageRoot = resolve(root, env.DOODLEFORGE_STORAGE_ROOT);
  return {
    host: env.HOST,
    port: env.PORT,
    workerPort: env.WORKER_PORT,
    workerConcurrency: env.DOODLEFORGE_WORKER_CONCURRENCY,
    origin: origin.origin,
    storageRoot,
    databasePath: env.DOODLEFORGE_DATABASE_PATH
      ? resolve(root, env.DOODLEFORGE_DATABASE_PATH)
      : resolve(storageRoot, 'db/doodleforge.sqlite'),
  };
}

export function ensureStorage(config: ReturnType<typeof loadConfig>) {
  for (const directory of [
    'originals',
    'generated',
    'approved',
    'published',
    'db',
  ]) {
    mkdirSync(resolve(config.storageRoot, directory), { recursive: true });
  }
  mkdirSync(dirname(config.databasePath), { recursive: true });
}
