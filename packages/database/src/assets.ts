import { and, eq } from 'drizzle-orm';
import type { DatabaseConnection } from './index.js';
import { assets, characters } from './schema.js';
import { CharacterRepository } from './repositories.js';

export type NewAsset = typeof assets.$inferInsert;
export class AssetRepository {
  constructor(private readonly connection: DatabaseConnection) {}

  get(id: string) {
    return this.connection.db
      .select()
      .from(assets)
      .where(eq(assets.id, id))
      .get();
  }

  preview(sourceId: string) {
    return this.connection.db
      .select()
      .from(assets)
      .where(
        and(eq(assets.sourceAssetId, sourceId), eq(assets.kind, 'preview')),
      )
      .get();
  }

  attach(
    characterId: string,
    expectedRevision: number,
    original: NewAsset,
    preview: NewAsset,
  ) {
    return this.connection.sqlite
      .transaction(() => {
        const repository = new CharacterRepository(this.connection);
        const current = repository.get(characterId);
        if (!current || current.editRevision !== expectedRevision)
          return undefined;
        this.connection.db.insert(assets).values([original, preview]).run();
        return this.connection.db
          .update(characters)
          .set({
            originalAssetId: original.id,
            editRevision: expectedRevision + 1,
            updatedAt: Date.now(),
          })
          .where(eq(characters.id, characterId))
          .returning()
          .get();
      })
      .immediate();
  }
}
