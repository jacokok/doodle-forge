import {
  archiveCharacterSchema,
  characterIdSchema,
  createCharacterSchema,
  updateCharacterSchema,
} from '@doodleforge/contracts/authoring';
import { CharacterRepository } from '@doodleforge/database';
import { z } from 'zod';

export class CharacterError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
  }
}

function validate<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join('.') || '_form';
      (fieldErrors[key] ??= []).push(issue.message);
    }
    throw new CharacterError(
      400,
      'invalid_input',
      'Invalid character input.',
      fieldErrors,
    );
  }
  return result.data;
}

export class CharacterService {
  constructor(private readonly repository: CharacterRepository) {}

  list() {
    return this.repository.list();
  }

  get(id: unknown) {
    const character = this.repository.get(validate(characterIdSchema, id));
    if (!character)
      throw new CharacterError(404, 'not_found', 'Character not found.');
    return character;
  }

  create(input: unknown) {
    const metadata = validate(createCharacterSchema, input);
    // Creative choices and executable abilities arrive in separate increments.
    return this.repository.create({
      ...metadata,
      fightingStyle: 'unselected',
      specialPower: 'none',
    });
  }

  update(id: unknown, input: unknown) {
    const characterId = validate(characterIdSchema, id);
    const { expectedRevision, ...changes } = validate(
      updateCharacterSchema,
      input,
    );
    const updated = this.repository.update(characterId, expectedRevision, {
      ...(changes.name !== undefined ? { name: changes.name } : {}),
      ...(changes.description !== undefined
        ? { description: changes.description }
        : {}),
      ...(changes.bodyType !== undefined ? { bodyType: changes.bodyType } : {}),
    });
    if (updated) return updated;
    this.get(characterId);
    throw new CharacterError(
      409,
      'stale_revision',
      'Character changed; reload before editing.',
    );
  }

  archive(id: unknown, input: unknown) {
    const characterId = validate(characterIdSchema, id);
    const { expectedRevision } = validate(archiveCharacterSchema, input);
    if (this.repository.archive(characterId, expectedRevision)) return;
    this.get(characterId);
    throw new CharacterError(
      409,
      'stale_revision',
      'Character changed; reload before archiving.',
    );
  }
}
