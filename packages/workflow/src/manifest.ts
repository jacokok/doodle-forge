import { z } from 'zod';
import {
  assembleManifest,
  characterManifestSchema,
  animationSchema,
} from '@doodleforge/contracts';
import { mockParametersSchema } from '@doodleforge/ai';
import { stageEnvelopeSchema } from './envelope.js';
import { sheetOutputSchema } from './sheet.js';
import type { Stage } from './index.js';

const branches = ['idle', 'walk', 'attack', 'hurt', 'ko'] as const;
const characterSchema = characterManifestSchema.pick({
  name: true,
  description: true,
  bodyType: true,
  artStyle: true,
});
const gameplaySchema = characterManifestSchema.pick({
  stats: true,
  facing: true,
  anchors: true,
  attacks: true,
  hitboxes: true,
  hurtboxes: true,
  abilities: true,
  effects: true,
});
const timingSchema = animationSchema.pick({ fps: true, loop: true });
export const manifestInputSchema = stageEnvelopeSchema.extend({
  inputs: z.strictObject({
    character: characterSchema,
    gameplay: gameplaySchema,
    timing: z.strictObject({
      idle: timingSchema,
      walk: timingSchema,
      attack: timingSchema,
      hurt: timingSchema,
      ko: timingSchema,
    }),
  }),
  parameters: z.strictObject({ style: mockParametersSchema.shape.style }),
});
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const manifestOutputSchema = z.strictObject({
  manifest: characterManifestSchema,
  sha256: hash,
  resolvedInputHash: hash,
  sheets: z
    .array(
      z.strictObject({
        branch: z.enum(branches),
        stepId: z.uuid(),
        attemptId: z.uuid(),
        outputHash: hash,
        artifactId: z.uuid(),
        sha256: hash,
      }),
    )
    .length(5),
});

/** Join selected adopted sheets into bounded checkpoint metadata, not a review snapshot. */
export function manifestStage(): Stage<
  z.infer<typeof manifestInputSchema>,
  z.infer<typeof manifestOutputSchema>
> {
  return {
    key: 'assemble-manifest',
    version: '1',
    inputSchema: manifestInputSchema,
    outputSchema: manifestOutputSchema,
    dependencies: branches.map((targetKey) => ({
      stageKey: 'pack-sheet',
      targetKey,
    })),
    cachePolicy: 'disabled',
    async execute(context, input) {
      if (!context.artifacts || !context.resolvedInputHash)
        throw new Error('Artifact store and resolved identity required');
      if (context.targetKey !== '') throw new Error('Manifest target mismatch');
      if (input.inputs.character.artStyle !== input.parameters.style)
        throw new Error('Manifest style mismatch');
      if (
        input.inputs.gameplay.anchors.feet.x !== 128 ||
        input.inputs.gameplay.anchors.feet.y !== 224
      )
        throw new Error('Manifest foot anchor mismatch');
      const sheets = [];
      const provenance = [];
      for (const branch of branches) {
        const matches =
          context.dependencyOutputs?.filter(
            (d) =>
              d.stageKey === 'pack-sheet' &&
              d.targetKey === branch &&
              d.stageVersion === '1',
          ) ?? [];
        if (matches.length !== 1)
          throw new Error('Required sheet dependency unavailable');
        const parent = matches[0]!;
        const sheet = sheetOutputSchema.parse(JSON.parse(parent.outputJson));
        if (
          sheet.animation !== branch ||
          sheet.style !== input.parameters.style
        )
          throw new Error('Sheet branch or style mismatch');
        if (
          sheet.image.stepId !== parent.stepId ||
          sheet.image.attemptId !== parent.attemptId
        )
          throw new Error('Unselected dependency artifact');
        if (
          sheet.sourceSha256s.length !== sheet.frameCount ||
          sheet.image.width !== sheet.columns * sheet.frameWidth ||
          sheet.image.height !==
            Math.ceil(sheet.frameCount / sheet.columns) * sheet.frameHeight
        )
          throw new Error('Sheet layout mismatch');
        context.signal.throwIfAborted();
        await context.artifacts.read(sheet.image);
        context.signal.throwIfAborted();
        sheets.push({
          branch,
          assetId: branch,
          asset: {
            path: `assets/${sheet.image.sha256}.png`,
            mediaType: sheet.image.mediaType,
            sha256: sheet.image.sha256,
            bytes: sheet.image.bytes,
            width: sheet.image.width,
            height: sheet.image.height,
          },
          animation: {
            frameWidth: sheet.frameWidth,
            frameHeight: sheet.frameHeight,
            frameCount: sheet.frameCount,
            columns: sheet.columns,
            footAnchor: sheet.footAnchor,
            ...input.inputs.timing[branch],
          },
        });
        provenance.push({
          branch,
          stepId: parent.stepId,
          attemptId: parent.attemptId,
          outputHash: parent.outputHash,
          artifactId: sheet.image.artifactId,
          sha256: sheet.image.sha256,
        });
      }
      const result = assembleManifest({
        character: {
          ...input.inputs.character,
          characterId: input.characterId,
          characterVersion: input.characterVersion,
        },
        gameplay: input.inputs.gameplay,
        sheets,
      });
      return {
        manifest: result.manifest,
        sha256: result.sha256,
        resolvedInputHash: context.resolvedInputHash,
        sheets: provenance,
      };
    },
  };
}
