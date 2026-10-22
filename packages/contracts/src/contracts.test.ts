import { describe, expect, it } from 'vitest';
import { readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  canonicalJson,
  characterManifestSchema,
  isSafeAssetPath,
  releaseIndexSchema,
  sha256,
  validateManifestSemantics,
  validatePackage,
} from './index.js';

const root = path.resolve(import.meta.dirname, '../fixtures');

describe('character contract v1', () => {
  it.each(['sprout', 'comet'])(
    'validates complete %s package and real PNG hashes',
    async (name) => {
      const result = await validatePackage(
        path.join(root, name, 'v1', 'character.json'),
      );
      expect(result.errors).toEqual([]);
      expect(result.manifest.animations).toHaveProperty('knockout');
    },
  );
  it('rejects a corrupted asset hash and dimensions on disk', async () => {
    const source = path.join(root, 'sprout/v1/character.json');
    const temporary = await mkdtemp(
      path.join(tmpdir(), 'doodleforge-contract-'),
    );
    try {
      const manifest = JSON.parse(await readFile(source, 'utf8'));
      await mkdir(path.join(temporary, 'assets'));
      const asset = Object.values(manifest.assets)[0] as {
        path: string;
        sha256: string;
      };
      const original = await readFile(
        path.resolve(path.dirname(source), asset.path),
      );
      const corrupt = Buffer.from(original);
      corrupt[30] = corrupt[30]! ^ 1;
      await writeFile(path.join(temporary, asset.path), corrupt);
      await writeFile(
        path.join(temporary, 'character.json'),
        JSON.stringify(manifest),
      );
      const result = await validatePackage(
        path.join(temporary, 'character.json'),
      );
      expect(
        result.errors.some((error) => error.includes('hash mismatch')),
      ).toBe(true);
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });
  it('rejects unsupported schema versions and unknown fields', () => {
    const result = characterManifestSchema.safeParse({
      schemaVersion: 2,
      unexpected: true,
    });
    expect(result.success).toBe(false);
  });
  it('rejects traversal, absolute and backslash paths', () => {
    for (const value of [
      '../secret.png',
      '/tmp/a.png',
      'assets\\a.png',
      'C:/a.png',
    ])
      expect(isSafeAssetPath(value)).toBe(false);
  });
  it('reports missing required animations and bad references', async () => {
    const valid = JSON.parse(
      await readFile(path.join(root, 'sprout/v1/character.json'), 'utf8'),
    );
    delete valid.animations.walk;
    valid.animations.idle.columns = 2;
    valid.attacks[0].hitboxIds = ['missing'];
    const parsed = characterManifestSchema.parse(valid);
    const errors = validateManifestSemantics(parsed);
    expect(errors).toContain('animations.walk: required animation is missing');
    expect(errors.some((e) => e.includes("unknown hitbox 'missing'"))).toBe(
      true,
    );
    expect(
      errors.some((e) => e.includes('sheet dimensions do not match')),
    ).toBe(true);
    expect(
      characterManifestSchema.safeParse({
        ...valid,
        abilities: [{ id: 'x', kind: 'fireball' }],
      }).success,
    ).toBe(false);
  });
  it('checks release uniqueness and unsupported versions', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const entry = {
      characterId: id,
      characterVersion: 1,
      manifestPath: 'characters/x/v1/character.json',
      manifestSha256: 'a'.repeat(64),
    };
    expect(
      releaseIndexSchema.safeParse({
        schemaVersion: 1,
        releaseId: id,
        characters: [entry, entry],
      }).success,
    ).toBe(false);
    expect(
      releaseIndexSchema.safeParse({
        schemaVersion: 2,
        releaseId: id,
        characters: [],
      }).success,
    ).toBe(false);
  });
  it('canonicalizes object keys and hashes exact UTF-8 bytes', () => {
    expect(canonicalJson({ z: 1, a: { y: 2, x: 3 } })).toBe(
      '{"a":{"x":3,"y":2},"z":1}',
    );
    expect(sha256('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});
