import { z } from 'zod';
import { canonicalJson, sha256 } from '@doodleforge/contracts';
import { validateReviewSheet } from '@doodleforge/content-publisher';
import {
  CharacterRepository,
  SnapshotRepository,
  WorkflowRepository,
} from '@doodleforge/database';
import { ArtifactStore } from './artifacts.js';
import {
  generatedReviewSourceSchema,
  reviewValidationOutputSchema,
} from './review.js';
import { generatedAnimationNames, metadataOutputSchema } from './metadata.js';
import { buildSheetOutputSchema } from './build-sheet.js';
import { stageEnvelopeSchema } from './envelope.js';
import {
  resolvedStageInputHash,
  stageInputHash,
  workflowRequestSchema,
  type StageDependency,
} from './index.js';

/** Read-only authority resolver. A source JSON record alone never authorizes a private artifact read. */
export class GeneratedReviewSources {
  constructor(
    private readonly workflows: WorkflowRepository,
    private readonly snapshots: SnapshotRepository,
    private readonly characters: CharacterRepository,
    private readonly artifacts: ArtifactStore,
  ) {}

  private selected(versionId: string) {
    const snapshot = this.snapshots.get(z.uuid().parse(versionId));
    if (
      !snapshot?.manifestJson ||
      !snapshot.manifestSha256 ||
      !this.characters.get(snapshot.characterId) ||
      !['review', 'approved'].includes(snapshot.status) ||
      sha256(snapshot.manifestJson) !== snapshot.manifestSha256
    )
      throw new Error('Generated review unavailable');
    const source = generatedReviewSourceSchema.parse(
      JSON.parse(snapshot.sourceSnapshotJson),
    );
    const validation = this.workflows.step(source.validationStepId);
    const job = validation && this.workflows.job(validation.jobId);
    if (
      !job ||
      job.kind !== 'generate' ||
      job.characterId !== snapshot.characterId ||
      job.characterVersionId !== snapshot.id ||
      !['waiting_approval', 'waiting_publish'].includes(job.status) ||
      (job.status === 'waiting_publish'
        ? snapshot.status !== 'approved' ||
          this.snapshots.latestDecision(snapshot.id)?.decision !== 'approved'
        : snapshot.status !== 'review' ||
          this.snapshots.latestDecision(snapshot.id)?.decision ===
            'approved') ||
      job.cancelRequestedAt !== null ||
      sha256(job.requestJson) !== job.requestHash ||
      Buffer.byteLength(job.requestJson) > 256 * 1024
    )
      throw new Error('Generated review job unavailable');
    const request = workflowRequestSchema.parse(JSON.parse(job.requestJson));
    if (
      request.generation?.protocol !== 'mock-factory@1' ||
      request.generation.version !== snapshot.version ||
      sha256(canonicalJson(request.generation.source)) !==
        source.sourceSnapshotHash
    )
      throw new Error('Generated review capture mismatch');

    const checkpoint = (
      id: string,
      key: string,
      target: string,
    ): StageDependency => {
      const step = this.workflows.step(id);
      if (
        !step ||
        step.jobId !== job.id ||
        step.stageKey !== key ||
        step.stageVersion !== '1' ||
        step.targetKey !== target ||
        step.status !== 'succeeded' ||
        !step.outputJson ||
        Buffer.byteLength(step.outputJson) > 256 * 1024
      )
        throw new Error('Generated review checkpoint unavailable');
      const envelope = stageEnvelopeSchema.parse(JSON.parse(step.inputJson));
      if (
        envelope.characterId !== snapshot.characterId ||
        envelope.characterVersion !== snapshot.version ||
        envelope.sourceSnapshotHash !== source.sourceSnapshotHash ||
        stageInputHash(key, '1', envelope) !== step.inputHash
      )
        throw new Error('Generated review checkpoint identity mismatch');
      const attempt = this.workflows
        .attempts(step.id)
        .find(
          (item) =>
            item.outcome === 'succeeded' && item.leaseToken === step.leaseToken,
        );
      if (!attempt) throw new Error('Generated review attempt unavailable');
      return {
        stepId: step.id,
        attemptId: attempt.id,
        stageKey: key,
        stageVersion: '1',
        targetKey: target,
        outputJson: step.outputJson,
        outputHash: sha256(step.outputJson),
      };
    };
    const adopted = checkpoint(source.validationStepId, 'validate-review', '');
    const review = reviewValidationOutputSchema.parse(
      JSON.parse(adopted.outputJson),
    );
    if (
      canonicalJson(review.source) !== canonicalJson(source) ||
      canonicalJson(review.metadata.manifest) !== snapshot.manifestJson ||
      review.metadata.manifestSha256 !== snapshot.manifestSha256
    )
      throw new Error('Generated review snapshot mismatch');
    const metadata = checkpoint(source.metadataStepId, 'generate-metadata', '');
    if (
      metadata.outputHash !== source.metadataOutputHash ||
      canonicalJson(
        metadataOutputSchema.parse(JSON.parse(metadata.outputJson)),
      ) !== canonicalJson(review.metadata)
    )
      throw new Error('Generated review metadata mismatch');
    const dependencies = [metadata];
    for (const [branch, image] of Object.entries(review.metadata.sheets)) {
      const selected = checkpoint(image.stepId, 'build-sheet', branch);
      const sheet = buildSheetOutputSchema.parse(
        JSON.parse(selected.outputJson),
      );
      if (
        image.attemptId !== selected.attemptId ||
        canonicalJson(sheet.image) !== canonicalJson(image) ||
        sheet.animation !== branch
      )
        throw new Error('Generated review sheet mismatch');
      dependencies.push(selected);
    }
    const declared = z
      .array(z.uuid())
      .length(6)
      .parse(JSON.parse(validation!.dependenciesJson));
    if (
      new Set(declared).size !== 6 ||
      dependencies.some((item) => !declared.includes(item.stepId))
    )
      throw new Error('Generated review dependency mismatch');
    dependencies.sort(
      (a, b) =>
        a.stageKey.localeCompare(b.stageKey) ||
        a.targetKey.localeCompare(b.targetKey),
    );
    if (
      resolvedStageInputHash(validation!.inputHash, dependencies) !==
      source.resolvedInputHash
    )
      throw new Error('Generated review resolved identity mismatch');
    return { snapshot, source, manifest: review.metadata.manifest };
  }

  /** Validate every selected sheet before handing the exact registry identity to the atomic gate. */
  async decide(input: {
    characterId: string;
    versionId: string;
    expectedManifestSha256: string;
    expectedDecisionOrder: number;
    decision: 'approved' | 'rejected' | 'revoked';
    actorLabel: string;
    note?: string;
  }) {
    const selected = this.selected(input.versionId);
    if (
      selected.snapshot.characterId !== input.characterId ||
      selected.snapshot.manifestSha256 !== input.expectedManifestSha256
    )
      throw new Error('Generated review unavailable');
    for (const assetId of Object.keys(selected.source.assets))
      await this.read(input.versionId, assetId);
    const current = this.selected(input.versionId);
    if (
      current.snapshot.sourceSnapshotJson !==
        selected.snapshot.sourceSnapshotJson ||
      current.snapshot.manifestSha256 !== selected.snapshot.manifestSha256
    )
      throw new Error('Generated review changed');
    return this.workflows.recordGeneratedReviewDecision({
      ...input,
      note: input.note ?? '',
      expectedSourceSha256: sha256(selected.snapshot.sourceSnapshotJson),
    });
  }

  async read(versionId: string, assetId: string): Promise<Buffer> {
    const selected = this.selected(versionId);
    if (!Object.hasOwn(selected.source.assets, assetId))
      throw new Error('Generated review asset unavailable');
    const image = selected.source.assets[assetId]!;
    const animation = Object.values(generatedAnimationNames)
      .map((name) => selected.manifest.animations[name]!)
      .find((item) => item.assetId === assetId)!;
    const bytes = await this.artifacts.read(image);
    await validateReviewSheet(
      bytes,
      selected.manifest.assets[assetId]!,
      animation,
    );
    // Cancellation/archive/authority may change while decoding. Recheck before returning bytes.
    this.selected(versionId);
    return bytes;
  }
}
