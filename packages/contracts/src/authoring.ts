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
export const createCharacterSchema = characterMetadataSchema;
export const updateCharacterSchema = characterMetadataSchema
  .partial()
  .extend({
    expectedRevision: editRevisionSchema,
  })
  .strict()
  .refine(
    ({ name, description, bodyType }) =>
      name !== undefined || description !== undefined || bodyType !== undefined,
    { message: 'At least one metadata field is required' },
  );
export const archiveCharacterSchema = z
  .object({ expectedRevision: editRevisionSchema })
  .strict();
export type CharacterMetadata = z.infer<typeof characterMetadataSchema>;
