import { expect, it } from 'vitest';
import {
  buildSheetStage,
  packSheetStage,
  generateMetadataStage,
  manifestStage,
  validationStage,
  validateReviewStage,
} from './index.js';

it('keeps independently persisted workflow protocols under distinct stage identities', () => {
  const stages = [
    packSheetStage('walk'),
    buildSheetStage('walk'),
    manifestStage(),
    generateMetadataStage(),
    validationStage(),
    validateReviewStage(),
  ];
  expect(
    new Set(stages.map(({ key, version }) => `${key}@${version}`)).size,
  ).toBe(stages.length);
  expect(manifestStage().dependencies).toContainEqual({
    stageKey: 'pack-sheet',
    targetKey: 'walk',
  });
  expect(generateMetadataStage().dependencies).toContainEqual({
    stageKey: 'build-sheet',
    targetKey: 'walk',
  });
  expect(validationStage().dependencies).toContainEqual({
    stageKey: 'assemble-manifest',
    targetKey: '',
  });
  expect(validateReviewStage().dependencies).toContainEqual({
    stageKey: 'generate-metadata',
    targetKey: '',
  });
});

it('does not silently reinterpret one persisted sheet input as the other protocol', () => {
  const envelope = {
    schemaVersion: 1,
    characterId: '11111111-1111-4111-8111-111111111111',
    characterVersion: 1,
    sourceSnapshotHash: 'a'.repeat(64),
  };
  const pack = {
    ...envelope,
    inputs: { animation: 'walk', columns: 2 },
    parameters: {
      providerId: 'deterministic-mock',
      providerVersion: '1',
      seed: 17,
      style: 'pixel',
    },
  };
  const build = {
    ...envelope,
    inputs: { animation: 'walk' },
    parameters: { columns: 2 },
  };
  expect(packSheetStage('walk').inputSchema.safeParse(pack).success).toBe(true);
  expect(buildSheetStage('walk').inputSchema.safeParse(build).success).toBe(
    true,
  );
  expect(packSheetStage('walk').inputSchema.safeParse(build).success).toBe(
    false,
  );
  expect(buildSheetStage('walk').inputSchema.safeParse(pack).success).toBe(
    false,
  );
});
