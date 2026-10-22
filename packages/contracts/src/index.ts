import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

const uuid = z.string().uuid();
const boundedText = (max: number) => z.string().trim().max(max);
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
    name: z.string().trim().min(1).max(80),
    description: boundedText(2000),
    bodyType: z.enum(['humanoid', 'quadruped', 'floating', 'other']),
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
      .refine((v) => Object.keys(v).length <= 8),
    attacks: z.array(attack).max(32),
    hitboxes: z.array(box).max(32),
    hurtboxes: z.array(box).max(32),
    abilities: z.array(ability).max(32),
    effects: z.array(effect).max(32),
    assets: z
      .record(z.string(), assetSchema)
      .refine((v) => Object.keys(v).length <= 128),
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
  .superRefine((v, ctx) => {
    const ids = v.characters.map((c) => c.characterId);
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({
        code: 'custom',
        message: 'character IDs must be unique',
        path: ['characters'],
      });
  });
export type ReleaseIndex = z.infer<typeof releaseIndexSchema>;

export function validateManifestSemantics(m: CharacterManifest): string[] {
  const errors: string[] = [];
  const required = ['idle', 'walk', 'attack_light', 'hurt', 'knockout'];
  for (const name of required)
    if (!(name in m.animations))
      errors.push(`animations.${name}: required animation is missing`);
  const allowedAnimations = new Set([
    'idle',
    'walk',
    'attack_light',
    'hurt',
    'knockout',
    'jump',
    'attack_heavy',
    'special',
  ]);
  for (const [name, a] of Object.entries(m.animations)) {
    if (!allowedAnimations.has(name))
      errors.push(`animations.${name}: unsupported animation name`);
    const asset = m.assets[a.assetId];
    if (!asset)
      errors.push(`animations.${name}.assetId: unknown asset '${a.assetId}'`);
    else if (
      asset.width !== a.columns * a.frameWidth ||
      asset.height !== Math.ceil(a.frameCount / a.columns) * a.frameHeight
    )
      errors.push(
        `animations.${name}: sheet dimensions do not match frame layout`,
      );
    const shouldLoop = name === 'idle' || name === 'walk';
    if (a.loop !== shouldLoop)
      errors.push(`animations.${name}.loop: expected ${shouldLoop}`);
    if (a.footAnchor.x !== 128 || a.footAnchor.y !== 224)
      errors.push(`animations.${name}.footAnchor: expected (128,224)`);
  }
  const unique = (values: string[], label: string) => {
    if (new Set(values).size !== values.length)
      errors.push(`${label}: IDs must be unique`);
  };
  unique(
    m.attacks.map((v) => v.id),
    'attacks',
  );
  unique(
    m.hitboxes.map((v) => v.id),
    'hitboxes',
  );
  unique(
    m.hurtboxes.map((v) => v.id),
    'hurtboxes',
  );
  unique(
    m.abilities.map((v) => v.id),
    'abilities',
  );
  unique(
    m.effects.map((v) => v.id),
    'effects',
  );
  const boxes = new Set(m.hitboxes.map((v) => v.id));
  for (const a of m.attacks) {
    if (!m.animations[a.animation])
      errors.push(
        `attacks.${a.id}.animation: unknown animation '${a.animation}'`,
      );
    for (const id of a.hitboxIds)
      if (!boxes.has(id))
        errors.push(`attacks.${a.id}.hitboxIds: unknown hitbox '${id}'`);
  }
  const attackIds = new Set(m.attacks.map((v) => v.id));
  const effectIds = new Set(m.effects.map((v) => v.id));
  for (const a of m.abilities) {
    if (!attackIds.has(a.attackId))
      errors.push(`abilities.${a.id}.attackId: unknown attack '${a.attackId}'`);
    for (const id of a.effectIds)
      if (!effectIds.has(id))
        errors.push(`abilities.${a.id}.effectIds: unknown effect '${id}'`);
  }
  for (const e of m.effects)
    if (!m.assets[e.assetId])
      errors.push(`effects.${e.id}.assetId: unknown asset '${e.assetId}'`);
  for (const b of [...m.hitboxes, ...m.hurtboxes])
    if (b.maxElevation < b.minElevation)
      errors.push(`boxes.${b.id}: maxElevation must be >= minElevation`);
  for (const [id, a] of Object.entries(m.assets))
    if (!isSafeAssetPath(a.path))
      errors.push(`assets.${id}.path: unsafe relative package path`);
  return errors;
}
export function isSafeAssetPath(value: string): boolean {
  return (
    value.length <= 256 &&
    !value.includes('\\') &&
    !value.startsWith('/') &&
    !/^[A-Za-z]:/.test(value) &&
    value
      .split('/')
      .every((part) => part !== '' && part !== '.' && part !== '..') &&
    !value.includes('\0')
  );
}
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, sortKeys(v)]),
    );
  return value;
}
export function sha256(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}
export async function validatePackage(
  manifestPath: string,
): Promise<{ manifest: CharacterManifest; errors: string[] }> {
  const absolute = path.resolve(manifestPath);
  const parsed = characterManifestSchema.safeParse(
    JSON.parse(await readFile(absolute, 'utf8')),
  );
  if (!parsed.success)
    return {
      manifest: undefined as never,
      errors: parsed.error.issues.map(
        (i) => `${i.path.join('.') || '$'}: ${i.message}`,
      ),
    };
  const manifest = parsed.data;
  const errors = validateManifestSemantics(manifest);
  const root = path.dirname(absolute);
  for (const [id, asset] of Object.entries(manifest.assets)) {
    if (!isSafeAssetPath(asset.path)) continue;
    const target = path.resolve(root, asset.path);
    if (!target.startsWith(`${root}${path.sep}`)) {
      errors.push(`assets.${id}.path: escapes package`);
      continue;
    }
    try {
      const bytes = await readFile(target);
      if (bytes.byteLength !== asset.bytes)
        errors.push(
          `assets.${id}.bytes: expected ${asset.bytes}, got ${bytes.byteLength}`,
        );
      if (sha256(bytes) !== asset.sha256)
        errors.push(`assets.${id}.sha256: hash mismatch`);
      const dimensions = pngDimensions(bytes);
      if (!dimensions) errors.push(`assets.${id}: invalid PNG`);
      else if (
        dimensions.width !== asset.width ||
        dimensions.height !== asset.height
      )
        errors.push(`assets.${id}: PNG dimensions mismatch`);
    } catch {
      errors.push(`assets.${id}.path: asset cannot be read`);
    }
  }
  return { manifest, errors };
}
export function pngDimensions(
  bytes: Uint8Array,
): { width: number; height: number } | null {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (
    bytes.length < 24 ||
    signature.some((v, i) => bytes[i] !== v) ||
    String.fromCharCode(...bytes.slice(12, 16)) !== 'IHDR'
  )
    return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}
export const characterManifestJsonSchema = z.toJSONSchema(
  characterManifestSchema,
  { target: 'draft-2020-12' },
);
export const releaseIndexJsonSchema = z.toJSONSchema(releaseIndexSchema, {
  target: 'draft-2020-12',
});
