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

export const cleanImageStage = (provider: MockGenerationProvider) =>
  imageStage(provider, 'clean-image');
export const characterMasterStage = (provider: MockGenerationProvider) =>
  imageStage(provider, 'character-master');
