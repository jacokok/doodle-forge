import { z } from 'zod';
import { canonicalJson, sha256 } from '@doodleforge/contracts';
import {
  designBriefSchema,
  designInputSchema,
  imageRequestSchema,
  mockParametersSchema,
  validateImageCandidate,
  type MockGenerationProvider,
} from '@doodleforge/ai';
import {
  framesRequestSchema,
  provenanceSchema as frameProviderProvenanceSchema,
  type Provider as FrameProvider,
} from '@doodleforge/ai/capabilities';
import { artifactSchema, type Artifact } from './artifacts.js';
import { captureOutputSchema } from './capture.js';
import { stageEnvelopeSchema } from './envelope.js';
import type { Stage, StageContext, StageDependency } from './index.js';

const provenanceSchema = mockParametersSchema.extend({
  resolvedInputHash: z.string().regex(/^[a-f0-9]{64}$/),
  requestHash: z.string().regex(/^[a-f0-9]{64}$/),
  sourceHashes: z.array(z.string().regex(/^[a-f0-9]{64}$/)).max(2),
});
export const analysisOutputSchema = z.strictObject({
  brief: designBriefSchema,
  provenance: provenanceSchema,
});
export const mockImageOutputSchema = z.strictObject({
  image: artifactSchema,
  provenance: provenanceSchema,
});
export const bodyTypeOutputSchema = z.strictObject({
  bodyType: designBriefSchema.shape.bodyType,
  targetFootAnchor: z.strictObject({ x: z.literal(128), y: z.literal(224) }),
  provenance: provenanceSchema,
});
export const poseAnimationSchema = z.enum([
  'idle',
  'walk',
  'attack',
  'hurt',
  'ko',
]);
export const poseOutputSchema = z.strictObject({
  animation: poseAnimationSchema,
  image: artifactSchema,
  provenance: provenanceSchema,
  providerProvenance: frameProviderProvenanceSchema,
});
const poseInputSchema = stageEnvelopeSchema.extend({
  inputs: z.strictObject({ animation: poseAnimationSchema }),
  parameters: mockParametersSchema,
});
const framesInputSchema = stageEnvelopeSchema.extend({
  inputs: z.strictObject({
    animation: poseAnimationSchema,
    frameCount: z.number().int().min(1).max(8),
  }),
  parameters: mockParametersSchema,
});
export const framesOutputSchema = z.strictObject({
  animation: poseAnimationSchema,
  frames: z.array(artifactSchema).min(1).max(8),
  provenance: provenanceSchema,
  providerProvenance: frameProviderProvenanceSchema,
});
const analysisInputSchema = stageEnvelopeSchema.extend({
  inputs: designInputSchema,
  parameters: mockParametersSchema,
});
const imageInputSchema = stageEnvelopeSchema.extend({
  inputs: z.strictObject({}),
  parameters: mockParametersSchema,
});

function dependency(context: StageContext, key: string): StageDependency {
  const matches = context.dependencyOutputs?.filter(
    (item) => item.stageKey === key,
  );
  if (
    matches?.length !== 1 ||
    matches[0]!.stageVersion !== '1' ||
    matches[0]!.targetKey !== ''
  )
    throw new Error('Required typed dependency unavailable');
  return matches[0]!;
}
function selectedArtifact(
  context: StageContext,
  parent: StageDependency,
  ref: Artifact,
) {
  if (!context.artifacts) throw new Error('Artifact store required');
  if (ref.stepId !== parent.stepId || ref.attemptId !== parent.attemptId)
    throw new Error('Unselected dependency artifact');
  return context.artifacts.read(ref);
}
function provenance(
  context: StageContext,
  parameters: z.infer<typeof mockParametersSchema>,
  request: unknown,
  sourceHashes: string[],
) {
  if (!context.resolvedInputHash)
    throw new Error('Resolved input identity required');
  return provenanceSchema.parse({
    ...parameters,
    resolvedInputHash: context.resolvedInputHash,
    requestHash: sha256(canonicalJson(request)),
    sourceHashes,
  });
}
function assertProvider(
  provider: MockGenerationProvider,
  parameters: z.infer<typeof mockParametersSchema>,
) {
  if (
    provider.providerId !== parameters.providerId ||
    provider.providerVersion !== parameters.providerVersion
  )
    throw new Error('Unsupported provider identity');
}

export function analysisStage(
  provider: MockGenerationProvider,
): Stage<
  z.infer<typeof analysisInputSchema>,
  z.infer<typeof analysisOutputSchema>
> {
  return {
    key: 'analyze-captured-description',
    version: '1',
    inputSchema: analysisInputSchema,
    outputSchema: analysisOutputSchema,
    dependencies: ['capture-artwork'],
    cachePolicy: 'disabled',
    async execute(context, input) {
      assertProvider(provider, input.parameters);
      const parent = dependency(context, 'capture-artwork');
      const capture = captureOutputSchema.parse(JSON.parse(parent.outputJson));
      // Revalidate the source even for text analysis; a corrupt capture cannot advance the graph.
      await selectedArtifact(context, parent, capture.preview);
      context.signal.throwIfAborted();
      const brief = designBriefSchema.parse(
        await provider.analyze(input.inputs, context.signal),
      );
      if (
        brief.bodyType !== input.inputs.bodyType ||
        brief.fightingStyle !== input.inputs.fightingStyle ||
        brief.specialPower !== input.inputs.specialPower
      )
        throw new Error('Provider changed explicit creative choices');
      return {
        brief,
        provenance: provenance(context, input.parameters, input.inputs, [
          capture.preview.sha256,
        ]),
      };
    },
  };
}

function imageStage(
  provider: MockGenerationProvider,
  capability: 'clean-image' | 'character-master',
): Stage<
  z.infer<typeof imageInputSchema>,
  z.infer<typeof mockImageOutputSchema>
> {
  return {
    key: capability,
    version: '1',
    inputSchema: imageInputSchema,
    outputSchema: mockImageOutputSchema,
    dependencies:
      capability === 'clean-image'
        ? ['capture-artwork']
        : ['clean-image', 'analyze-captured-description'],
    cachePolicy: 'disabled',
    artifactRefs: (output) => [output.image],
    async execute(context, input) {
      assertProvider(provider, input.parameters);
      if (!context.artifacts) throw new Error('Artifact store required');
      const parent = dependency(
        context,
        capability === 'clean-image' ? 'capture-artwork' : 'clean-image',
      );
      const ref =
        capability === 'clean-image'
          ? captureOutputSchema.parse(JSON.parse(parent.outputJson)).preview
          : mockImageOutputSchema.parse(JSON.parse(parent.outputJson)).image;
      const source = await selectedArtifact(context, parent, ref);
      const brief =
        capability === 'character-master'
          ? analysisOutputSchema.parse(
              JSON.parse(
                dependency(context, 'analyze-captured-description').outputJson,
              ),
            ).brief
          : undefined;
      const request = imageRequestSchema.parse({
        ...input.parameters,
        capability,
        sourceSha256: ref.sha256,
        ...(brief ? { brief } : {}),
      });
      context.signal.throwIfAborted();
      const candidate = await validateImageCandidate(
        await provider.generate(request, source, context.signal),
        request,
      );
      context.signal.throwIfAborted();
      const image = await context.artifacts.putPng(
        context.claim,
        candidate.bytes,
        context.signal,
      );
      return {
        image,
        provenance: provenance(context, input.parameters, request, [
          ref.sha256,
        ]),
      };
    },
  };
}
/** Preserve the explicitly selected body type; the anchor is a target, not measured art. */
export function bodyTypeStage(
  provider: MockGenerationProvider,
): Stage<
  z.infer<typeof imageInputSchema>,
  z.infer<typeof bodyTypeOutputSchema>
> {
  return {
    key: 'determine-body-type',
    version: '1',
    inputSchema: imageInputSchema,
    outputSchema: bodyTypeOutputSchema,
    dependencies: ['character-master', 'analyze-captured-description'],
    cachePolicy: 'disabled',
    async execute(context, input) {
      assertProvider(provider, input.parameters);
      const masterParent = dependency(context, 'character-master');
      const master = mockImageOutputSchema.parse(
        JSON.parse(masterParent.outputJson),
      );
      const analysis = analysisOutputSchema.parse(
        JSON.parse(
          dependency(context, 'analyze-captured-description').outputJson,
        ),
      );
      const sourceHash = master.provenance.sourceHashes[0];
      if (master.provenance.sourceHashes.length !== 1 || !sourceHash)
        throw new Error('Invalid master provenance');
      const masterRequest = imageRequestSchema.parse({
        providerId: master.provenance.providerId,
        providerVersion: master.provenance.providerVersion,
        style: master.provenance.style,
        seed: master.provenance.seed,
        capability: 'character-master',
        sourceSha256: sourceHash,
        brief: analysis.brief,
      });
      if (
        sha256(canonicalJson(masterRequest)) !== master.provenance.requestHash
      )
        throw new Error('Master analysis lineage mismatch');
      await selectedArtifact(context, masterParent, master.image);
      context.signal.throwIfAborted();
      const request = {
        bodyType: analysis.brief.bodyType,
        masterSha256: master.image.sha256,
      };
      return {
        bodyType: analysis.brief.bodyType,
        targetFootAnchor: { x: 128, y: 224 },
        provenance: provenance(context, input.parameters, request, [
          master.image.sha256,
        ]),
      };
    },
  };
}

/** One synthetic pose per animation; the mock provider conditions on the master hash, not its pixels. */
export function poseStage(
  provider: FrameProvider,
): Stage<z.infer<typeof poseInputSchema>, z.infer<typeof poseOutputSchema>> {
  return {
    key: 'generate-pose',
    version: '1',
    inputSchema: poseInputSchema,
    outputSchema: poseOutputSchema,
    dependencies: [
      'character-master',
      'analyze-captured-description',
      'determine-body-type',
    ],
    cachePolicy: 'disabled',
    artifactRefs: (output) => [output.image],
    async execute(context, input) {
      if (!context.artifacts) throw new Error('Artifact store required');
      if (
        provider.id !== input.parameters.providerId ||
        provider.version !== input.parameters.providerVersion
      )
        throw new Error('Unsupported provider identity');
      if (context.targetKey !== input.inputs.animation)
        throw new Error('Pose target mismatch');
      const parent = dependency(context, 'character-master');
      const master = mockImageOutputSchema.parse(JSON.parse(parent.outputJson));
      const analysis = analysisOutputSchema.parse(
        JSON.parse(
          dependency(context, 'analyze-captured-description').outputJson,
        ),
      );
      const body = bodyTypeOutputSchema.parse(
        JSON.parse(dependency(context, 'determine-body-type').outputJson),
      );
      if (
        body.bodyType !== analysis.brief.bodyType ||
        body.provenance.sourceHashes.length !== 1 ||
        body.provenance.sourceHashes[0] !== master.image.sha256
      )
        throw new Error('Pose dependency lineage mismatch');
      await selectedArtifact(context, parent, master.image);
      context.signal.throwIfAborted();
      const hash = master.image.sha256;
      const request = framesRequestSchema.parse({
        capability: 'generate_frames',
        brief: {
          summary: analysis.brief.description,
          bodyType: body.bodyType,
          fightingStyle: analysis.brief.fightingStyle,
          specialPower: analysis.brief.specialPower,
          style: input.parameters.style,
          palette: [0, 6, 12].map(
            (offset) => `#${hash.slice(offset, offset + 6)}`,
          ),
        },
        masterSha256: hash,
        animation: input.inputs.animation,
        facing: 'right',
        frameCount: 1,
        width: 256,
        height: 256,
        seed: input.parameters.seed,
      });
      const result = await provider.generate(request, {
        signal: context.signal,
      });
      if (result.capability !== 'generate_frames' || result.frames.length !== 1)
        throw new Error('Invalid pose provider result');
      const providerProvenance = frameProviderProvenanceSchema.parse(
        result.provenance,
      );
      if (
        providerProvenance.providerId !== provider.id ||
        providerProvenance.modelVersion !== provider.version ||
        providerProvenance.seed !== request.seed
      )
        throw new Error('Invalid pose provider provenance');
      const frame = result.frames[0]!;
      // Reuse the strict PNG/hash/alpha validator; its synthetic wrapper is not persisted as provider provenance.
      const validationRequest = imageRequestSchema.parse({
        ...input.parameters,
        capability: 'clean-image',
        sourceSha256: hash,
      });
      const candidate = await validateImageCandidate(
        {
          providerId: provider.id,
          providerVersion: provider.version,
          capability: 'clean-image',
          sourceSha256: hash,
          sha256: frame.sha256,
          mediaType: frame.mediaType,
          width: frame.width,
          height: frame.height,
          bytes: Buffer.from(frame.bytes),
        },
        validationRequest,
      );
      context.signal.throwIfAborted();
      const image = await context.artifacts.putPng(
        context.claim,
        candidate.bytes,
        context.signal,
      );
      return {
        animation: input.inputs.animation,
        image,
        provenance: provenance(context, input.parameters, request, [hash]),
        providerProvenance,
      };
    },
  };
}

/** Bounded raw frames; the current mock records but does not consume pose pixels. */
export function framesStage(
  provider: FrameProvider,
  animation: z.infer<typeof poseAnimationSchema>,
): Stage<
  z.infer<typeof framesInputSchema>,
  z.infer<typeof framesOutputSchema>
> {
  const target = poseAnimationSchema.parse(animation);
  return {
    key: 'generate-frames',
    version: '1',
    inputSchema: framesInputSchema,
    outputSchema: framesOutputSchema,
    dependencies: [
      'character-master',
      'analyze-captured-description',
      'determine-body-type',
      { stageKey: 'generate-pose', targetKey: target },
    ],
    cachePolicy: 'disabled',
    artifactRefs: (output) => output.frames,
    async execute(context, input) {
      if (!context.artifacts) throw new Error('Artifact store required');
      if (
        provider.id !== input.parameters.providerId ||
        provider.version !== input.parameters.providerVersion
      )
        throw new Error('Unsupported provider identity');
      if (context.targetKey !== target || input.inputs.animation !== target)
        throw new Error('Frame target mismatch');
      const parent = dependency(context, 'character-master');
      const master = mockImageOutputSchema.parse(JSON.parse(parent.outputJson));
      const analysis = analysisOutputSchema.parse(
        JSON.parse(
          dependency(context, 'analyze-captured-description').outputJson,
        ),
      );
      const body = bodyTypeOutputSchema.parse(
        JSON.parse(dependency(context, 'determine-body-type').outputJson),
      );
      const poseParent = context.dependencyOutputs?.find(
        (item) =>
          item.stageKey === 'generate-pose' &&
          item.targetKey === target &&
          item.stageVersion === '1',
      );
      if (!poseParent) throw new Error('Required pose dependency unavailable');
      const pose = poseOutputSchema.parse(JSON.parse(poseParent.outputJson));
      const hash = master.image.sha256;
      if (
        pose.animation !== target ||
        pose.provenance.sourceHashes.length !== 1 ||
        pose.provenance.sourceHashes[0] !== hash ||
        body.bodyType !== analysis.brief.bodyType ||
        body.provenance.sourceHashes.length !== 1 ||
        body.provenance.sourceHashes[0] !== hash
      )
        throw new Error('Frame dependency lineage mismatch');
      await selectedArtifact(context, parent, master.image);
      await selectedArtifact(context, poseParent, pose.image);
      context.signal.throwIfAborted();
      const request = framesRequestSchema.parse({
        capability: 'generate_frames',
        brief: {
          summary: analysis.brief.description,
          bodyType: body.bodyType,
          fightingStyle: analysis.brief.fightingStyle,
          specialPower: analysis.brief.specialPower,
          style: input.parameters.style,
          palette: [0, 6, 12].map(
            (offset) => `#${hash.slice(offset, offset + 6)}`,
          ),
        },
        masterSha256: hash,
        animation: target,
        facing: 'right',
        frameCount: input.inputs.frameCount,
        width: 256,
        height: 256,
        seed: input.parameters.seed,
      });
      const result = await provider.generate(request, {
        signal: context.signal,
      });
      if (
        result.capability !== 'generate_frames' ||
        result.frames.length !== request.frameCount
      )
        throw new Error('Invalid frame provider result');
      const providerProvenance = frameProviderProvenanceSchema.parse(
        result.provenance,
      );
      if (
        providerProvenance.providerId !== provider.id ||
        providerProvenance.modelVersion !== provider.version ||
        providerProvenance.seed !== request.seed
      )
        throw new Error('Invalid frame provider provenance');
      const validationRequest = imageRequestSchema.parse({
        ...input.parameters,
        capability: 'clean-image',
        sourceSha256: hash,
      });
      const frames: Artifact[] = [];
      for (const frame of result.frames) {
        const candidate = await validateImageCandidate(
          {
            providerId: provider.id,
            providerVersion: provider.version,
            capability: 'clean-image',
            sourceSha256: hash,
            sha256: frame.sha256,
            mediaType: frame.mediaType,
            width: frame.width,
            height: frame.height,
            bytes: Buffer.from(frame.bytes),
          },
          validationRequest,
        );
        context.signal.throwIfAborted();
        frames.push(
          await context.artifacts.putPng(
            context.claim,
            candidate.bytes,
            context.signal,
          ),
        );
      }
      return {
        animation: target,
        frames,
        provenance: provenance(context, input.parameters, request, [
          hash,
          pose.image.sha256,
        ]),
        providerProvenance,
      };
    },
  };
}

export const cleanImageStage = (provider: MockGenerationProvider) =>
  imageStage(provider, 'clean-image');
export const characterMasterStage = (provider: MockGenerationProvider) =>
  imageStage(provider, 'character-master');
