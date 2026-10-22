import { eq } from 'drizzle-orm';
import type { DatabaseConnection } from './index.js';
import { characters } from './schema.js';

const developmentCharacterId = '00000000-0000-4000-8000-000000000001';

// Synthetic authoring metadata only. No original, generation output, version,
// approval or game release is fabricated by the foundation seed.
export function seedDevelopment(connection: DatabaseConnection) {
  return connection.db.transaction(() => {
    const inserted = connection.db
      .insert(characters)
      .values({
        id: developmentCharacterId,
        name: 'Foundation example',
        description:
          'Synthetic development record; no artwork or approved content.',
        bodyType: 'humanoid',
        fightingStyle: 'light_melee',
        specialPower: 'none',
        createdAt: 0,
        updatedAt: 0,
      })
      .onConflictDoNothing({ target: characters.id })
      .run().changes;
    const character = connection.db
      .select()
      .from(characters)
      .where(eq(characters.id, developmentCharacterId))
      .get();
    return { characterId: character?.id, inserted };
  });
}
