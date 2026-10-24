import { expect, it } from 'vitest';
import {
  characterCreativeChoicesSchema,
  createCharacterSchema,
  updateCharacterSchema,
  fightingStyleChoices,
  specialPowerChoices,
} from './authoring.js';

it('defines only supported authoring choices and backward-compatible defaults', () => {
  const metadata = { name: 'Hero', description: '', bodyType: 'other' };
  expect(createCharacterSchema.parse(metadata)).toEqual({
    ...metadata,
    fightingStyle: 'unselected',
    specialPower: 'none',
  });
  for (const style of fightingStyleChoices)
    for (const power of specialPowerChoices) {
      const choices = { fightingStyle: style.value, specialPower: power.value };
      expect(characterCreativeChoicesSchema.parse(choices)).toEqual(choices);
      expect(
        updateCharacterSchema.parse({ expectedRevision: 1, ...choices }),
      ).toEqual({ expectedRevision: 1, ...choices });
    }
  expect(
    updateCharacterSchema.parse({ expectedRevision: 1, name: 'Edit' }),
  ).not.toHaveProperty('fightingStyle');
});

it.each([
  { fightingStyle: 'heavy_melee' },
  { fightingStyle: 'projectile' },
  { fightingStyle: 'unknown' },
  { fightingStyle: ' light_melee ' },
  { fightingStyle: null },
  { fightingStyle: 1 },
  { specialPower: 'fireball' },
  { specialPower: 'healing' },
  { specialPower: 'unknown' },
  { specialPower: {} },
  { specialPower: ['none'] },
  { specialPower: null },
  { fightingStyle: 'light_melee', parameters: { damage: 999 } },
  { abilities: [] },
  {},
])(
  'rejects unsupported, unknown, noncanonical or executable configuration: %j',
  (choices) => {
    expect(
      updateCharacterSchema.safeParse({ expectedRevision: 1, ...choices })
        .success,
    ).toBe(false);
  },
);
