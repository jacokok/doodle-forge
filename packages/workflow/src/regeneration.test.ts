import { describe, expect, it } from 'vitest';
import {
  mockGenerationBranches,
  planMockAnimationRegeneration,
} from './index.js';

describe('mock animation regeneration plan', () => {
  it.each(mockGenerationBranches)(
    'invalidates only %s and its aggregate descendants',
    (animation) => {
      const plan = planMockAnimationRegeneration(animation);

      expect(plan.invalidate).toEqual([
        `pose-${animation}`,
        `frames-${animation}`,
        `normalize-${animation}`,
        `sheet-${animation}`,
        'metadata',
        'review',
      ]);
      expect(plan.preserveUpstream).toEqual([
        'capture',
        'analysis',
        'clean',
        'master',
        'body',
      ]);
      expect(plan.preserveOtherAnimationBranches).toEqual(
        mockGenerationBranches.filter((branch) => branch !== animation),
      );
      expect(plan.checkpointReuseEnabled).toBe(false);
    },
  );

  it('rejects unknown branches instead of producing a partial invalidation plan', () => {
    expect(() => planMockAnimationRegeneration('not-an-animation')).toThrow();
  });
});
