import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  characterManifestSchema,
  releaseIndexSchema,
  validateManifestSemantics,
} from './index.js';

type Vector = {
  name: string;
  fixture?: string;
  valid: boolean;
  kind?: 'release-index';
  changes: { path: (string | number)[]; value?: unknown; remove?: boolean }[];
  repeat?: { collection: string; count: number };
  assetChange?: { field: string; value: unknown };
};
const root = new URL('../fixtures/', import.meta.url);
const vectors: Vector[] = [
  ...JSON.parse(readFileSync(new URL('compatibility-v1.json', root), 'utf8')),
  ...JSON.parse(
    readFileSync(new URL('compatibility-release-v1.json', root), 'utf8'),
  ).map((v: Vector) => ({ ...v, kind: 'release-index' })),
];
describe('shared Godot/TypeScript supported-v1 vectors', () => {
  it.each(vectors)('$name', (vector) => {
    // Mutation harness handles untrusted JSON intentionally, not public DTOs.
    const data: Record<string, unknown> =
      vector.kind === 'release-index'
        ? {
            schemaVersion: 1,
            releaseId: '11111111-1111-4111-8111-111111111111',
            characters: [
              {
                characterId: '11111111-1111-4111-8111-111111111111',
                characterVersion: 1,
                manifestPath:
                  'characters/11111111-1111-4111-8111-111111111111/v1/character.json',
                manifestSha256: 'a'.repeat(64),
              },
            ],
          }
        : JSON.parse(
            readFileSync(
              new URL(`${vector.fixture ?? 'sprout'}/v1/character.json`, root),
              'utf8',
            ),
          );
    for (const change of vector.changes) {
      let target: unknown = data;
      for (const key of change.path.slice(0, -1))
        target = (target as Record<string | number, unknown>)[key];
      const key = change.path.at(-1)!;
      if (change.remove)
        delete (target as Record<string | number, unknown>)[key];
      else (target as Record<string | number, unknown>)[key] = change.value;
    }
    if (vector.assetChange) {
      const assets = data.assets as Record<string, Record<string, unknown>>;
      Object.values(assets)[0]![vector.assetChange.field] =
        vector.assetChange.value;
    }
    if (vector.repeat) {
      const { collection, count } = vector.repeat;
      const source = data[collection];
      data[collection] = Array.isArray(source)
        ? Array.from({ length: count }, () => source[0])
        : Object.fromEntries(
            Array.from({ length: count }, (_, i) => [
              `asset-${i}`,
              Object.values(source as object)[0],
            ]),
          );
    }
    if (vector.kind === 'release-index') {
      const parsed = releaseIndexSchema.safeParse(data);
      // Consumer/publication layout rule, deliberately stricter than structural schema.
      expect(
        parsed.success &&
          parsed.data.characters.every(
            (entry) =>
              entry.manifestPath ===
              `characters/${entry.characterId}/v${entry.characterVersion}/character.json`,
          ),
      ).toBe(vector.valid);
    } else {
      const parsed = characterManifestSchema.safeParse(data);
      expect(
        parsed.success && validateManifestSemantics(parsed.data).length === 0,
      ).toBe(vector.valid);
    }
  });
});
