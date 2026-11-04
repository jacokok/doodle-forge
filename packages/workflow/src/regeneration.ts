import { poseAnimationSchema } from './mock-stages.js';

/**
 * Describe logical invalidation for a targeted mock animation edit. This is
 * deliberately only a graph plan: it does not copy checkpoints or authorize
 * cross-version reuse. Existing checkpoint identities are bound to their
 * original job, version, source snapshot and successful attempt.
 */
export function planMockAnimationRegeneration(value: unknown) {
  const animation = poseAnimationSchema.parse(value);
  return Object.freeze({
    animation,
    invalidate: Object.freeze([
      `pose-${animation}`,
      `frames-${animation}`,
      `normalize-${animation}`,
      `sheet-${animation}`,
      'metadata',
      'review',
    ]),
    preserveUpstream: Object.freeze([
      'capture',
      'analysis',
      'clean',
      'master',
      'body',
    ]),
    preserveOtherAnimationBranches: Object.freeze(
      poseAnimationSchema.options
        .filter((branch) => branch !== animation)
        .map((branch) => branch),
    ),
    checkpointReuseEnabled: false as const,
  });
}
