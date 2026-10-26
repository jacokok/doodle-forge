import sharp from 'sharp';
import { canonicalJson, sha256 } from '@doodleforge/contracts';
import {
  ProviderError,
  providerRequestSchema,
  type Provider,
  type ProviderRequest,
  type ProviderResult,
} from './index.js';

/** Offline candidates only. This adapter never reads files, credentials or URLs. */
export class DeterministicMockProvider implements Provider {
  readonly id = 'deterministic-mock';
  readonly version = '1';
  readonly capabilities = ['analyze_description', 'generate_frames'] as const;

  async generate(
    request: ProviderRequest,
    { signal }: { signal: AbortSignal },
  ): Promise<ProviderResult> {
    signal.throwIfAborted();
    if (!request || !this.capabilities.includes(request.capability))
      throw new ProviderError('UNSUPPORTED_CAPABILITY');
    const parsed = providerRequestSchema.safeParse(request);
    if (!parsed.success) throw new ProviderError('INVALID_REQUEST');
    const input = parsed.data;
    const digest = sha256(
      canonicalJson({ provider: this.id, version: this.version, input }),
    );
    const provenance = {
      providerId: this.id,
      modelVersion: this.version,
      requestId: `mock-${digest}`,
      seed: input.seed,
      costUsd: 0,
      warnings: [
        'Synthetic mock output; not an assessment of artwork fidelity or safety.',
      ],
    };
    if (input.capability === 'analyze_description') {
      const palette = [0, 6, 12].map(
        (offset) => `#${digest.slice(offset, offset + 6)}`,
      );
      return {
        capability: input.capability,
        brief: {
          summary: input.description.replace(/\s+/g, ' '),
          bodyType: input.bodyType,
          fightingStyle: input.fightingStyle,
          specialPower: input.specialPower,
          style: input.style,
          palette,
        },
        provenance,
      };
    }
    const frames = [];
    const color = input.brief.palette[0]!;
    const rgb = [1, 3, 5].map(
      (offset) =>
        24 +
        ((parseInt(color.slice(offset, offset + 2), 16) +
          parseInt(digest.slice(offset - 1, offset + 1), 16)) %
          200),
    );
    // Fixed alpha silhouette with repeatable limb motion. No uploaded input is modified.
    const baseShift = (parseInt(digest.slice(0, 2), 16) % 5) - 2;
    for (let frame = 0; frame < input.frameCount; frame++) {
      signal.throwIfAborted();
      const pixels = Buffer.alloc(256 * 256 * 4);
      const rectangle = (
        x: number,
        y: number,
        w: number,
        h: number,
        shade = 1,
      ) => {
        for (let row = y; row < y + h; row++)
          for (let column = x; column < x + w; column++) {
            const oriented = input.facing === 'right' ? column : 255 - column;
            const index = (row * 256 + oriented) * 4;
            for (let channel = 0; channel < 3; channel++)
              pixels[index + channel] = Math.max(
                24,
                Math.round(rgb[channel]! * shade),
              );
            pixels[index + 3] = 255;
          }
      };
      const sway = baseShift + (frame % 3) - 1;
      const drop =
        input.animation === 'ko' ? 55 : input.animation === 'hurt' ? 8 : 0;
      rectangle(98 + sway, 50 + drop, 60, 52);
      rectangle(90 + sway, 102 + drop, 76, 82, 0.8);
      rectangle(90 + sway - (frame % 4), 184, 25, 40, 0.65);
      rectangle(141 + sway + (frame % 4), 184, 25, 40, 0.65);
      const reach =
        input.animation === 'attack' ? 20 + frame * 3 : (frame % 2) * 5;
      rectangle(166 + sway, 113, 20 + reach, 20);
      rectangle(140 + sway, 64, 7, 8, 0.15);
      // Every ordered frame is distinguishable, including idle/KO.
      rectangle(103 + sway + frame * 2, 88, 4, 4, 0.2);
      const bytes = await sharp(pixels, {
        raw: { width: 256, height: 256, channels: 4 },
      })
        .png({ compressionLevel: 9, adaptiveFiltering: false, palette: false })
        .toBuffer();
      signal.throwIfAborted();
      frames.push({
        bytes,
        sha256: sha256(bytes),
        mediaType: 'image/png' as const,
        width: 256 as const,
        height: 256 as const,
      });
    }
    return { capability: input.capability, frames, provenance };
  }
}
