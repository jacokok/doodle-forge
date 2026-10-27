import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { link, lstat, mkdir, open, realpath, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { sha256 } from '@doodleforge/contracts';
import { prepareOriginal } from '@doodleforge/image-processing';
import type { WorkflowClaim } from '@doodleforge/database';

const uuid = z.uuid();
export const artifactSchema = z.strictObject({
  stepId: uuid,
  attemptId: uuid,
  artifactId: uuid,
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  bytes: z
    .number()
    .int()
    .positive()
    .max(10 * 1024 * 1024),
  mediaType: z.literal('image/png'),
  width: z.number().int().positive().max(4096),
  height: z.number().int().positive().max(4096),
});
export type Artifact = z.infer<typeof artifactSchema>;
const policy = { maxPixels: 20_000_000, previewEdge: 1024 };

async function safeDirectory(path: string) {
  if (!(await lstat(path)).isDirectory() || (await realpath(path)) !== path)
    throw new Error('Unsafe artifact directory');
  return path;
}

/** Bounded descriptor read: never follow a final symlink or block on a FIFO. */
export async function readImmutableFile(
  root: string,
  key: string,
  bytes: number,
) {
  if (!/^[a-zA-Z0-9.-]+$/.test(key) || key === '.' || key === '..')
    throw new Error('Unsafe file key');
  if (!Number.isSafeInteger(bytes) || bytes < 1 || bytes > 10 * 1024 * 1024)
    throw new Error('Invalid artifact size');
  const directory = await safeDirectory(resolve(root));
  const file = await open(
    join(directory, key),
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size !== bytes)
      throw new Error('Artifact size mismatch');
    const data = Buffer.alloc(bytes + 1);
    let length = 0;
    while (length < data.length) {
      const read = await file.read(data, length, data.length - length, null);
      if (!read.bytesRead) break;
      length += read.bytesRead;
    }
    if (length !== bytes) throw new Error('Artifact size changed');
    return data.subarray(0, length);
  } finally {
    await file.close();
  }
}

/** Private files are installed before SQLite adoption; unadopted files are retained orphans. */
export class ArtifactStore {
  constructor(private readonly root: string) {}

  private async directory(stepId: string, attemptId: string, create = false) {
    uuid.parse(stepId);
    uuid.parse(attemptId);
    let directory = await safeDirectory(resolve(this.root));
    for (const id of [stepId, attemptId]) {
      const parent = directory;
      directory = join(directory, id);
      if (create)
        await mkdir(directory, { mode: 0o700 }).catch(
          (error: NodeJS.ErrnoException) => {
            if (error.code !== 'EEXIST') throw error;
          },
        );
      await safeDirectory(directory);
      if (create) {
        const handle = await open(
          parent,
          constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
        );
        try {
          await handle.sync();
        } finally {
          await handle.close();
        }
      }
    }
    return directory;
  }

  async putPng(
    claim: WorkflowClaim,
    data: Buffer,
    signal: AbortSignal,
  ): Promise<Artifact> {
    signal.throwIfAborted();
    if (!data.length || data.length > 10 * 1024 * 1024)
      throw new Error('Invalid artifact size');
    data = Buffer.from(data);
    const image = await prepareOriginal(data, 'image/png', policy);
    const ref = artifactSchema.parse({
      stepId: claim.stepId,
      attemptId: claim.attemptId,
      artifactId: randomUUID(),
      sha256: sha256(data),
      bytes: data.length,
      mediaType: 'image/png',
      width: image.width,
      height: image.height,
    });
    const directory = await this.directory(ref.stepId, ref.attemptId, true);
    const temporary = join(directory, `${ref.artifactId}.tmp`);
    const file = await open(
      temporary,
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        constants.O_NOFOLLOW,
      0o600,
    );
    try {
      try {
        await file.writeFile(data);
        await file.chmod(0o400);
        await file.sync();
      } finally {
        await file.close();
      }
      signal.throwIfAborted();
      // Hard-link installation is atomic and cannot overwrite an existing artifact.
      await link(temporary, join(directory, `${ref.artifactId}.png`));
    } finally {
      await unlink(temporary);
    }
    const handle = await open(
      directory,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
    );
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
    signal.throwIfAborted();
    await this.read(ref);
    return ref;
  }

  async read(input: Artifact): Promise<Buffer> {
    const ref = artifactSchema.parse(input);
    const directory = await this.directory(ref.stepId, ref.attemptId);
    const data = await readImmutableFile(
      directory,
      `${ref.artifactId}.png`,
      ref.bytes,
    );
    if (sha256(data) !== ref.sha256) throw new Error('Artifact hash mismatch');
    const image = await prepareOriginal(data, ref.mediaType, policy);
    if (image.width !== ref.width || image.height !== ref.height)
      throw new Error('Artifact dimensions mismatch');
    return data;
  }

  async verifyAttempt(refs: readonly Artifact[], claim: WorkflowClaim) {
    if (refs.length > 100) throw new Error('Too many artifacts');
    for (const ref of refs) {
      if (ref.stepId !== claim.stepId || ref.attemptId !== claim.attemptId)
        throw new Error('Artifact attempt mismatch');
      await this.read(ref);
    }
  }
}
