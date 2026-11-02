import { z } from 'zod';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import {
  AssetRepository,
  type DatabaseConnection,
} from '@doodleforge/database';
import { DeterministicMockProvider as ImageMockProvider } from '@doodleforge/ai';
import {
  DeterministicMockProvider,
  ProviderError,
  analysisRequestSchema,
  analysisResultSchema,
  seedSchema,
  styleSchema,
  type Provider,
} from '@doodleforge/ai/capabilities';
import {
  stageEnvelopeSchema,
  RetryableStageError,
  stageHandler,
  type Stage,
  type StageHandler,
  ArtifactStore,
  captureArtworkStage,
  analysisStage,
  cleanImageStage,
  characterMasterStage,
  bodyTypeStage,
  poseStage,
  framesStage,
  normalizeFramesStage,
  buildSheetStage,
  generateMetadataStage,
  validateReviewStage,
  mockGenerationBranches,
} from '@doodleforge/workflow';

export const analysisStageInputSchema = stageEnvelopeSchema.extend({
  inputs: analysisRequestSchema.omit({
    capability: true,
    style: true,
    seed: true,
  }),
  parameters: z.strictObject({
    providerId: z.literal('deterministic-mock'),
    modelVersion: z.literal('1'),
    style: styleSchema,
    seed: seedSchema,
  }),
});
/** Retained metadata protocol; capture-first generation has a separate graph and registry. */
export function mockAnalysisStage(
  provider: Provider = new DeterministicMockProvider(),
): Stage<
  z.infer<typeof analysisStageInputSchema>,
  z.infer<typeof analysisResultSchema>
> {
  if (provider.id !== 'deterministic-mock' || provider.version !== '1')
    throw new Error('Only mock provider is enabled');
  return {
    key: 'analyze-description',
    version: '1',
    dependencies: [],
    cachePolicy: 'disabled',
    inputSchema: analysisStageInputSchema,
    outputSchema: analysisResultSchema,
    async execute({ signal }, input) {
      try {
        const result = analysisResultSchema.parse(
          await provider.generate(
            {
              capability: 'analyze_description',
              ...input.inputs,
              style: input.parameters.style,
              seed: input.parameters.seed,
            },
            { signal },
          ),
        );
        if (
          result.provenance.providerId !== provider.id ||
          result.provenance.modelVersion !== provider.version ||
          result.provenance.seed !== input.parameters.seed
        )
          throw new Error('Provider provenance mismatch');
        return result;
      } catch (error) {
        if (
          error instanceof ProviderError &&
          error.code === 'TRANSIENT_FAILURE'
        )
          throw new RetryableStageError();
        throw error;
      }
    },
  };
}
export function mockStageHandlers(
  connection?: DatabaseConnection,
  storageRoot?: string,
): StageHandler[] {
  const handlers = [stageHandler(mockAnalysisStage())];
  if (!connection || !storageRoot) return handlers;
  const artifactRoot = join(storageRoot, 'generated', 'attempts');
  mkdirSync(artifactRoot, { recursive: true, mode: 0o700 });
  const artifacts = new ArtifactStore(artifactRoot);
  const images = new ImageMockProvider();
  const frames = new DeterministicMockProvider();
  const bind = <I, O>(stage: Stage<I, O>): StageHandler => {
    const handler = stageHandler(stage, undefined, artifacts);
    return {
      ...handler,
      async execute(...args: Parameters<StageHandler['execute']>) {
        try {
          return await handler.execute(...args);
        } catch (error) {
          if (
            error instanceof ProviderError &&
            error.code === 'TRANSIENT_FAILURE'
          )
            throw new RetryableStageError();
          throw error;
        }
      },
    };
  };
  const branches = (
    key: string,
    make: (branch: (typeof mockGenerationBranches)[number]) => StageHandler,
  ): StageHandler => {
    const targets = new Map<string, StageHandler>(
      mockGenerationBranches.map((branch) => [branch, make(branch)]),
    );
    return {
      key,
      version: '1',
      async execute(repository, work, signal, leaseMs) {
        const handler = targets.get(work.step.targetKey);
        if (!handler) throw new Error('Unsupported animation target');
        return handler.execute(repository, work, signal, leaseMs);
      },
    };
  };
  handlers.push(
    bind(
      captureArtworkStage(
        new AssetRepository(connection),
        join(storageRoot, 'originals'),
      ),
    ),
    bind(analysisStage(images)),
    bind(cleanImageStage(images)),
    bind(characterMasterStage(images)),
    bind(bodyTypeStage(images)),
    bind(poseStage(frames)),
    branches('generate-frames', (branch) => bind(framesStage(frames, branch))),
    branches('normalize-frames', (branch) =>
      bind(normalizeFramesStage(branch)),
    ),
    branches('build-sheet', (branch) => bind(buildSheetStage(branch))),
    bind(generateMetadataStage()),
    bind(validateReviewStage()),
  );
  return handlers;
}
