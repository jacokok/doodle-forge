import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  assembleManifest,
  canonicalJson,
  sha256,
  type ManifestAssemblyInput,
  type CharacterManifest,
} from './index.js';

function input(): ManifestAssemblyInput {
  const m = JSON.parse(
    readFileSync(
      new URL('../fixtures/sprout/v1/character.json', import.meta.url),
      'utf8',
    ),
  ) as CharacterManifest;
  const {
    characterId,
    characterVersion,
    name,
    description,
    bodyType,
    artStyle,
    stats,
    facing,
    anchors,
    attacks,
    hitboxes,
    hurtboxes,
    abilities,
    effects,
  } = m;
  const branches = [
    ['idle', 'idle'],
    ['walk', 'walk'],
    ['attack', 'attack_light'],
    ['hurt', 'hurt'],
    ['ko', 'knockout'],
  ] as const;
  return {
    character: {
      characterId,
      characterVersion,
      name,
      description,
      bodyType,
      artStyle,
    },
    gameplay: {
      stats,
      facing,
      anchors,
      attacks,
      hitboxes,
      hurtboxes,
      abilities,
      effects,
    },
    sheets: branches.map(([branch, key]) => {
      const { assetId, ...animation } = m.animations[key]!;
      return { branch, assetId, asset: m.assets[assetId]!, animation };
    }),
  };
}

describe('manifest assembler', () => {
  it('maps branches and produces publisher canonical bytes independent of sheet order', () => {
    const a = input();
    const result = assembleManifest(a);
    expect(
      assembleManifest({ ...a, sheets: [...a.sheets].reverse() }).bytes,
    ).toEqual(result.bytes);
    expect(Buffer.from(result.bytes).toString()).toBe(
      canonicalJson(result.manifest),
    );
    expect(result.sha256).toBe(sha256(result.bytes));
    expect(result.manifest.animations.attack_light?.assetId).toBe(
      a.sheets[2]!.assetId,
    );
    expect(result.manifest.animations.knockout?.assetId).toBe(
      a.sheets[4]!.assetId,
    );
  });
  it('rejects missing, duplicate and invalid branches or asset IDs', () => {
    const a = input();
    expect(() =>
      assembleManifest({ ...a, sheets: a.sheets.slice(1) }),
    ).toThrow();
    expect(() =>
      assembleManifest({
        ...a,
        sheets: [a.sheets[0]!, ...a.sheets.slice(0, 4)],
      }),
    ).toThrow(/duplicate branch/);
    const dup = structuredClone(a);
    dup.sheets[1]!.assetId = dup.sheets[0]!.assetId;
    expect(() => assembleManifest(dup)).toThrow(/duplicate asset ID/);
    const invalid = structuredClone(a);
    (invalid.sheets[0] as { branch: string }).branch = 'jump';
    expect(() => assembleManifest(invalid)).toThrow();
  });
  it('rejects schema and semantic violations without inventing settings', () => {
    const a = input();
    a.sheets[0]!.animation.fps = 0;
    expect(() => assembleManifest(a)).toThrow();
    const b = input();
    b.sheets[0]!.asset.width = 512;
    expect(() => assembleManifest(b)).toThrow(/sheet dimensions/);
    const c = input();
    c.gameplay.attacks[0]!.hitboxIds = ['missing'];
    expect(() => assembleManifest(c)).toThrow(/unknown hitbox/);
    const d = input();
    d.sheets[0]!.animation.loop = false;
    expect(() => assembleManifest(d)).toThrow(/loop/);
  });
});
