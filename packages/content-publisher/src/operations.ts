import { randomUUID } from 'node:crypto';
import { mkdir, readdir, rmdir, stat } from 'node:fs/promises';
import path from 'node:path';

// Fail closed after process death: stale markers require offline operator review.
// Publishers register before checking maintenance; maintenance claims exclusivity
// before checking registrations. Thus neither can enter while the other runs.
export async function withPublicationOperation<T>(
  root: string,
  maintenance: boolean,
  operation: () => Promise<T>,
): Promise<T> {
  const publishers = path.join(root, '.publishers');
  const exclusive = path.join(root, '.maintenance');
  await mkdir(publishers, { recursive: true });
  const marker = maintenance ? exclusive : path.join(publishers, randomUUID());
  await mkdir(marker); // Never remove a marker we did not create.
  try {
    if (maintenance) {
      if ((await readdir(publishers)).length)
        throw new Error(
          'Publishers active or stale markers; stop and inspect before reconciliation',
        );
    } else {
      const active = await stat(exclusive).then(
        () => true,
        (error: NodeJS.ErrnoException) => {
          if (error.code === 'ENOENT') return false;
          throw error;
        },
      );
      if (active)
        throw new Error('Publication maintenance active; retry later');
    }
    return await operation();
  } finally {
    await rmdir(marker);
  }
}
