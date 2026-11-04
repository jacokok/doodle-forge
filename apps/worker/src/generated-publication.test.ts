import { randomUUID } from 'node:crypto';
import { canonicalJson, sha256 } from '@doodleforge/contracts';
import { describe, expect, it, vi } from 'vitest';
import type { WorkflowRepository } from '@doodleforge/database';
import {
  generatedPublicationHandler,
  type GeneratedPublicationDependencies,
  type GeneratedPublicationSource,
  type GeneratedPublicationStaging,
} from './generated-publication.js';

const request = {
  protocol: 'generated-publication@1' as const,
  characterId: randomUUID(),
  versionId: randomUUID(),
  manifestSha256: 'a'.repeat(64),
  sourceSha256: 'b'.repeat(64),
  decisionOrder: 3,
};
const requestJson = canonicalJson(request);
const stepInput = canonicalJson({ ...request, parentJobId: randomUUID() });
const claim = {
  stepId: randomUUID(),
  attemptId: randomUUID(),
  workerId: 'disconnected-publisher-test',
  token: 1,
};
const work = {
  claim,
  step: {
    id: claim.stepId,
    jobId: randomUUID(),
    stageKey: 'publish-generated',
    stageVersion: '1',
    targetKey: '',
    inputJson: stepInput,
    inputHash: sha256(stepInput),
    attemptCount: 1,
  },
};
const source: GeneratedPublicationSource = {
  characterId: request.characterId,
  versionId: request.versionId,
  manifestSha256: request.manifestSha256,
  sourceSha256: request.sourceSha256,
  manifestJson: Buffer.from('manifest'),
  assets: [
    {
      path: 'idle.png',
      bytes: Buffer.from('asset'),
      sha256: 'c'.repeat(64),
      width: 1,
      height: 1,
    },
  ],
};
const staged: GeneratedPublicationStaging = {
  result: { staged: true },
  identity: { releaseId: randomUUID(), indexSha256: 'd'.repeat(64) },
};

function harness(
  dependencies: Partial<GeneratedPublicationDependencies> = {},
  current: () => boolean = () => true,
) {
  const calls: string[] = [];
  const repository = {
    job: vi.fn(() => ({
      kind: 'publish',
      characterId: request.characterId,
      characterVersionId: request.versionId,
      requestJson,
      requestHash: sha256(requestJson),
    })),
    heartbeat: vi.fn(() => true),
    isCurrent: vi.fn(current),
    complete: vi.fn(() => true),
  } as unknown as WorkflowRepository;
  const full: GeneratedPublicationDependencies = {
    resolveSource: vi.fn(async () => {
      calls.push('resolve');
      return source;
    }),
    prepare: vi.fn(async ({ source: owned }) => {
      calls.push('prepare');
      expect(owned.manifestJson).not.toBe(source.manifestJson);
      expect(owned.assets[0]?.bytes).not.toBe(source.assets[0]?.bytes);
      return { input: { package: true, index: true }, identity: {} };
    }),
    stage: vi.fn(async () => {
      calls.push('stage');
      return staged;
    }),
    verify: vi.fn(async () => {
      calls.push('verify');
    }),
    activate: vi.fn(() => {
      calls.push('activate');
      return { status: 'activated' as const };
    }),
    ...dependencies,
  };
  return {
    calls,
    repository,
    dependencies: full,
    handler: generatedPublicationHandler(full),
  };
}

describe('disconnected generated publication handler', () => {
  it('runs resolve, stable-byte preparation, stage, verification, then the sole activation callback', async () => {
    const h = harness();
    await h.handler.execute(
      h.repository,
      work as never,
      new AbortController().signal,
      60_000,
    );
    expect(h.calls).toEqual([
      'resolve',
      'prepare',
      'stage',
      'verify',
      'activate',
    ]);
    expect(h.repository.heartbeat).toHaveBeenCalledTimes(5);
    expect(h.repository.complete).not.toHaveBeenCalled();
  });

  it('stops after source resolution when cancellation or lease loss is observed', async () => {
    const controller = new AbortController();
    const cancelled = harness({
      resolveSource: vi.fn(async () => {
        cancelled.calls.push('resolve');
        controller.abort();
        return source;
      }),
    });
    await expect(
      cancelled.handler.execute(
        cancelled.repository,
        work as never,
        controller.signal,
        60_000,
      ),
    ).rejects.toThrow();
    expect(cancelled.calls).toEqual(['resolve']);
    expect(cancelled.dependencies.activate).not.toHaveBeenCalled();

    const leaseChecks = harness({}, () => false);
    await expect(
      leaseChecks.handler.execute(
        leaseChecks.repository,
        work as never,
        new AbortController().signal,
        60_000,
      ),
    ).resolves.toBe(false);
    expect(leaseChecks.calls).toEqual([]);
  });

  it('never attempts verification or activation after staging failure', async () => {
    const h = harness({
      stage: vi.fn(async () => {
        h.calls.push('stage-failed');
        throw new Error('staging failed');
      }),
    });
    await expect(
      h.handler.execute(
        h.repository,
        work as never,
        new AbortController().signal,
        60_000,
      ),
    ).rejects.toThrow('staging failed');
    expect(h.calls).toEqual(['resolve', 'prepare', 'stage-failed']);
    expect(h.dependencies.activate).not.toHaveBeenCalled();
  });

  it.each(['stale', 'denied'] as const)(
    'does not treat %s activation as publication success',
    async (status) => {
      const h = harness({
        activate: vi.fn(() => ({ status, code: 'PUBLICATION_FENCE' as const })),
      });
      await expect(
        h.handler.execute(
          h.repository,
          work as never,
          new AbortController().signal,
          60_000,
        ),
      ).rejects.toThrow(`Generated publication ${status}`);
      expect(h.repository.complete).not.toHaveBeenCalled();
    },
  );

  it('accepts only the activation callback to report an idempotent replay', async () => {
    const h = harness({
      activate: vi.fn(() => ({ status: 'already-activated' as const })),
    });
    await expect(
      h.handler.execute(
        h.repository,
        work as never,
        new AbortController().signal,
        60_000,
      ),
    ).resolves.toBe(true);
    expect(h.repository.complete).not.toHaveBeenCalled();
  });
});
