import { expect, it } from 'vitest';
import { lightMeleeCatalogV1 } from './index.js';

it('supplies deterministic fresh gameplay defaults from supported creative choices only', () => {
  const choices = { fightingStyle: 'light_melee', specialPower: 'none' };
  const first = lightMeleeCatalogV1(choices);
  expect(first.stats).toEqual({ health: 100, moveSpeed: 180 });
  expect(first.attacks[0]).toMatchObject({
    animation: 'attack_light',
    damage: 10,
    hitboxIds: ['light_hit'],
  });
  expect(lightMeleeCatalogV1(choices)).toEqual(first);
  first.stats.health = 999;
  first.attacks[0]!.damage = 999;
  expect(lightMeleeCatalogV1(choices).stats.health).toBe(100);
  expect(lightMeleeCatalogV1(choices).attacks[0]!.damage).toBe(10);
});

it('rejects unselected or unsupported intent and arbitrary gameplay overrides', () => {
  for (const choices of [
    { fightingStyle: 'unselected', specialPower: 'none' },
    { fightingStyle: 'light_melee', specialPower: 'fire' },
    { fightingStyle: 'light_melee', specialPower: 'none', damage: 999 },
  ])
    expect(() => lightMeleeCatalogV1(choices)).toThrow();
});
