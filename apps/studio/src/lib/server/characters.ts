import { createHash } from 'node:crypto';
import {
  archiveCharacterSchema,
  characterIdSchema,
  createCharacterSchema,
  updateCharacterSchema,
} from '@doodleforge/contracts/authoring';
import { CharacterRepository, SnapshotRepository } from '@doodleforge/database';
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
  constructor(
    private readonly repository: CharacterRepository,
    private readonly snapshots?: SnapshotRepository,
  ) {}

  list() {
    return this.repository.list();
  }

  get(id: unknown) {
    const character = this.repository.get(validate(characterIdSchema, id));
    if (!character)
      throw new CharacterError(404, 'not_found', 'Character not found.');
    return character;
  }

  history(id: unknown) {
    const characterId = validate(characterIdSchema, id);
    this.get(characterId); // Archived and missing identities expose no history.
    if (!this.snapshots)
      throw new CharacterError(
        503,
        'unavailable',
        'Version history unavailable.',
      );
    return this.snapshots
      .history(characterId)
      .map(({ version, decisions, publications }) => {
        let snapshot: unknown = null;
        try {
          snapshot =
            version.manifestJson &&
            version.manifestSha256 &&
            createHash('sha256').update(version.manifestJson).digest('hex') ===
              version.manifestSha256
              ? JSON.parse(version.manifestJson)
              : null;
        } catch {
          // Preserve the version identity while making corrupt frozen content explicit.
        }
        return {
          id: version.id,
          version: version.version,
          status: version.status,
          createdAt: version.createdAt,
          manifestSha256: version.manifestSha256,
          snapshot,
          snapshotAvailable: snapshot !== null,
          decisions: decisions.map(
            ({
              decision,
              decisionOrder,
              actorLabel,
              note,
              manifestSha256,
              createdAt,
            }) => ({
              decision,
              decisionOrder,
              actorLabel,
              note,
              manifestSha256,
              createdAt,
            }),
          ),
          publications,
        };
      });
  }

  create(input: unknown) {
    return this.repository.create(validate(createCharacterSchema, input));
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
      ...(changes.fightingStyle !== undefined
        ? { fightingStyle: changes.fightingStyle }
        : {}),
      ...(changes.specialPower !== undefined
        ? { specialPower: changes.specialPower }
        : {}),
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
