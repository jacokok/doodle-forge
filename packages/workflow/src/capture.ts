import { z } from 'zod';
import { sha256 } from '@doodleforge/contracts';
import { originalUploadPolicy } from '@doodleforge/contracts/authoring';
import { AssetRepository } from '@doodleforge/database';
import { prepareOriginal } from '@doodleforge/image-processing';
import { artifactSchema, readImmutableFile } from './artifacts.js';
import { stageAssetSchema, stageEnvelopeSchema } from './envelope.js';
import type { Stage } from './index.js';

const inputSchema = stageEnvelopeSchema.extend({
  inputs: z.strictObject({ original: stageAssetSchema }),
  parameters: z.strictObject({}),
});
export const captureOutputSchema = z.strictObject({
  original: stageAssetSchema,
  preview: artifactSchema,
});

/** Resolves only a captured immutable original ID, never the mutable current attachment. */
export function captureArtworkStage(
  assets: AssetRepository,
  originalsRoot: string,
): Stage<z.infer<typeof inputSchema>, z.infer<typeof captureOutputSchema>> {
  return {
    key: 'capture-artwork',
    version: '1',
    inputSchema,
    outputSchema: captureOutputSchema,
    dependencies: [],
    cachePolicy: 'disabled',
    artifactRefs: (output) => [output.preview],
    async execute(context, input) {
      if (!context.artifacts) throw new Error('Artifact store required');
      const reference = input.inputs.original;
      const original = assets.get(reference.assetId);
      if (
        !original ||
        original.kind !== 'original' ||
        original.characterId !== input.characterId ||
        original.sha256 !== reference.sha256
      )
        throw new Error('Original reference mismatch');
      const key = `${reference.assetId}.original`;
      if (original.storageKey !== key) throw new Error('Unsafe original key');
      const data = await readImmutableFile(originalsRoot, key, original.bytes);
      if (sha256(data) !== reference.sha256)
        throw new Error('Original hash mismatch');
      context.signal.throwIfAborted();
      const image = await prepareOriginal(
        data,
        original.mediaType,
        originalUploadPolicy,
      );
      if (image.width !== original.width || image.height !== original.height)
        throw new Error('Original dimensions mismatch');
      return {
        original: reference,
        preview: await context.artifacts.putPng(
          context.claim,
          image.preview.data,
          context.signal,
        ),
      };
    },
  };
}
