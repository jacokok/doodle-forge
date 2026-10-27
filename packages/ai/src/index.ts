import { z } from 'zod';
import sharp from 'sharp';
import { canonicalJson, sha256 } from '@doodleforge/contracts';
import {
  characterCreativeChoicesSchema,
  characterMetadataSchema,
} from '@doodleforge/contracts/authoring';
import { prepareOriginal } from '@doodleforge/image-processing';

export const mockProviderIdentity = {
  providerId: 'deterministic-mock',
  providerVersion: '1',
} as const;
export const mockParametersSchema = z.strictObject({
  providerId: z.literal(mockProviderIdentity.providerId),
  providerVersion: z.literal(mockProviderIdentity.providerVersion),
  seed: z.number().int().min(0).max(0xffffffff),
  style: z.enum(['original', 'cartoon', 'pixel']),
});
export const designInputSchema = characterMetadataSchema
  .omit({ name: true })
  .extend(characterCreativeChoicesSchema.shape);
export const designBriefSchema = designInputSchema.extend({
  schemaVersion: z.literal(1),
  warning: z.literal(
    'Synthetic mock output; not safety moderation or art-fidelity evaluation.',
  ),
});
export type DesignBrief = z.infer<typeof designBriefSchema>;
const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const commonImageRequest = mockParametersSchema.extend({
  sourceSha256: hashSchema,
});
export const imageRequestSchema = z.discriminatedUnion('capability', [
  commonImageRequest.extend({ capability: z.literal('clean-image') }),
  commonImageRequest.extend({
    capability: z.literal('character-master'),
    brief: designBriefSchema,
  }),
]);
export type ImageRequest = z.infer<typeof imageRequestSchema>;
export const imageCandidateSchema = z.strictObject({
  providerId: z.literal(mockProviderIdentity.providerId),
  providerVersion: z.literal(mockProviderIdentity.providerVersion),
  capability: z.enum(['clean-image', 'character-master']),
  sourceSha256: hashSchema,
  sha256: hashSchema,
  mediaType: z.literal('image/png'),
  width: z.literal(256),
  height: z.literal(256),
  bytes: z
    .instanceof(Buffer)
    .refine(
      (value) => value.length > 0 && value.length <= 2 * 1024 * 1024,
      'Candidate exceeds byte limit',
    ),
});
export type ImageCandidate = z.infer<typeof imageCandidateSchema>;
/** Offline-only boundary. No SDK, URL fetching, tools, credentials or silent provider fallback. */
export interface MockGenerationProvider {
  readonly providerId: typeof mockProviderIdentity.providerId;
  readonly providerVersion: typeof mockProviderIdentity.providerVersion;
  analyze(
    input: z.infer<typeof designInputSchema>,
    signal: AbortSignal,
  ): Promise<DesignBrief>;
  generate(
    input: ImageRequest,
    source: Buffer,
    signal: AbortSignal,
  ): Promise<ImageCandidate>;
}

/** Treat adapters as untrusted: check identity, lineage, bytes, decode and nonempty alpha. */
export async function validateImageCandidate(
  candidate: unknown,
  request: ImageRequest,
): Promise<ImageCandidate> {
  const expected = imageRequestSchema.parse(request);
  const validated = imageCandidateSchema.parse(candidate);
  const parsed = { ...validated, bytes: Buffer.from(validated.bytes) };
  if (
    parsed.capability !== expected.capability ||
    parsed.sourceSha256 !== expected.sourceSha256 ||
    sha256(parsed.bytes) !== parsed.sha256
  )
    throw new Error('Candidate provenance/hash mismatch');
  const image = await prepareOriginal(parsed.bytes, parsed.mediaType, {
    maxPixels: 256 * 256,
    previewEdge: 256,
  });
  if (image.width !== parsed.width || image.height !== parsed.height)
    throw new Error('Candidate dimensions mismatch');
  const { data, info } = await sharp(parsed.bytes)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let visible = false;
  let transparent = false;
  for (let offset = 3; offset < data.length; offset += info.channels) {
    visible ||= data[offset]! > 16;
    transparent ||= data[offset] === 0;
  }
  if (!visible || !transparent)
    throw new Error(
      'Candidate must contain visible art and transparent background',
    );
  return parsed;
}

export class DeterministicMockProvider implements MockGenerationProvider {
  readonly providerId = mockProviderIdentity.providerId;
  readonly providerVersion = mockProviderIdentity.providerVersion;

  async analyze(
    input: z.infer<typeof designInputSchema>,
    signal: AbortSignal,
  ): Promise<DesignBrief> {
    signal.throwIfAborted();
    const design = designInputSchema.parse(input);
    return designBriefSchema.parse({
      ...design,
      description: design.description.replace(/\s+/g, ' ').trim(),
      schemaVersion: 1,
      warning:
        'Synthetic mock output; not safety moderation or art-fidelity evaluation.',
    });
  }

  async generate(
    input: ImageRequest,
    source: Buffer,
    signal: AbortSignal,
  ): Promise<ImageCandidate> {
    signal.throwIfAborted();
    const request = imageRequestSchema.parse(input);
    if (
      source.length > 10 * 1024 * 1024 ||
      sha256(source) !== request.sourceSha256
    )
      throw new Error('Source hash/size mismatch');
    source = Buffer.from(source);
    await prepareOriginal(source, 'image/png', {
      maxPixels: 20_000_000,
      previewEdge: 256,
    });
    signal.throwIfAborted();
    let bytes: Buffer;
    if (request.capability === 'clean-image') {
      const { data, info } = await sharp(source)
        .rotate()
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      // Mock-only background heuristic: not a promise of preserving arbitrary drawings.
      for (let offset = 0; offset < data.length; offset += 4) {
        if (
          data[offset]! > 245 &&
          data[offset + 1]! > 245 &&
          data[offset + 2]! > 245
        )
          data[offset + 3] = 0;
      }
      bytes = await sharp(data, { raw: info })
        .resize(192, 192, {
          fit: 'contain',
          background: '#00000000',
          kernel: request.style === 'pixel' ? 'nearest' : 'lanczos3',
        })
        .extend({
          top: 32,
          bottom: 32,
          left: 32,
          right: 32,
          background: '#00000000',
        })
        .png()
        .toBuffer();
    } else {
      const digest = sha256(canonicalJson(request));
      const rgba = Buffer.alloc(256 * 256 * 4);
      const color = [0, 2, 4].map(
        (offset) => 40 + (parseInt(digest.slice(offset, offset + 2), 16) % 176),
      );
      const wide = request.brief.bodyType === 'quadruped';
      const floating = request.brief.bodyType === 'floating';
      // Deliberately synthetic, fixed-safe-bounds silhouette; never SVG/text execution.
      for (let y = 0; y < 256; y++)
        for (let x = 0; x < 256; x++) {
          const head = (x - 128) ** 2 + (y - 70) ** 2 < 28 ** 2;
          const body =
            x >= (wide ? 58 : 88) &&
            x < (wide ? 198 : 168) &&
            y >= 96 &&
            y < 176;
          const legs =
            !floating &&
            y >= 176 &&
            y < 224 &&
            ((x >= 88 && x < 112) || (x >= 144 && x < 168));
          if (!head && !body && !legs) continue;
          const offset = (y * 256 + x) * 4;
          rgba[offset] = color[0]!;
          rgba[offset + 1] = color[1]!;
          rgba[offset + 2] = color[2]!;
          rgba[offset + 3] = 255;
        }
      bytes = await sharp(rgba, {
        raw: { width: 256, height: 256, channels: 4 },
      })
        .png()
        .toBuffer();
    }
    signal.throwIfAborted();
    const candidate = await validateImageCandidate(
      {
        ...mockProviderIdentity,
        capability: request.capability,
        sourceSha256: request.sourceSha256,
        sha256: sha256(bytes),
        bytes,
        mediaType: 'image/png',
        width: 256,
        height: 256,
      },
      request,
    );
    signal.throwIfAborted();
    return candidate;
  }
}
