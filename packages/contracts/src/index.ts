import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import {
  characterManifestSchema,
  releaseIndexSchema,
  type CharacterManifest,
} from './manifest.js';

export {
  assetSchema,
  animationSchema,
  characterManifestSchema,
  releaseIndexSchema,
  type CharacterManifest,
  type ReleaseIndex,
} from './manifest.js';

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
