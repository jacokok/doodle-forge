import { z } from 'zod';
import { packSheet } from '@doodleforge/animation';
import { mockParametersSchema } from '@doodleforge/ai';
import { artifactSchema } from './artifacts.js';
import { stageEnvelopeSchema } from './envelope.js';
import { poseAnimationSchema } from './mock-stages.js';
import { normalizedFramesOutputSchema } from './normalize.js';
import type { Stage } from './index.js';

const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const inputSchema = stageEnvelopeSchema.extend({
  inputs: z.strictObject({
    animation: poseAnimationSchema,
    columns: z.number().int().min(1).max(16),
  }),
  parameters: mockParametersSchema,
});
export const sheetOutputSchema = z.strictObject({
  animation: poseAnimationSchema,
  image: artifactSchema,
  sourceSha256s: z.array(hashSchema).min(1).max(8),
  frameWidth: z.literal(256),
  frameHeight: z.literal(256),
  frameCount: z.number().int().min(1).max(8),
  columns: z.number().int().min(1).max(16),
  footAnchor: z.strictObject({ x: z.literal(128), y: z.literal(224) }),
  style: mockParametersSchema.shape.style,
  resolvedInputHash: hashSchema,
});

/** Pack one adopted normalized branch; executor verifies and fences the resulting artifact. */
export function packSheetStage(
  animation: z.infer<typeof poseAnimationSchema>,
): Stage<z.infer<typeof inputSchema>, z.infer<typeof sheetOutputSchema>> {
  const target = poseAnimationSchema.parse(animation);
  return {
    key: 'pack-sheet',
    version: '1',
    inputSchema,
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
        throw new Error('Required normalization dependency unavailable');
      const upstream = normalizedFramesOutputSchema.parse(
        JSON.parse(parent.outputJson),
      );
      if (upstream.animation !== target)
        throw new Error('Normalized branch mismatch');
      if (upstream.style !== input.parameters.style)
        throw new Error('Normalized style mismatch');
      const frames: Buffer[] = [];
      for (const frame of upstream.frames) {
        if (
          frame.image.stepId !== parent.stepId ||
          frame.image.attemptId !== parent.attemptId
        )
          throw new Error('Unselected dependency artifact');
        context.signal.throwIfAborted();
        frames.push(await context.artifacts.read(frame.image));
      }
      context.signal.throwIfAborted();
      const sheet = await packSheet(frames, input.inputs.columns);
      context.signal.throwIfAborted();
      const image = await context.artifacts.putPng(
        context.claim,
        sheet.bytes,
        context.signal,
      );
      return {
        animation: target,
        image,
        sourceSha256s: upstream.frames.map((frame) => frame.image.sha256),
        frameWidth: sheet.frameWidth,
        frameHeight: sheet.frameHeight,
        frameCount: sheet.frameCount,
        columns: sheet.columns,
        footAnchor: upstream.footAnchor,
        style: upstream.style,
        resolvedInputHash: context.resolvedInputHash,
      };
    },
  };
}
