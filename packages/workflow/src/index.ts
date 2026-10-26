import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { canonicalJson, sha256 } from '@doodleforge/contracts';
import { WorkflowRepository, type WorkflowClaim } from '@doodleforge/database';

const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const keySchema = z.string().regex(/^[a-z][a-z0-9_.-]{0,79}$/);

/** Asset identifiers and hashes, never inline artwork or client-selected storage paths. */
export const stageAssetSchema = z.strictObject({
  assetId: z.uuid(),
  sha256: hashSchema,
});
export const stageEnvelopeSchema = z.strictObject({
  schemaVersion: z.literal(1),
  characterId: z.uuid(),
  characterVersion: z.number().int().positive(),
  sourceSnapshotHash: hashSchema,
  inputs: z.record(z.string(), z.json()),
  parameters: z.record(z.string(), z.json()),
});
export type StageEnvelope = z.infer<typeof stageEnvelopeSchema>;

export interface StageContext {
  readonly claim: Readonly<WorkflowClaim>;
  readonly signal: AbortSignal;
  /** Attempt-scoped storage and capability providers are supplied by worker composition, not routes. */
  readonly log: (event: string) => void;
}
export interface Stage<I, O> {
  readonly key: string;
  readonly version: string;
  readonly inputSchema: z.ZodType<I>;
  readonly outputSchema: z.ZodType<O>;
  readonly cachePolicy: 'disabled' | 'verified-assets';
  readonly dependencies: readonly string[];
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

/** Validate before execution and again before fenced adoption; handlers cannot mutate scheduler state. */
export async function executeStage<I, O>(
  repository: WorkflowRepository,
  work: NonNullable<ReturnType<WorkflowRepository['claim']>>,
  stage: Stage<I, O>,
  signal: AbortSignal,
  log: StageContext['log'] = () => {},
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
  if (!repository.heartbeat(work.claim)) return false;
  const output = stage.outputSchema.parse(
    await stage.execute(
      { claim: Object.freeze({ ...work.claim }), signal, log },
      input,
    ),
  );
  signal.throwIfAborted();
  const outputJson = canonicalJson(z.json().parse(output));
  if (Buffer.byteLength(outputJson) > 256 * 1024)
    throw new Error('Stage output too large');
  return repository.complete(work.claim, outputJson);
}
