import { createHash } from 'node:crypto';
import { z } from 'zod';
import type {
  NewCheckpointLineageClaim,
  WorkflowRepository,
} from '@doodleforge/database';
import { canonicalJson } from '@doodleforge/contracts';
import { ArtifactStore, artifactSchema } from './artifacts.js';

/** Writes an untrusted lineage claim after this helper rereads selected artifact bytes. */
export async function persistByteCheckedCheckpointLineageClaim(
  repository: WorkflowRepository,
  artifacts: ArtifactStore,
  input: Omit<NewCheckpointLineageClaim, 'sourceOutputHash' | 'artifactHashes'>,
) {
  const step = repository.step(input.sourceStepId);
  if (!step?.outputJson) throw new Error('Source checkpoint unavailable');
  const output: unknown = JSON.parse(step.outputJson);
  const refs: z.infer<typeof artifactSchema>[] = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
    } else if (value && typeof value === 'object') {
      const parsed = artifactSchema.safeParse(value);
      if (parsed.success) refs.push(parsed.data);
      else Object.values(value).forEach(visit);
    }
  };
  visit(output);
  if (!refs.length || refs.length > 100)
    throw new Error('Checkpoint has no supported artifact lineage');
  for (const ref of refs) {
    if (ref.stepId !== step.id)
      throw new Error('Checkpoint artifact step mismatch');
    const attempt = repository
      .attempts(step.id)
      .find((item) => item.id === ref.attemptId);
    if (
      !attempt ||
      attempt.outcome !== 'succeeded' ||
      attempt.id !== input.sourceAttemptId
    )
      throw new Error('Checkpoint artifact attempt mismatch');
    await artifacts.read(ref);
  }
  const sourceOutputHash = createHash('sha256')
    .update(canonicalJson(output))
    .digest('hex');
  return repository.recordCheckpointLineageClaim({
    ...input,
    sourceOutputHash,
    artifactHashes: [...new Set(refs.map(({ sha256 }) => sha256))].sort(),
  });
}
