import { z } from 'zod';
import {
  characterMetadataSchema,
  fightingStyleSchema,
  specialPowerSchema,
} from '@doodleforge/contracts/authoring';

export const styleSchema = z.enum(['original', 'cartoon', 'pixel']);
export const seedSchema = z.number().int().min(0).max(0xffffffff);
export const designBriefSchema = z.strictObject({
  summary: z.string().max(2000),
  bodyType: characterMetadataSchema.shape.bodyType,
  fightingStyle: fightingStyleSchema,
  specialPower: specialPowerSchema,
  style: styleSchema,
  palette: z.array(z.string().regex(/^#[a-f0-9]{6}$/)).length(3),
});
export const analysisRequestSchema = z.strictObject({
  capability: z.literal('analyze_description'),
  description: characterMetadataSchema.shape.description,
  bodyType: characterMetadataSchema.shape.bodyType,
  fightingStyle: fightingStyleSchema,
  specialPower: specialPowerSchema,
  style: styleSchema,
  seed: seedSchema,
});
export const framesRequestSchema = z.strictObject({
  capability: z.literal('generate_frames'),
  brief: designBriefSchema,
  masterSha256: z.string().regex(/^[a-f0-9]{64}$/),
  animation: z.enum(['idle', 'walk', 'attack', 'hurt', 'ko']),
  facing: z.enum(['left', 'right']),
  frameCount: z.number().int().min(1).max(8),
  width: z.literal(256),
  height: z.literal(256),
  seed: seedSchema,
});
export const providerRequestSchema = z.discriminatedUnion('capability', [
  analysisRequestSchema,
  framesRequestSchema,
]);
export const provenanceSchema = z.strictObject({
  providerId: z.string().min(1).max(80),
  modelVersion: z.string().min(1).max(80),
  requestId: z.string().min(1).max(120),
  seed: seedSchema,
  costUsd: z.number().nonnegative(),
  warnings: z.array(z.string().max(200)).max(10),
});
export const analysisResultSchema = z.strictObject({
  capability: z.literal('analyze_description'),
  brief: designBriefSchema,
  provenance: provenanceSchema,
});
export type ProviderRequest = z.infer<typeof providerRequestSchema>;
export type AnalysisResult = z.infer<typeof analysisResultSchema>;
export interface FrameCandidate {
  bytes: Uint8Array;
  sha256: string;
  mediaType: 'image/png';
  width: 256;
  height: 256;
}
export interface FramesResult {
  capability: 'generate_frames';
  frames: FrameCandidate[];
  provenance: z.infer<typeof provenanceSchema>;
}
export type ProviderResult = AnalysisResult | FramesResult;
export interface Provider {
  readonly id: string;
  readonly version: string;
  readonly capabilities: readonly ProviderRequest['capability'][];
  generate(
    request: ProviderRequest,
    context: { readonly signal: AbortSignal },
  ): Promise<ProviderResult>;
}
export class ProviderError extends Error {
  constructor(
    readonly code:
      'UNSUPPORTED_CAPABILITY' | 'INVALID_REQUEST' | 'TRANSIENT_FAILURE',
  ) {
    super(code);
  }
}
export { DeterministicMockProvider } from './mock.js';
