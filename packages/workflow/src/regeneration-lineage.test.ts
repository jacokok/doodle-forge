import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { canonicalJson, sha256 } from '@doodleforge/contracts';
import type { WorkflowRepository } from '@doodleforge/database';
import { persistVerifiedCheckpointLineage } from './regeneration-lineage.js';
import type { ArtifactStore } from './artifacts.js';

const hash = 'a'.repeat(64);
const stepId = randomUUID();
const attemptId = randomUUID();
const artifact = {
  stepId,
  attemptId,
  artifactId: randomUUID(),
  sha256: hash,
  bytes: 10,
  mediaType: 'image/png' as const,
  width: 1,
  height: 1,
};

function setup(read: () => Promise<Buffer>) {
  const outputJson = canonicalJson({ image: artifact });
  const repository = {
    step: vi.fn(() => ({ id: stepId, outputJson })),
    attempts: vi.fn(() => [{ id: attemptId, outcome: 'succeeded' }]),
    recordCheckpointLineage: vi.fn(() => 'lineage-id'),
  } as unknown as WorkflowRepository;
  const store = { read: vi.fn(read) } as unknown as ArtifactStore;
  return { repository, store, outputJson };
}

describe('verified checkpoint lineage prerequisite', () => {
  const input = {
    id: randomUUID(),
    characterId: randomUUID(),
    sourceJobId: randomUUID(),
    sourceStepId: stepId,
    sourceAttemptId: attemptId,
    childJobId: randomUUID(),
    stageKey: 'build-sheet',
    stageVersion: '1',
    targetKey: 'walk',
    sourceSnapshotHash: hash,
    childSnapshotHash: 'b'.repeat(64),
  };

  it('re-reads every immutable artifact before persisting canonical checkpoint identity', async () => {
    const { repository, store, outputJson } = setup(async () =>
      Buffer.alloc(10),
    );
    await expect(
      persistVerifiedCheckpointLineage(repository, store, input),
    ).resolves.toBe('lineage-id');
    expect(store.read).toHaveBeenCalledWith(artifact);
    expect(repository.recordCheckpointLineage).toHaveBeenCalledWith({
      ...input,
      sourceOutputHash: sha256(outputJson),
      artifactHashes: [hash],
    });
  });

  it('does not persist lineage when selected artifact bytes fail verification', async () => {
    const { repository, store } = setup(async () => {
      throw new Error('Artifact hash mismatch');
    });
    await expect(
      persistVerifiedCheckpointLineage(repository, store, input),
    ).rejects.toThrow('Artifact hash mismatch');
    expect(repository.recordCheckpointLineage).not.toHaveBeenCalled();
  });
});
