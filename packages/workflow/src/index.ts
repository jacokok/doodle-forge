import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { canonicalJson, sha256 } from '@doodleforge/contracts';
import { WorkflowRepository, type WorkflowClaim } from '@doodleforge/database';

import { ArtifactStore, type Artifact } from './artifacts.js';
export { ArtifactStore, artifactSchema, type Artifact } from './artifacts.js';
export {
  WorkflowRunner,
  stageHandler,
  RetryableStageError,
  type StageHandler,
  type RunnerOptions,
} from './runner.js';
export { captureArtworkStage, captureOutputSchema } from './capture.js';
export {
  analysisStage,
  cleanImageStage,
  characterMasterStage,
  bodyTypeStage,
  bodyTypeOutputSchema,
  poseStage,
  poseOutputSchema,
  analysisOutputSchema,
  mockImageOutputSchema,
} from './mock-stages.js';

import { stageEnvelopeSchema, type StageEnvelope } from './envelope.js';
export {
  stageAssetSchema,
  stageEnvelopeSchema,
  type StageEnvelope,
} from './envelope.js';

const keySchema = z.string().regex(/^[a-z][a-z0-9_.-]{0,79}$/);

export interface StageDependency {
  readonly stepId: string;
  readonly attemptId: string;
  readonly stageKey: string;
  readonly stageVersion: string;
  readonly targetKey: string;
  readonly outputJson: string;
  readonly outputHash: string;
}
export interface StageContext {
  readonly claim: Readonly<WorkflowClaim>;
  readonly signal: AbortSignal;
  /** Attempt-scoped storage and capability providers are supplied by worker composition, not routes. */
  readonly log: (event: string) => void;
  readonly artifacts?: ArtifactStore | undefined;
  readonly dependencyOutputs?: readonly StageDependency[];
  readonly resolvedInputHash?: string;
  readonly targetKey?: string;
}
export interface Stage<I, O> {
  readonly key: string;
  readonly version: string;
  readonly inputSchema: z.ZodType<I>;
  readonly outputSchema: z.ZodType<O>;
  readonly cachePolicy: 'disabled' | 'verified-assets';
  /** Strings retain stage-key-only matching; descriptors pin a specific branch. */
  readonly dependencies: readonly (
    string | { readonly stageKey: string; readonly targetKey: string }
  )[];
  /** All newly produced files must be declared for verification before adoption. */
  readonly artifactRefs?: (output: O) => readonly Artifact[];
  execute(context: StageContext, input: I): Promise<O>;
}

const stepRequestSchema = z.strictObject({
  key: keySchema,
  stageKey: keySchema,
  stageVersion: z.string().min(1).max(80),
  targetKey: z.string().max(80),
  dependencies: z.array(keySchema).max(100),
  input: stageEnvelopeSchema,
  maxAttempts: z.number().int().min(1).max(10).default(3),
});
export const workflowRequestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  characterId: z.uuid(),
  characterVersionId: z.uuid().nullable(),
  kind: z.enum(['generate', 'publish']),
  idempotencyKey: z.string().min(1).max(160),
  steps: z.array(stepRequestSchema).min(1).max(1000),
});

/** Identity includes validated inputs, references, implementation and provider/seed parameters. */
export function stageInputHash(
  stageKey: string,
  stageVersion: string,
  input: StageEnvelope,
) {
  return sha256(
    canonicalJson({
      stageKey,
      stageVersion,
      input: stageEnvelopeSchema.parse(input),
    }),
  );
}

export function enqueueWorkflow(
  repository: WorkflowRepository,
  request: unknown,
) {
  const parsed = workflowRequestSchema.parse(request);
  if (
    parsed.steps.some((step) => step.input.characterId !== parsed.characterId)
  )
    throw new Error('Stage owner mismatch');
  const requestJson = canonicalJson(parsed);
  if (Buffer.byteLength(requestJson) > 256 * 1024)
    throw new Error('Workflow request too large');
  const ids = new Map(parsed.steps.map((step) => [step.key, randomUUID()]));
  if (ids.size !== parsed.steps.length)
    throw new Error('Duplicate workflow step key');
  return repository.enqueue({
    id: randomUUID(),
    characterId: parsed.characterId,
    characterVersionId: parsed.characterVersionId,
    kind: parsed.kind,
    idempotencyKey: parsed.idempotencyKey,
    requestJson,
    requestHash: sha256(requestJson),
    steps: parsed.steps.map((step) => ({
      id: ids.get(step.key)!,
      stageKey: step.stageKey,
      stageVersion: step.stageVersion,
      targetKey: step.targetKey,
      dependencies: step.dependencies.map((key) => {
        const id = ids.get(key);
        if (!id) throw new Error('Unknown workflow dependency');
        return id;
      }),
      inputHash: stageInputHash(step.stageKey, step.stageVersion, step.input),
      inputJson: canonicalJson(step.input),
      maxAttempts: step.maxAttempts,
    })),
  });
}

function resolveDependencies(
  repository: WorkflowRepository,
  work: NonNullable<ReturnType<WorkflowRepository['claim']>>,
  required: Stage<unknown, unknown>['dependencies'],
  envelope: StageEnvelope,
): readonly StageDependency[] {
  const ids = z
    .array(z.uuid())
    .max(100)
    .parse(JSON.parse(work.step.dependenciesJson));
  if (new Set(ids).size !== ids.length || ids.length !== required.length)
    throw new Error('Stage dependency mismatch');
  const dependencies = ids.map((id) => {
    const step = repository.step(id);
    if (
      !step ||
      step.jobId !== work.step.jobId ||
      step.status !== 'succeeded' ||
      !step.outputJson
    )
      throw new Error('Dependency checkpoint unavailable');
    const source = stageEnvelopeSchema.parse(JSON.parse(step.inputJson));
    if (
      source.characterId !== envelope.characterId ||
      source.characterVersion !== envelope.characterVersion ||
      source.sourceSnapshotHash !== envelope.sourceSnapshotHash ||
      stageInputHash(step.stageKey, step.stageVersion, source) !==
        step.inputHash
    )
      throw new Error('Dependency source identity mismatch');
    const attempt = repository
      .attempts(id)
      .find(
        (item) =>
          item.outcome === 'succeeded' && item.leaseToken === step.leaseToken,
      );
    if (!attempt || Buffer.byteLength(step.outputJson) > 256 * 1024)
      throw new Error('Invalid dependency checkpoint');
    z.json().parse(JSON.parse(step.outputJson));
    return Object.freeze({
      stepId: id,
      attemptId: attempt.id,
      stageKey: step.stageKey,
      stageVersion: step.stageVersion,
      targetKey: step.targetKey,
      outputJson: step.outputJson,
      outputHash: sha256(step.outputJson),
    });
  });
  const matched = new Set<string>();
  for (const requirement of required) {
    const matches = dependencies.filter((item) =>
      typeof requirement === 'string'
        ? item.stageKey === requirement
        : item.stageKey === requirement.stageKey &&
          item.targetKey === requirement.targetKey,
    );
    if (matches.length !== 1 || matched.has(matches[0]!.stepId))
      throw new Error('Stage dependency mismatch');
    matched.add(matches[0]!.stepId);
  }
  return Object.freeze(
    dependencies.sort(
      (a, b) =>
        a.stageKey.localeCompare(b.stageKey) ||
        a.targetKey.localeCompare(b.targetKey),
    ),
  );
}

/** Validate before execution and again before fenced adoption; handlers cannot mutate scheduler state. */
export async function executeStage<I, O>(
  repository: WorkflowRepository,
  work: NonNullable<ReturnType<WorkflowRepository['claim']>>,
  stage: Stage<I, O>,
  signal: AbortSignal,
  log: StageContext['log'] = () => {},
  artifacts?: ArtifactStore,
  leaseMs = 60_000,
) {
  if (
    work.step.stageKey !== stage.key ||
    work.step.stageVersion !== stage.version
  )
    throw new Error('Unsupported stage implementation');
  const envelope = stageEnvelopeSchema.parse(JSON.parse(work.step.inputJson));
  if (
    stageInputHash(stage.key, stage.version, envelope) !== work.step.inputHash
  )
    throw new Error('Corrupt stage input');
  const input = stage.inputSchema.parse(envelope);
  signal.throwIfAborted();
  if (!repository.heartbeat(work.claim, leaseMs)) return false;
  const dependencyOutputs = resolveDependencies(
    repository,
    work,
    stage.dependencies,
    envelope,
  );
  const resolvedInputHash = sha256(
    canonicalJson({
      inputHash: work.step.inputHash,
      dependencies: dependencyOutputs.map(
        ({ stageKey, stageVersion, targetKey, outputHash }) => ({
          stageKey,
          stageVersion,
          targetKey,
          outputHash,
        }),
      ),
    }),
  );
  const output = stage.outputSchema.parse(
    await stage.execute(
      {
        claim: Object.freeze({ ...work.claim }),
        signal,
        log,
        artifacts,
        dependencyOutputs,
        resolvedInputHash,
        targetKey: work.step.targetKey,
      },
      input,
    ),
  );
  signal.throwIfAborted();
  if (stage.artifactRefs) {
    if (!artifacts) throw new Error('Artifact store required');
    await artifacts.verifyAttempt(stage.artifactRefs(output), work.claim);
  }
  signal.throwIfAborted();
  const outputJson = canonicalJson(z.json().parse(output));
  if (Buffer.byteLength(outputJson) > 256 * 1024)
    throw new Error('Stage output too large');
  return repository.complete(work.claim, outputJson);
}
