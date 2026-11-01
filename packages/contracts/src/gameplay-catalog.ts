import { z } from 'zod';
import { characterManifestSchema } from './manifest.js';
import { characterCreativeChoicesSchema } from './authoring.js';

const supportedChoices = characterCreativeChoicesSchema.extend({
  fightingStyle: z.literal('light_melee'),
});

/** Versioned, trusted gameplay defaults. Creative text never supplies executable values. */
export function lightMeleeCatalogV1(choices: unknown) {
  supportedChoices.parse(choices);
  return characterManifestSchema
    .pick({
      stats: true,
      facing: true,
      anchors: true,
      attacks: true,
      hitboxes: true,
      hurtboxes: true,
      abilities: true,
      effects: true,
    })
    .parse({
      stats: { health: 100, moveSpeed: 180 },
      facing: 'right',
      anchors: {
        feet: { x: 128, y: 224 },
        center: { x: 128, y: 128 },
        hand: { x: 192, y: 128 },
        effect: { x: 128, y: 96 },
      },
      attacks: [
        {
          id: 'light',
          kind: 'melee',
          animation: 'attack_light',
          damage: 10,
          cooldownSeconds: 0.5,
          startupSeconds: 0.1,
          activeSeconds: 0.15,
          recoverySeconds: 0.2,
          knockback: { xSpeed: 180, depthSpeed: 30, durationSeconds: 0.2 },
          hitboxIds: ['light_hit'],
        },
      ],
      hitboxes: [
        {
          id: 'light_hit',
          rect: { x: 0, y: -180, width: 80, height: 80 },
          minElevation: 0,
          maxElevation: 40,
        },
      ],
      hurtboxes: [
        {
          id: 'body',
          rect: { x: -40, y: -160, width: 80, height: 160 },
          minElevation: 0,
          maxElevation: 40,
        },
      ],
      abilities: [
        {
          id: 'basic_melee',
          kind: 'melee',
          attackId: 'light',
          effectIds: [],
          parameters: {},
        },
      ],
      effects: [],
    });
}
