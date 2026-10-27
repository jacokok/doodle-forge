import { z } from 'zod';
import { normalizeFrame } from '@doodleforge/image-processing';
import { mockParametersSchema } from '@doodleforge/ai';
import { artifactSchema } from './artifacts.js';
import { stageEnvelopeSchema } from './envelope.js';
import { framesOutputSchema, poseAnimationSchema } from './mock-stages.js';
import type { Stage } from './index.js';

const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const boundsSchema = z.strictObject({
  x: z.number().int().min(0).max(255),
  y: z.number().int().min(0).max(255),
  width: z.number().int().min(1).max(256),
  height: z.number().int().min(1).max(256),
});
const normalizeInputSchema = stageEnvelopeSchema.extend({
  inputs: z.strictObject({ animation: poseAnimationSchema }),
  parameters: mockParametersSchema,
});
export const normalizedFramesOutputSchema = z.strictObject({
  animation: poseAnimationSchema,
  frames: z
    .array(
      z.strictObject({
        sourceSha256: hashSchema,
        image: artifactSchema,
        sourceBounds: boundsSchema,
        placedBounds: boundsSchema,
      }),
    )
    .min(1)
    .max(8),
  footAnchor: z.strictObject({ x: z.literal(128), y: z.literal(224) }),
  style: mockParametersSchema.shape.style,
  resolvedInputHash: hashSchema,
});

/** Normalize the selected adopted branch; files are not authoritative until fenced adoption. */
export function normalizeFramesStage(
  animation: z.infer<typeof poseAnimationSchema>,
): Stage<
  z.infer<typeof normalizeInputSchema>,
  z.infer<typeof normalizedFramesOutputSchema>
> {
  const target = poseAnimationSchema.parse(animation);
  return {
    key: 'normalize-frames',
    version: '1',
    inputSchema: normalizeInputSchema,
    outputSchema: normalizedFramesOutputSchema,
    dependencies: [{ stageKey: 'generate-frames', targetKey: target }],
    cachePolicy: 'disabled',
    artifactRefs: (output) => output.frames.map((frame) => frame.image),
    async execute(context, input) {
      if (!context.artifacts) throw new Error('Artifact store required');
      if (!context.resolvedInputHash)
        throw new Error('Resolved input identity required');
      if (context.targetKey !== target || input.inputs.animation !== target)
        throw new Error('Normalization target mismatch');
      const parent = context.dependencyOutputs?.find(
        (item) =>
          item.stageKey === 'generate-frames' &&
          item.targetKey === target &&
          item.stageVersion === '1',
      );
      if (!parent) throw new Error('Required frame dependency unavailable');
      const upstream = framesOutputSchema.parse(JSON.parse(parent.outputJson));
      if (upstream.animation !== target)
        throw new Error('Frame branch mismatch');
      const frames = [];
      for (const source of upstream.frames) {
        if (
          source.stepId !== parent.stepId ||
          source.attemptId !== parent.attemptId
        )
          throw new Error('Unselected dependency artifact');
        context.signal.throwIfAborted();
        const bytes = await context.artifacts.read(source);
        const normalized = await normalizeFrame(bytes, input.parameters.style);
        context.signal.throwIfAborted();
        const image = await context.artifacts.putPng(
          context.claim,
          normalized.bytes,
          context.signal,
        );
        frames.push({
          sourceSha256: source.sha256,
          image,
          sourceBounds: normalized.sourceBounds,
          placedBounds: normalized.placedBounds,
        });
      }
      return {
        animation: target,
        frames,
        footAnchor: { x: 128, y: 224 },
        style: input.parameters.style,
        resolvedInputHash: context.resolvedInputHash,
      };
    },
  };
}
