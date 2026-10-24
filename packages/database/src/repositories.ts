import { randomUUID } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import type { DatabaseConnection } from './index.js';
import { characters } from './schema.js';

export class CharacterRepository {
  constructor(private readonly connection: DatabaseConnection) {}

  list() {
    return this.connection.db
      .select()
      .from(characters)
      .where(isNull(characters.archivedAt))
      .orderBy(characters.createdAt, characters.id)
      .all();
  }

  create(
    input: Pick<
      typeof characters.$inferInsert,
      'name' | 'description' | 'bodyType' | 'fightingStyle' | 'specialPower'
    >,
  ) {
    const now = Date.now();
    return this.connection.db
      .insert(characters)
      .values({ ...input, id: randomUUID(), createdAt: now, updatedAt: now })
      .returning()
      .get();
  }

  get(id: string) {
    return this.connection.db
      .select()
      .from(characters)
      .where(and(eq(characters.id, id), isNull(characters.archivedAt)))
      .get();
  }

  update(
    id: string,
    expectedRevision: number,
    changes: Partial<
      Pick<
        typeof characters.$inferInsert,
        'name' | 'description' | 'bodyType' | 'fightingStyle' | 'specialPower'
      >
    >,
  ) {
    return this.connection.db
      .update(characters)
      .set({
        ...changes,
        editRevision: expectedRevision + 1,
        updatedAt: Date.now(),
      })
      .where(
        and(
          eq(characters.id, id),
          eq(characters.editRevision, expectedRevision),
          isNull(characters.archivedAt),
        ),
      )
      .returning()
      .get();
  }

  archive(id: string, expectedRevision: number) {
    const now = Date.now();
    return this.connection.db
      .update(characters)
      .set({
        archivedAt: now,
        editRevision: expectedRevision + 1,
        updatedAt: now,
      })
      .where(
        and(
          eq(characters.id, id),
          eq(characters.editRevision, expectedRevision),
          isNull(characters.archivedAt),
        ),
      )
      .returning()
      .get();
  }

  rename(id: string, expectedRevision: number, name: string) {
    return this.connection.db
      .update(characters)
      .set({ name, editRevision: expectedRevision + 1, updatedAt: Date.now() })
      .where(
        and(
          eq(characters.id, id),
          eq(characters.editRevision, expectedRevision),
          isNull(characters.archivedAt),
        ),
      )
      .returning()
      .get();
  }
}
