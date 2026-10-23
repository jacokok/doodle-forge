import { expect, it } from 'vitest';
import { characterResult } from './character-result.js';
import { CharacterError } from './characters.js';

it('returns serializable successes without inventing data', async () => {
  expect(await characterResult(() => [] as string[])).toEqual({
    ok: true,
    value: [],
  });
  expect(await characterResult(() => null)).toEqual({ ok: true, value: null });
});

it('preserves structured field errors and conflict classifications', async () => {
  const invalid = await characterResult(() => {
    throw new CharacterError(400, 'invalid_input', 'Invalid input.', {
      name: ['Required'],
    });
  });
  expect(invalid).toMatchObject({
    ok: false,
    error: {
      code: 'invalid_input',
      fieldErrors: { name: ['Required'] },
      requestId: expect.any(String),
    },
  });
  expect(JSON.parse(JSON.stringify(invalid))).toEqual(invalid);
  expect(
    await characterResult(() => {
      throw new CharacterError(409, 'stale_revision', 'Reload first.');
    }),
  ).toMatchObject({
    ok: false,
    error: { code: 'stale_revision', message: 'Reload first.' },
  });
});

it('sanitizes unexpected synchronous and asynchronous operational errors', async () => {
  for (const run of [
    () => {
      throw new Error('/private/database secret');
    },
    async () => {
      throw new Error('/private/database secret');
    },
  ]) {
    const result = await characterResult(run);
    expect(result).toMatchObject({
      ok: false,
      error: {
        code: 'studio_unavailable',
        message: 'Studio unavailable; try again later.',
      },
    });
    expect(JSON.stringify(result)).not.toContain('secret');
  }
});
