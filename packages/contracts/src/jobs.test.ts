import { expect, it } from 'vitest';
import {
  generationProgressSchema,
  generationProgressListSchema,
} from './jobs.js';

const queued = () => ({
  id: '11111111-1111-4111-8111-111111111111',
  characterVersion: 1,
  frozenVersionId: null,
  status: 'queued',
  createdAt: 1,
  updatedAt: 1,
  completed: 0,
  total: 27,
  retryCandidate: null,
  steps: Array.from({ length: 27 }, () => ({
    stage: 'capture-artwork',
    target: '',
    status: 'queued',
    attempts: 0,
    maxAttempts: 3,
    retryAt: null,
    errorCode: null,
  })),
});
it('accepts bounded read-only progress and rejects inconsistent counts/attempts and raw error codes', () => {
  expect(generationProgressSchema.safeParse(queued()).success).toBe(true);
  expect(
    generationProgressSchema.safeParse({ ...queued(), completed: 1 }).success,
  ).toBe(false);
  const failed = queued();
  failed.steps[0]!.attempts = 4;
  expect(generationProgressSchema.safeParse(failed).success).toBe(false);
  expect(
    generationProgressSchema.safeParse({
      ...queued(),
      sourceSnapshotJson: '{}',
    }).success,
  ).toBe(false);
  expect(
    generationProgressSchema.safeParse({
      ...queued(),
      steps: [
        { ...queued().steps[0], errorCode: '/secret/path' },
        ...queued().steps.slice(1),
      ],
    }).success,
  ).toBe(false);
});
it('rejects unknown states and excess jobs/steps', () => {
  expect(
    generationProgressSchema.safeParse({ ...queued(), status: 'invented' })
      .success,
  ).toBe(false);
  expect(
    generationProgressSchema.safeParse({
      ...queued(),
      steps: queued().steps.slice(1),
    }).success,
  ).toBe(false);
  expect(
    generationProgressListSchema.safeParse(Array.from({ length: 11 }, queued))
      .success,
  ).toBe(false);
});
