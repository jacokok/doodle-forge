import { z } from 'zod';

// Browser-safe authoring boundary. Content manifests reuse these metadata fields.
export const characterMetadataSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().max(2000),
    bodyType: z.enum(['humanoid', 'quadruped', 'floating', 'other']),
  })
  .strict();
export const characterIdSchema = z.string().uuid();
export const editRevisionSchema = z
  .number()
  .int()
  .positive()
  .max(Number.MAX_SAFE_INTEGER - 1);
// Authoring intent only: these choices never configure executable abilities.
export const fightingStyleSchema = z.enum(['unselected', 'light_melee']);
export const specialPowerSchema = z.enum(['none']);
export const fightingStyleChoices = [
  { value: 'unselected', label: 'Not selected' },
  { value: 'light_melee', label: 'Light melee' },
] as const satisfies readonly {
  value: z.infer<typeof fightingStyleSchema>;
  label: string;
}[];
export const specialPowerChoices = [
  { value: 'none', label: 'None' },
] as const satisfies readonly {
  value: z.infer<typeof specialPowerSchema>;
  label: string;
}[];
export const characterCreativeChoicesSchema = z
  .object({
    fightingStyle: fightingStyleSchema,
    specialPower: specialPowerSchema,
  })
  .strict();
const authoringSchema = characterMetadataSchema.extend(
  characterCreativeChoicesSchema.shape,
);
export const createCharacterSchema = characterMetadataSchema.extend({
  fightingStyle: fightingStyleSchema.default('unselected'),
  specialPower: specialPowerSchema.default('none'),
});
export const updateCharacterSchema = authoringSchema
  .partial()
  .extend({
    expectedRevision: editRevisionSchema,
  })
  .strict()
  .refine(
    (changes) =>
      Object.entries(changes).some(
        ([key, value]) => key !== 'expectedRevision' && value !== undefined,
      ),
    { message: 'At least one authoring field is required' },
  );
export const archiveCharacterSchema = z
  .object({ expectedRevision: editRevisionSchema })
  .strict();
export type CharacterMetadata = z.infer<typeof characterMetadataSchema>;

export const originalUploadPolicy = {
  maxBytes: 10 * 1024 * 1024,
  maxPixels: 20_000_000,
  maxRequestBytes: 10 * 1024 * 1024 + 64 * 1024,
  previewEdge: 1024,
  mediaTypes: ['image/jpeg', 'image/png', 'image/webp'],
} as const;
export const attachOriginalSchema = archiveCharacterSchema;
export const privateImageKindSchema = z.enum(['original', 'preview']);
export const assetIdSchema = characterIdSchema;

export const frozenVersionMutationSchema = z
  .object({
    characterId: characterIdSchema,
    versionId: characterIdSchema,
    expectedManifestSha256: z.string().regex(/^[a-f0-9]{64}$/),
    expectedDecisionOrder: z
      .number()
      .int()
      .min(0)
      .max(Number.MAX_SAFE_INTEGER - 1),
  })
  .strict();
export const reviewDecisionSchema = frozenVersionMutationSchema.extend({
  decision: z.enum(['approved', 'rejected', 'revoked']),
});
