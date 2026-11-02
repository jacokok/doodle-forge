import { z } from 'zod';
import {
  canonicalJson,
  sha256,
  lightMeleeCatalogV1,
} from '@doodleforge/contracts';
import {
  characterIdSchema,
  characterMetadataSchema,
  characterCreativeChoicesSchema,
  editRevisionSchema,
} from '@doodleforge/contracts/authoring';
import { mockParametersSchema } from '@doodleforge/ai';
import type { WorkflowRepository } from '@doodleforge/database';
import { poseAnimationSchema } from './mock-stages.js';
import { prepareWorkflowJob } from './index.js';

export const mockGenerationBranches = poseAnimationSchema.options;
export const mockGenerationCommandSchema = z.strictObject({
  characterId: characterIdSchema,
  expectedRevision: editRevisionSchema,
  idempotencyKey: z.string().trim().min(1).max(160),
  style: mockParametersSchema.shape.style,
  seed: mockParametersSchema.shape.seed,
});

/** Explicit offline request. Capture, reservation and all 27 graph rows commit together; no image work here. */
export function enqueueMockGeneration(
  repository: WorkflowRepository,
  value: unknown,
) {
  const command = mockGenerationCommandSchema.parse(value);
  const commandJson = canonicalJson(command);
  return repository.enqueueGeneration(
    { ...command, commandJson },
    ({ character, original, version }) => {
      const metadata = characterMetadataSchema.parse({
        name: character.name,
        description: character.description,
        bodyType: character.bodyType,
      });
      const choices = characterCreativeChoicesSchema.parse({
        fightingStyle: character.fightingStyle,
        specialPower: character.specialPower,
      });
      lightMeleeCatalogV1(choices); // Fail closed before allocating a job for unsupported intent.
      const parameters = mockParametersSchema.parse({
        providerId: 'deterministic-mock',
        providerVersion: '1',
        seed: command.seed,
        style: command.style,
      });
      const source = {
        schemaVersion: 1,
        characterId: character.id,
        editRevision: character.editRevision,
        ...metadata,
        ...choices,
        artStyle: command.style,
        seed: command.seed,
        original: { assetId: original.id, sha256: original.sha256 },
      };
      const envelope = {
        schemaVersion: 1,
        characterId: character.id,
        characterVersion: version,
        sourceSnapshotHash: sha256(canonicalJson(source)),
        inputs: {},
        parameters,
      };
      const step = (
        key: string,
        stageKey: string,
        dependencies: string[],
        inputs: Record<string, unknown> = {},
        targetKey = '',
        settings: Record<string, unknown> = parameters,
      ) => ({
        key,
        stageKey,
        stageVersion: '1',
        targetKey,
        dependencies,
        input: { ...envelope, inputs, parameters: settings },
      });
      const steps = [
        step(
          'capture',
          'capture-artwork',
          [],
          { original: source.original },
          '',
          {},
        ),
        step('analysis', 'analyze-captured-description', ['capture'], {
          description: metadata.description,
          bodyType: metadata.bodyType,
          ...choices,
        }),
        step('clean', 'clean-image', ['capture']),
        step('master', 'character-master', ['clean', 'analysis']),
        step('body', 'determine-body-type', ['master', 'analysis']),
      ];
      for (const branch of mockGenerationBranches) {
        steps.push(
          step(
            `pose-${branch}`,
            'generate-pose',
            ['master', 'analysis', 'body'],
            { animation: branch },
            branch,
          ),
          step(
            `frames-${branch}`,
            'generate-frames',
            ['master', 'analysis', 'body', `pose-${branch}`],
            { animation: branch, frameCount: 3 },
            branch,
          ),
          step(
            `normalize-${branch}`,
            'normalize-frames',
            [`frames-${branch}`],
            { animation: branch },
            branch,
          ),
          step(
            `sheet-${branch}`,
            'build-sheet',
            [`normalize-${branch}`],
            { animation: branch },
            branch,
            { columns: 2 },
          ),
        );
      }
      steps.push(
        step(
          'metadata',
          'generate-metadata',
          [
            'analysis',
            ...mockGenerationBranches.map((branch) => `sheet-${branch}`),
          ],
          { name: metadata.name },
          '',
          { catalog: 'light-melee@1' },
        ),
        step(
          'review',
          'validate-review',
          [
            'metadata',
            ...mockGenerationBranches.map((branch) => `sheet-${branch}`),
          ],
          {},
          '',
          {},
        ),
      );
      return prepareWorkflowJob({
        schemaVersion: 1,
        characterId: character.id,
        characterVersionId: null,
        kind: 'generate',
        idempotencyKey: command.idempotencyKey,
        generation: {
          protocol: 'mock-factory@1',
          commandJson,
          version,
          source,
        },
        steps,
      });
    },
  );
}
