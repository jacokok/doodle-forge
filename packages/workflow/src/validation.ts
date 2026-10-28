import { z } from 'zod';
import {
  canonicalJson,
  sha256,
  validateManifestSemantics,
} from '@doodleforge/contracts';
import { validateAssetBuffer } from '@doodleforge/content-publisher';
import { stageEnvelopeSchema } from './envelope.js';
import { manifestOutputSchema } from './manifest.js';
import { sheetOutputSchema } from './sheet.js';
import type { Stage } from './index.js';

const branches = ['idle', 'walk', 'attack', 'hurt', 'ko'] as const;
const names = ['idle', 'walk', 'attack_light', 'hurt', 'knockout'] as const;
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const validationInputSchema = stageEnvelopeSchema.extend({
  inputs: z.strictObject({}),
  parameters: z.strictObject({}),
});
export const validationOutputSchema = z.strictObject({
  manifestSha256: hash,
  resolvedInputHash: hash,
});

/** Validate selected package bytes only; this checkpoint grants no review or publication authority. */
export function validationStage(): Stage<
  z.infer<typeof validationInputSchema>,
  z.infer<typeof validationOutputSchema>
> {
  return {
    key: 'validate-assets',
    version: '1',
    inputSchema: validationInputSchema,
    outputSchema: validationOutputSchema,
    dependencies: [
      { stageKey: 'assemble-manifest', targetKey: '' },
      ...branches.map((targetKey) => ({ stageKey: 'pack-sheet', targetKey })),
    ],
    cachePolicy: 'disabled',
    async execute(context, input) {
      if (!context.artifacts || !context.resolvedInputHash)
        throw new Error('Artifact store and resolved identity required');
      if (context.targetKey !== '')
        throw new Error('Validation target mismatch');
      const parents = context.dependencyOutputs ?? [];
      const manifests = parents.filter(
        (d) =>
          d.stageKey === 'assemble-manifest' &&
          d.stageVersion === '1' &&
          d.targetKey === '',
      );
      if (manifests.length !== 1 || parents.length !== 6)
        throw new Error('Manifest dependency unavailable');
      const output = manifestOutputSchema.parse(
        JSON.parse(manifests[0]!.outputJson),
      );
      const manifest = output.manifest;
      if (output.sha256 !== sha256(canonicalJson(manifest)))
        throw new Error('Manifest hash mismatch');
      if (
        manifest.characterId !== input.characterId ||
        manifest.characterVersion !== input.characterVersion ||
        validateManifestSemantics(manifest).length
      )
        throw new Error('Invalid manifest identity or semantics');
      if (
        Object.keys(manifest.assets).length !== 5 ||
        Object.keys(manifest.animations).length !== 5
      )
        throw new Error('Unexpected manifest mappings');
      for (let i = 0; i < branches.length; i++) {
        context.signal.throwIfAborted();
        const branch = branches[i]!;
        const matches = parents.filter(
          (d) =>
            d.stageKey === 'pack-sheet' &&
            d.stageVersion === '1' &&
            d.targetKey === branch,
        );
        const records = output.sheets.filter((s) => s.branch === branch);
        if (matches.length !== 1 || records.length !== 1)
          throw new Error('Sheet dependency mismatch');
        const parent = matches[0]!;
        const sheet = sheetOutputSchema.parse(JSON.parse(parent.outputJson));
        const record = records[0]!;
        if (
          sheet.animation !== branch ||
          sheet.style !== manifest.artStyle ||
          sheet.image.stepId !== parent.stepId ||
          sheet.image.attemptId !== parent.attemptId ||
          record.stepId !== parent.stepId ||
          record.attemptId !== parent.attemptId ||
          record.outputHash !== parent.outputHash ||
          record.artifactId !== sheet.image.artifactId ||
          record.sha256 !== sheet.image.sha256
        )
          throw new Error('Sheet provenance mismatch');
        const asset = manifest.assets[branch];
        const animation = manifest.animations[names[i]!];
        if (
          !asset ||
          !animation ||
          animation.assetId !== branch ||
          asset.path !== `assets/${sheet.image.sha256}.png` ||
          asset.mediaType !== sheet.image.mediaType ||
          asset.sha256 !== sheet.image.sha256 ||
          asset.bytes !== sheet.image.bytes ||
          asset.width !== sheet.image.width ||
          asset.height !== sheet.image.height ||
          animation.frameWidth !== sheet.frameWidth ||
          animation.frameHeight !== sheet.frameHeight ||
          animation.frameCount !== sheet.frameCount ||
          animation.columns !== sheet.columns ||
          canonicalJson(animation.footAnchor) !==
            canonicalJson(sheet.footAnchor) ||
          sheet.sourceSha256s.length !== sheet.frameCount ||
          sheet.image.width !== sheet.columns * sheet.frameWidth ||
          sheet.image.height !==
            Math.ceil(sheet.frameCount / sheet.columns) * sheet.frameHeight
        )
          throw new Error('Sheet metadata mismatch');
        const bytes = await context.artifacts.read(sheet.image);
        context.signal.throwIfAborted();
        await validateAssetBuffer(bytes, asset);
        context.signal.throwIfAborted();
      }
      return {
        manifestSha256: output.sha256,
        resolvedInputHash: context.resolvedInputHash,
      };
    },
  };
}
