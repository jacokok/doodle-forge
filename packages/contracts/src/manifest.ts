import { z } from 'zod';
import { characterMetadataSchema } from './authoring.js';

const uuid = z.string().uuid();
const point = z
  .object({
    x: z.number().finite().min(0).max(256),
    y: z.number().finite().min(0).max(256),
  })
  .strict();
const idList = z.array(z.string().min(1).max(64)).max(32);

export const assetSchema = z
  .object({
    path: z.string().min(1).max(256),
    mediaType: z.literal('image/png'),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    bytes: z.number().int().positive().max(16_777_216),
    width: z.number().int().positive().max(4096),
    height: z.number().int().positive().max(4096),
  })
  .strict();
export const animationSchema = z
  .object({
    assetId: z.string().min(1).max(64),
    frameWidth: z.literal(256),
    frameHeight: z.literal(256),
    columns: z.number().int().min(1).max(16),
    frameCount: z.number().int().min(1).max(64),
    fps: z.number().finite().min(1).max(60),
    loop: z.boolean(),
    footAnchor: z.object({ x: z.literal(128), y: z.literal(224) }).strict(),
  })
  .strict();
const box = z
  .object({
    id: z.string().min(1).max(64),
    rect: z
      .object({
        x: z.number().finite(),
        y: z.number().finite(),
        width: z.number().finite().positive().max(1024),
        height: z.number().finite().positive().max(1024),
      })
      .strict(),
    minElevation: z.number().finite().min(0).max(1024),
    maxElevation: z.number().finite().min(0).max(1024),
  })
  .strict();
const attack = z
  .object({
    id: z.string().min(1).max(64),
    kind: z.literal('melee'),
    animation: z.string().min(1),
    damage: z.number().int().min(1).max(10000),
    cooldownSeconds: z.number().finite().min(0).max(60),
    startupSeconds: z.number().finite().min(0).max(60),
    activeSeconds: z.number().finite().positive().max(60),
    recoverySeconds: z.number().finite().min(0).max(60),
    knockback: z
      .object({
        xSpeed: z.number().finite().min(0).max(5000),
        depthSpeed: z.number().finite().min(0).max(5000),
        durationSeconds: z.number().finite().min(0).max(60),
      })
      .strict(),
    hitboxIds: idList,
  })
  .strict();
const ability = z
  .object({
    id: z.string().min(1).max(64),
    kind: z.literal('melee'),
    attackId: z.string().min(1).max(64),
    effectIds: idList,
    parameters: z.record(
      z.string(),
      z.union([z.string().max(128), z.number().finite(), z.boolean()]),
    ),
  })
  .strict();
const effect = z
  .object({
    id: z.string().min(1).max(64),
    assetId: z.string().min(1).max(64),
    anchor: z.enum(['feet', 'center', 'hand', 'effect']),
    durationSeconds: z.number().finite().positive().max(60),
  })
  .strict();
export const characterManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    characterId: uuid,
    characterVersion: z.number().int().positive(),
    ...characterMetadataSchema.shape,
    artStyle: z.enum(['original', 'cartoon', 'pixel']),
    stats: z
      .object({
        health: z.number().int().min(1).max(10000),
        moveSpeed: z.number().finite().min(1).max(1000),
      })
      .strict(),
    facing: z.literal('right'),
    anchors: z
      .object({ feet: point, center: point, hand: point, effect: point })
      .strict(),
    animations: z
      .record(z.string(), animationSchema)
      .refine((value) => Object.keys(value).length <= 8),
    attacks: z.array(attack).max(32),
    hitboxes: z.array(box).max(32),
    hurtboxes: z.array(box).max(32),
    abilities: z.array(ability).max(32),
    effects: z.array(effect).max(32),
    assets: z
      .record(z.string(), assetSchema)
      .refine((value) => Object.keys(value).length <= 128),
  })
  .strict();
export type CharacterManifest = z.infer<typeof characterManifestSchema>;
export const releaseIndexSchema = z
  .object({
    schemaVersion: z.literal(1),
    releaseId: uuid,
    characters: z
      .array(
        z
          .object({
            characterId: uuid,
            characterVersion: z.number().int().positive(),
            manifestPath: z.string().min(1),
            manifestSha256: z.string().regex(/^[a-f0-9]{64}$/),
          })
          .strict(),
      )
      .max(1000),
  })
  .strict()
  .superRefine((value, context) => {
    const ids = value.characters.map((character) => character.characterId);
    if (new Set(ids).size !== ids.length)
      context.addIssue({
        code: 'custom',
        message: 'character IDs must be unique',
        path: ['characters'],
      });
  });
export type ReleaseIndex = z.infer<typeof releaseIndexSchema>;
