import { z } from 'zod';
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
/** Only this offline metadata stage is registered; no artifact or publication handlers yet. */
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
export function mockStageHandlers() {
  return [stageHandler(mockAnalysisStage())];
}
