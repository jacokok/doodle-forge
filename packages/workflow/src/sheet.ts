import { z } from 'zod';
import { packSheet } from '@doodleforge/animation';
import { artifactSchema } from './artifacts.js';
import { stageEnvelopeSchema } from './envelope.js';
import { poseAnimationSchema } from './mock-stages.js';
import { normalizedFramesOutputSchema } from './normalize.js';
import type { Stage } from './index.js';

const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const sheetInputSchema = stageEnvelopeSchema.extend({
  inputs: z.strictObject({ animation: poseAnimationSchema }),
  parameters: z.strictObject({ columns: z.number().int().min(1).max(8) }),
});
export const sheetOutputSchema = z
  .strictObject({
    animation: poseAnimationSchema,
    image: artifactSchema,
    sourceHashes: z.array(hashSchema).min(1).max(8),
    frameWidth: z.literal(256),
    frameHeight: z.literal(256),
    frameCount: z.number().int().min(1).max(8),
    columns: z.number().int().min(1).max(8),
    footAnchor: normalizedFramesOutputSchema.shape.footAnchor,
    style: normalizedFramesOutputSchema.shape.style,
    resolvedInputHash: hashSchema,
  })
  .refine(
    (value) =>
      value.sourceHashes.length === value.frameCount &&
      value.image.width === value.columns * value.frameWidth &&
      value.image.height ===
        Math.ceil(value.frameCount / value.columns) * value.frameHeight,
    'Inconsistent sheet layout',
  );

/** Library-only packing of a selected normalized animation branch. */
export function buildSheetStage(
  animation: z.infer<typeof poseAnimationSchema>,
): Stage<z.infer<typeof sheetInputSchema>, z.infer<typeof sheetOutputSchema>> {
  const target = poseAnimationSchema.parse(animation);
  return {
    key: 'build-sheet',
    version: '1',
    inputSchema: sheetInputSchema,
    outputSchema: sheetOutputSchema,
    dependencies: [{ stageKey: 'normalize-frames', targetKey: target }],
    cachePolicy: 'disabled',
    artifactRefs: (output) => [output.image],
    async execute(context, input) {
      if (!context.artifacts) throw new Error('Artifact store required');
      if (!context.resolvedInputHash)
        throw new Error('Resolved input identity required');
      if (context.targetKey !== target || input.inputs.animation !== target)
        throw new Error('Sheet target mismatch');
      const parent = context.dependencyOutputs?.find(
        (item) =>
          item.stageKey === 'normalize-frames' &&
          item.targetKey === target &&
          item.stageVersion === '1',
      );
      if (!parent)
        throw new Error('Required normalized dependency unavailable');
      const upstream = normalizedFramesOutputSchema.parse(
        JSON.parse(parent.outputJson),
      );
      if (upstream.animation !== target)
        throw new Error('Normalized branch mismatch');
      const frames: Buffer[] = [];
      for (const { image } of upstream.frames) {
        if (
          image.stepId !== parent.stepId ||
          image.attemptId !== parent.attemptId
        )
          throw new Error('Unselected dependency artifact');
        context.signal.throwIfAborted();
        frames.push(await context.artifacts.read(image));
      }
      context.signal.throwIfAborted();
      const packed = await packSheet(frames, input.parameters.columns);
      context.signal.throwIfAborted();
      const image = await context.artifacts.putPng(
        context.claim,
        packed.bytes,
        context.signal,
      );
      return {
        animation: target,
        image,
        sourceHashes: upstream.frames.map(({ image }) => image.sha256),
        frameWidth: packed.frameWidth,
        frameHeight: packed.frameHeight,
        frameCount: packed.frameCount,
        columns: packed.columns,
        footAnchor: upstream.footAnchor,
        style: upstream.style,
        resolvedInputHash: context.resolvedInputHash,
      };
    },
  };
}
