import { describe, expect, it } from 'vitest';
import { generatedDecisionSupported } from './review-capability.js';

describe('generated review decision capability', () => {
  it('requires the literal server capability, failing closed for absent or malformed values', () => {
    for (const value of [undefined, null, false, 'true', 1, {}, []]) {
      expect(generatedDecisionSupported(value)).toBe(false);
    }
    expect(generatedDecisionSupported(true)).toBe(true);
  });
});
