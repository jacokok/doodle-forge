import { mkdtemp, mkdir, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { withPublicationOperation } from './operations.js';

it('permits concurrent publishers but refuses reconciliation until every publisher exits', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'doodle-operations-'));
  try {
    await withPublicationOperation(root, false, async () => {
      await withPublicationOperation(root, false, async () => {
        await expect(
          withPublicationOperation(root, true, async () => {
            throw new Error('must not enter');
          }),
        ).rejects.toThrow('Publishers active');
        expect(await readdir(path.join(root, '.publishers'))).toHaveLength(2);
      });
    });
    expect(await withPublicationOperation(root, true, async () => 'safe')).toBe(
      'safe',
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it('blocks publishers and other reconcilers during maintenance and releases markers on errors', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'doodle-operations-'));
  try {
    await expect(
      withPublicationOperation(root, true, async () => {
        await expect(
          withPublicationOperation(root, false, async () => 'unsafe'),
        ).rejects.toThrow('maintenance active');
        await expect(
          withPublicationOperation(root, true, async () => 'unsafe'),
        ).rejects.toThrow();
        throw new Error('audit failed');
      }),
    ).rejects.toThrow('audit failed');
    expect(await readdir(path.join(root, '.publishers'))).toEqual([]);
    expect(
      await withPublicationOperation(root, false, async () => 'safe'),
    ).toBe('safe');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it('never reclaims potentially live/stale registrations automatically', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'doodle-operations-'));
  try {
    await mkdir(path.join(root, '.publishers', 'stale'), { recursive: true });
    await expect(
      withPublicationOperation(root, true, async () => 'unsafe'),
    ).rejects.toThrow('stale markers');
    expect(await readdir(path.join(root, '.publishers'))).toEqual(['stale']);
    await mkdir(path.join(root, '.maintenance'));
    await expect(
      withPublicationOperation(root, false, async () => 'unsafe'),
    ).rejects.toThrow('maintenance active');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
