import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { canonicalJson, sha256 } from '@doodleforge/contracts';
import {
  analysisRequestSchema,
  DeterministicMockProvider,
  ProviderError,
  type ProviderRequest,
} from './index.js';

const analysis = analysisRequestSchema.parse({
  capability: 'analyze_description',
  description: ' A friendly   pencil hero ',
  bodyType: 'quadruped',
  fightingStyle: 'light_melee',
  specialPower: 'none',
  style: 'pixel',
  seed: 42,
});
const context = () => ({ signal: new AbortController().signal });
const provider = new DeterministicMockProvider();
async function framesRequest() {
  const result = await provider.generate(analysis, context());
  if (result.capability !== 'analyze_description')
    throw new Error('Unexpected capability');
  return {
    capability: 'generate_frames' as const,
    brief: result.brief,
    masterSha256: 'a'.repeat(64),
    animation: 'walk' as const,
    facing: 'right' as const,
    frameCount: 4,
    width: 256 as const,
    height: 256 as const,
    seed: 42,
  };
}
describe('offline deterministic mock provider', () => {
  it('produces a validated reproducible brief and preserves explicit creative choices', async () => {
    const input = canonicalJson(analysis);
    const a = await provider.generate(analysis, context()),
      b = await provider.generate(analysis, context());
    expect(a).toEqual(b);
    expect(canonicalJson(analysis)).toBe(input);
    expect(a.capability).toBe('analyze_description');
    if (a.capability !== 'analyze_description') throw new Error('Wrong result');
    expect(a.brief).toMatchObject({
      summary: 'A friendly pencil hero',
      bodyType: 'quadruped',
      style: 'pixel',
      fightingStyle: 'light_melee',
      specialPower: 'none',
    });
    expect(a.provenance).toMatchObject({
      providerId: 'deterministic-mock',
      modelVersion: '1',
      seed: 42,
      costUsd: 0,
    });
    expect(a.provenance.warnings).not.toHaveLength(0);
  });
  it('changes deterministic design output for a different seed', async () => {
    const a = await provider.generate(analysis, context());
    const b = await provider.generate({ ...analysis, seed: 43 }, context());
    expect(a).not.toEqual(b);
  });
  it('renders real nonempty transparent, distinct 256x256 RGBA PNG frames with exact hashes', async () => {
    const request = await framesRequest();
    const a = await provider.generate(request, context()),
      b = await provider.generate(request, context());
    expect(a.capability).toBe('generate_frames');
    if (
      a.capability !== 'generate_frames' ||
      b.capability !== 'generate_frames'
    )
      throw new Error('Wrong result');
    expect(a.frames).toHaveLength(4);
    expect(new Set(a.frames.map((frame) => frame.sha256)).size).toBe(4);
    expect(a.frames.map((frame) => frame.sha256)).toEqual(
      b.frames.map((frame) => frame.sha256),
    );
    for (const frame of a.frames) {
      expect(sha256(frame.bytes)).toBe(frame.sha256);
      const decoded = await sharp(frame.bytes)
        .raw()
        .toBuffer({ resolveWithObject: true });
      expect(decoded.info).toMatchObject({
        width: 256,
        height: 256,
        channels: 4,
      });
      const alpha = decoded.data.filter((_, index) => index % 4 === 3);
      expect(alpha.some((value) => value === 0)).toBe(true);
      expect(alpha.some((value) => value === 255)).toBe(true);
      expect(frame.bytes.byteLength).toBeLessThan(256 * 256 * 4);
    }
  });
  it('renders both facings and all five animation requests as distinct candidates', async () => {
    const request = await framesRequest();
    const hashes = [];
    for (const animation of ['idle', 'walk', 'attack', 'hurt', 'ko'] as const) {
      const result = await provider.generate(
        { ...request, animation, frameCount: 1 },
        context(),
      );
      if (result.capability !== 'generate_frames')
        throw new Error('Wrong result');
      hashes.push(result.frames[0]!.sha256);
    }
    expect(new Set(hashes).size).toBe(5);
    const left = await provider.generate(
      { ...request, facing: 'left' },
      context(),
    );
    const right = await provider.generate(request, context());
    if (
      left.capability !== 'generate_frames' ||
      right.capability !== 'generate_frames'
    )
      throw new Error('Wrong result');
    expect(left.frames[0]!.sha256).not.toBe(right.frames[0]!.sha256);
  });
  it('validates capabilities, supported choices, frame bounds and unknown fields without fallback', async () => {
    for (const request of [
      { ...analysis, capability: 'cleanup' },
      { ...analysis, specialPower: 'fireball' },
      { ...analysis, url: 'https://private.invalid' },
      { ...analysis, seed: -1 },
      { ...(await framesRequest()), frameCount: 9 },
      { ...(await framesRequest()), width: 4096 },
    ])
      await expect(
        provider.generate(request as ProviderRequest, context()),
      ).rejects.toBeInstanceOf(ProviderError);
  });
  it('aborts before work and during asynchronous candidate rendering', async () => {
    const aborted = new AbortController();
    aborted.abort();
    await expect(
      provider.generate(analysis, { signal: aborted.signal }),
    ).rejects.toThrow();
    const controller = new AbortController();
    const output = provider.generate(await framesRequest(), {
      signal: controller.signal,
    });
    controller.abort();
    await expect(output).rejects.toThrow();
  });
});
