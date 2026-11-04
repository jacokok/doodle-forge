import { canonicalJson, sha256 } from '@doodleforge/contracts';
import { WorkflowRepository, type WorkflowClaim } from '@doodleforge/database';
import { type StageHandler } from '@doodleforge/workflow';
import { z } from 'zod';

const publishRequestSchema = z.strictObject({
  protocol: z.literal('generated-publication@1'),
  characterId: z.uuid(),
  versionId: z.uuid(),
  manifestSha256: z.string().regex(/^[a-f0-9]{64}$/),
  sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  decisionOrder: z.number().int().positive(),
});

const stepInputSchema = publishRequestSchema.extend({
  parentJobId: z.uuid(),
});

export type GeneratedPublicationRequest = z.infer<typeof publishRequestSchema>;
export type GeneratedPublicationStepInput = z.infer<typeof stepInputSchema>;
type Work = NonNullable<ReturnType<WorkflowRepository['claim']>>;

/** Exact immutable bytes selected by the verified frozen workflow source registry. */
export interface GeneratedPublicationSource {
  readonly characterId: string;
  readonly versionId: string;
  readonly manifestSha256: string;
  readonly sourceSha256: string;
  readonly manifestJson: Buffer;
  readonly assets: readonly {
    readonly path: string;
    readonly bytes: Buffer;
    readonly sha256: string;
    readonly width: number;
    readonly height: number;
  }[];
}

/** The staging adapter prepares canonical package and release-index bytes without visibility. */
export interface GeneratedPublicationPreparation {
  readonly input: unknown;
  readonly identity: Readonly<Record<string, unknown>>;
}

export interface GeneratedPublicationStaging {
  readonly result: unknown;
  readonly identity: Readonly<Record<string, unknown>>;
}

export type GeneratedPublicationActivation =
  | { readonly status: 'activated' }
  | { readonly status: 'already-activated' }
  | { readonly status: 'stale' | 'denied'; readonly code: string };

export interface GeneratedPublicationDependencies {
  /** Reads the persisted selected registry and verifies the exact frozen source bytes. */
  resolveSource(input: {
    readonly repository: WorkflowRepository;
    readonly work: Work;
    readonly request: GeneratedPublicationStepInput;
    readonly signal: AbortSignal;
  }): Promise<GeneratedPublicationSource>;
  /** Pins the release CAS and builds the exact canonical index/package staging input. */
  prepare(input: {
    readonly repository: WorkflowRepository;
    readonly work: Work;
    readonly request: GeneratedPublicationStepInput;
    readonly source: GeneratedPublicationSource;
    readonly signal: AbortSignal;
  }): Promise<GeneratedPublicationPreparation>;
  /** Idempotently stages exact prepared bytes; the returned handle is never authority. */
  stage(
    input: unknown,
    signal: AbortSignal,
  ): Promise<GeneratedPublicationStaging>;
  /** Re-reads and verifies all staged package and release-index bytes immediately before activation. */
  verify(
    staged: GeneratedPublicationStaging,
    signal: AbortSignal,
  ): Promise<void>;
  /** Sole visibility boundary: implementation must atomically fence and complete all linked jobs. */
  activate(input: {
    readonly repository: WorkflowRepository;
    readonly claim: Readonly<WorkflowClaim>;
    readonly attemptNo: number;
    readonly expectedRequestHash: string;
    readonly request: GeneratedPublicationStepInput;
    /** Retains the exact prepared index bytes required by the DB activation contract. */
    readonly preparation: GeneratedPublicationPreparation;
    readonly staged: GeneratedPublicationStaging;
  }): GeneratedPublicationActivation;
}

function parseClaimedRequest(repository: WorkflowRepository, work: Work) {
  if (
    work.step.stageKey !== 'publish-generated' ||
    work.step.stageVersion !== '1' ||
    work.step.targetKey !== ''
  )
    throw new Error('Unsupported generated publication stage');
  const stepInput = stepInputSchema.parse(JSON.parse(work.step.inputJson));
  if (sha256(canonicalJson(stepInput)) !== work.step.inputHash)
    throw new Error('Generated publication step identity mismatch');
  const job = repository.job(work.step.jobId);
  if (
    !job ||
    job.kind !== 'publish' ||
    job.characterId !== stepInput.characterId
  )
    throw new Error('Generated publication request unavailable');
  const request = publishRequestSchema.parse(JSON.parse(job.requestJson));
  if (
    canonicalJson(request) !==
      canonicalJson({
        protocol: stepInput.protocol,
        characterId: stepInput.characterId,
        versionId: stepInput.versionId,
        manifestSha256: stepInput.manifestSha256,
        sourceSha256: stepInput.sourceSha256,
        decisionOrder: stepInput.decisionOrder,
      }) ||
    job.requestHash !== sha256(canonicalJson(request)) ||
    job.characterVersionId !== request.versionId
  )
    throw new Error('Generated publication request identity mismatch');
  return { request: stepInput, expectedRequestHash: job.requestHash };
}

function assertCurrent(
  repository: WorkflowRepository,
  work: Work,
  signal: AbortSignal,
  leaseMs: number,
) {
  signal.throwIfAborted();
  if (!repository.heartbeat(work.claim, leaseMs)) return false;
  return repository.isCurrent(work.claim);
}

/**
 * A deliberately disconnected handler for integration and fault testing. It is not included
 * in mockStageHandlers or any production scheduler registry. Activation owns completion;
 * this handler must never call generic `complete()` after the SQL visibility transaction.
 */
export function generatedPublicationHandler(
  dependencies: GeneratedPublicationDependencies,
): StageHandler {
  return {
    key: 'publish-generated',
    version: '1',
    async execute(repository, work, signal, leaseMs) {
      const { request, expectedRequestHash } = parseClaimedRequest(
        repository,
        work,
      );
      if (!assertCurrent(repository, work, signal, leaseMs)) return false;

      const source = await dependencies.resolveSource({
        repository,
        work,
        request,
        signal,
      });
      if (!assertCurrent(repository, work, signal, leaseMs)) return false;
      if (
        source.characterId !== request.characterId ||
        source.versionId !== request.versionId ||
        source.manifestSha256 !== request.manifestSha256 ||
        source.sourceSha256 !== request.sourceSha256
      )
        throw new Error('Generated publication source identity mismatch');
      // Own a stable byte snapshot across later awaits; staging must copy again before
      // its first await and independently validate bytes against the persisted manifest.
      const ownedSource: GeneratedPublicationSource = Object.freeze({
        ...source,
        manifestJson: Buffer.from(source.manifestJson),
        assets: Object.freeze(
          source.assets.map((asset) =>
            Object.freeze({ ...asset, bytes: Buffer.from(asset.bytes) }),
          ),
        ),
      });

      const preparation = await dependencies.prepare({
        repository,
        work,
        request,
        source: ownedSource,
        signal,
      });
      if (!assertCurrent(repository, work, signal, leaseMs)) return false;
      const staged = await dependencies.stage(preparation.input, signal);
      if (!assertCurrent(repository, work, signal, leaseMs)) return false;
      await dependencies.verify(staged, signal);
      if (!assertCurrent(repository, work, signal, leaseMs)) return false;

      const activation = dependencies.activate({
        repository,
        claim: work.claim,
        attemptNo: work.step.attemptCount,
        expectedRequestHash,
        request,
        preparation,
        staged,
      });
      if (
        activation.status === 'activated' ||
        activation.status === 'already-activated'
      )
        return true;
      if (activation.status === 'stale' || activation.status === 'denied')
        throw new Error(`Generated publication ${activation.status}`);
      throw new Error('Invalid generated publication activation result');
    },
  };
}
