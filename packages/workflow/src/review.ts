import { z } from 'zod';
import { canonicalJson } from '@doodleforge/contracts';
import { validateReviewSheet } from '@doodleforge/content-publisher';
import { artifactSchema } from './artifacts.js';
import { stageEnvelopeSchema } from './envelope.js';
import { generatedAnimationNames, metadataOutputSchema } from './metadata.js';
import { poseAnimationSchema } from './mock-stages.js';
import { buildSheetOutputSchema } from './build-sheet.js';
import type { Stage } from './index.js';

const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const generatedReviewSourceSchema = z.strictObject({
  kind: z.literal('workflow-artifacts'),
  schemaVersion: z.literal(1),
  validationStepId: z.uuid(),
  metadataStepId: z.uuid(),
  metadataOutputHash: hashSchema,
  sourceSnapshotHash: hashSchema,
  resolvedInputHash: hashSchema,
  assets: z.record(z.string().min(1).max(64), artifactSchema),
});
const reviewInputSchema = stageEnvelopeSchema.extend({
  inputs: z.strictObject({}),
  parameters: z.strictObject({}),
});
export const reviewValidationOutputSchema = z
  .strictObject({
    metadata: metadataOutputSchema,
    source: generatedReviewSourceSchema,
    report: z.strictObject({
      sheets: z.literal(5),
      frames: z.number().int().min(5).max(40),
    }),
  })
  .superRefine((output, context) => {
    const manifest = output.metadata.manifest;
    const expected = Object.values(generatedAnimationNames);
    if (
      Object.keys(manifest.assets).length !== 5 ||
      Object.keys(manifest.animations).length !== 5 ||
      Object.keys(output.source.assets).length !== 5
    )
      context.addIssue({
        code: 'custom',
        message: 'Exactly five generated sheets required',
      });
    let frames = 0;
    for (const [branch, name] of Object.entries(generatedAnimationNames)) {
      const animation = manifest.animations[name];
      const source = animation && output.source.assets[animation.assetId];
      const selected =
        output.metadata.sheets[branch as keyof typeof generatedAnimationNames];
      if (!source || canonicalJson(source) !== canonicalJson(selected))
        context.addIssue({
          code: 'custom',
          message: 'Review source binding mismatch',
        });
      frames += animation?.frameCount ?? 0;
    }
    if (
      frames !== output.report.frames ||
      expected.some((name) => !manifest.animations[name])
    )
      context.addIssue({
        code: 'custom',
        message: 'Review frame report mismatch',
      });
  });

/** Revalidate adopted files outside the transaction; freezing occurs only at fenced completion. */
export function validateReviewStage(): Stage<
  z.infer<typeof reviewInputSchema>,
  z.infer<typeof reviewValidationOutputSchema>
> {
  return {
    key: 'validate-review',
    version: '1',
    inputSchema: reviewInputSchema,
    outputSchema: reviewValidationOutputSchema,
    dependencies: [
      { stageKey: 'generate-metadata', targetKey: '' },
      ...poseAnimationSchema.options.map((targetKey) => ({
        stageKey: 'build-sheet',
        targetKey,
      })),
    ],
    cachePolicy: 'disabled',
    reviewSnapshot: ({ metadata, source }) => ({
      characterId: metadata.manifest.characterId,
      version: metadata.manifest.characterVersion,
      manifestJson: canonicalJson(metadata.manifest),
      manifestSha256: metadata.manifestSha256,
      sourceSnapshotJson: canonicalJson(source),
    }),
    async execute(context, input) {
      if (!context.artifacts) throw new Error('Artifact store required');
      if (!context.resolvedInputHash)
        throw new Error('Resolved input identity required');
      if (context.targetKey !== '') throw new Error('Review target mismatch');
      const parent = context.dependencyOutputs?.find(
        (item) =>
          item.stageKey === 'generate-metadata' &&
          item.stageVersion === '1' &&
          item.targetKey === '',
      );
      if (!parent) throw new Error('Required metadata dependency unavailable');
      const metadata = metadataOutputSchema.parse(
        JSON.parse(parent.outputJson),
      );
      if (
        metadata.manifest.characterId !== input.characterId ||
        metadata.manifest.characterVersion !== input.characterVersion
      )
        throw new Error('Review manifest identity mismatch');
      const assets: z.infer<typeof generatedReviewSourceSchema>['assets'] = {};
      let frames = 0;
      for (const branch of poseAnimationSchema.options) {
        const selected = context.dependencyOutputs?.find(
          (item) =>
            item.stageKey === 'build-sheet' &&
            item.stageVersion === '1' &&
            item.targetKey === branch,
        );
        if (!selected) throw new Error('Required sheet dependency unavailable');
        const sheet = buildSheetOutputSchema.parse(
          JSON.parse(selected.outputJson),
        );
        const image = metadata.sheets[branch];
        if (
          sheet.animation !== branch ||
          image.stepId !== selected.stepId ||
          image.attemptId !== selected.attemptId ||
          canonicalJson(image) !== canonicalJson(sheet.image)
        )
          throw new Error('Unselected review sheet artifact');
        const animation =
          metadata.manifest.animations[generatedAnimationNames[branch]]!;
        const asset = metadata.manifest.assets[animation.assetId]!;
        context.signal.throwIfAborted();
        const bytes = await context.artifacts.read(image);
        await validateReviewSheet(bytes, asset, animation);
        context.signal.throwIfAborted();
        assets[animation.assetId] = image;
        frames += animation.frameCount;
      }
      return reviewValidationOutputSchema.parse({
        metadata,
        source: {
          kind: 'workflow-artifacts',
          schemaVersion: 1,
          validationStepId: context.claim.stepId,
          metadataStepId: parent.stepId,
          metadataOutputHash: parent.outputHash,
          sourceSnapshotHash: input.sourceSnapshotHash,
          resolvedInputHash: context.resolvedInputHash,
          assets,
        },
        report: { sheets: 5, frames },
      });
    },
  };
}
