import { z } from 'zod';
import {
  canonicalJson,
  characterManifestSchema,
  lightMeleeCatalogV1,
  sha256,
  validateManifestSemantics,
  type CharacterManifest,
} from '@doodleforge/contracts';
import { characterMetadataSchema } from '@doodleforge/contracts/authoring';
import { artifactSchema } from './artifacts.js';
import { stageEnvelopeSchema } from './envelope.js';
import { analysisOutputSchema, poseAnimationSchema } from './mock-stages.js';
import { buildSheetOutputSchema } from './build-sheet.js';
import type { Stage } from './index.js';

// Provider branch names are not the public manifest animation names.
export const generatedAnimationNames = {
  idle: 'idle',
  walk: 'walk',
  attack: 'attack_light',
  hurt: 'hurt',
  ko: 'knockout',
} as const;
const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const metadataInputSchema = stageEnvelopeSchema.extend({
  inputs: characterMetadataSchema.pick({ name: true }),
  parameters: z.strictObject({ catalog: z.literal('light-melee@1') }),
});
export const metadataOutputSchema = z
  .strictObject({
    manifest: characterManifestSchema,
    manifestSha256: hashSchema,
    sheets: z.record(poseAnimationSchema, artifactSchema),
    catalog: z.literal('light-melee@1'),
    resolvedInputHash: hashSchema,
  })
  .superRefine((output, context) => {
    const errors = validateManifestSemantics(output.manifest);
    if (sha256(canonicalJson(output.manifest)) !== output.manifestSha256)
      errors.push('Manifest hash mismatch');
    for (const [branch, name] of Object.entries(generatedAnimationNames)) {
      const source =
        output.sheets[branch as keyof typeof generatedAnimationNames];
      const animation = output.manifest.animations[name];
      const asset = animation && output.manifest.assets[animation.assetId];
      if (
        !asset ||
        asset.sha256 !== source.sha256 ||
        asset.bytes !== source.bytes ||
        asset.width !== source.width ||
        asset.height !== source.height ||
        asset.path !== `assets/${source.sha256}.png`
      )
        errors.push(`Sheet binding mismatch: ${branch}`);
    }
    for (const message of errors) context.addIssue({ code: 'custom', message });
  });

/** Assemble a private JSON checkpoint, not a frozen review snapshot or a release. */
export function generateMetadataStage(): Stage<
  z.infer<typeof metadataInputSchema>,
  z.infer<typeof metadataOutputSchema>
> {
  return {
    key: 'generate-metadata',
    version: '1',
    inputSchema: metadataInputSchema,
    outputSchema: metadataOutputSchema,
    dependencies: [
      { stageKey: 'analyze-captured-description', targetKey: '' },
      ...poseAnimationSchema.options.map((targetKey) => ({
        stageKey: 'build-sheet',
        targetKey,
      })),
    ],
    cachePolicy: 'disabled',
    async execute(context, input) {
      if (!context.artifacts) throw new Error('Artifact store required');
      if (!context.resolvedInputHash)
        throw new Error('Resolved input identity required');
      if (context.targetKey !== '') throw new Error('Metadata target mismatch');
      const analysis = context.dependencyOutputs?.find(
        (item) =>
          item.stageKey === 'analyze-captured-description' &&
          item.stageVersion === '1' &&
          item.targetKey === '',
      );
      if (!analysis)
        throw new Error('Required analysis dependency unavailable');
      const { brief, provenance } = analysisOutputSchema.parse(
        JSON.parse(analysis.outputJson),
      );
      const gameplay = lightMeleeCatalogV1({
        fightingStyle: brief.fightingStyle,
        specialPower: brief.specialPower,
      });
      const animations: CharacterManifest['animations'] = {};
      const assets: CharacterManifest['assets'] = {};
      const sheets: Partial<z.infer<typeof metadataOutputSchema>['sheets']> =
        {};
      for (const branch of poseAnimationSchema.options) {
        const parent = context.dependencyOutputs?.find(
          (item) =>
            item.stageKey === 'build-sheet' &&
            item.stageVersion === '1' &&
            item.targetKey === branch,
        );
        if (!parent) throw new Error('Required sheet dependency unavailable');
        const sheet = buildSheetOutputSchema.parse(
          JSON.parse(parent.outputJson),
        );
        if (sheet.animation !== branch || sheet.style !== provenance.style)
          throw new Error('Sheet branch/style mismatch');
        if (
          sheet.image.stepId !== parent.stepId ||
          sheet.image.attemptId !== parent.attemptId
        )
          throw new Error('Unselected dependency artifact');
        context.signal.throwIfAborted();
        await context.artifacts.read(sheet.image);
        const name = generatedAnimationNames[branch];
        const assetId = `${name}_sheet`;
        sheets[branch] = sheet.image;
        assets[assetId] = {
          path: `assets/${sheet.image.sha256}.png`,
          mediaType: sheet.image.mediaType,
          sha256: sheet.image.sha256,
          bytes: sheet.image.bytes,
          width: sheet.image.width,
          height: sheet.image.height,
        };
        animations[name] = {
          assetId,
          frameWidth: sheet.frameWidth,
          frameHeight: sheet.frameHeight,
          columns: sheet.columns,
          frameCount: sheet.frameCount,
          fps: name === 'idle' ? 8 : 10,
          loop: branch === 'idle' || branch === 'walk',
          footAnchor: sheet.footAnchor,
        };
      }
      context.signal.throwIfAborted();
      const manifest = characterManifestSchema.parse({
        schemaVersion: 1,
        characterId: input.characterId,
        characterVersion: input.characterVersion,
        name: input.inputs.name,
        description: brief.description,
        bodyType: brief.bodyType,
        artStyle: provenance.style,
        ...gameplay,
        animations,
        assets,
      });
      const errors = validateManifestSemantics(manifest);
      if (errors.length) throw new Error(errors.join('\n'));
      return metadataOutputSchema.parse({
        manifest,
        manifestSha256: sha256(canonicalJson(manifest)),
        sheets,
        catalog: input.parameters.catalog,
        resolvedInputHash: context.resolvedInputHash,
      });
    },
  };
}
