import { z } from 'zod';

const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
/** Asset identifiers and hashes, never inline artwork or client-selected storage paths. */
export const stageAssetSchema = z.strictObject({
  assetId: z.uuid(),
  sha256: hashSchema,
});
export const stageEnvelopeSchema = z.strictObject({
  schemaVersion: z.literal(1),
  characterId: z.uuid(),
  characterVersion: z.number().int().positive(),
  sourceSnapshotHash: hashSchema,
  inputs: z.record(z.string(), z.json()),
  parameters: z.record(z.string(), z.json()),
});
export type StageEnvelope = z.infer<typeof stageEnvelopeSchema>;
