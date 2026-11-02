// Test-only real generated review; never run by normal startup.
import { loadConfig } from '@doodleforge/shared/server';
import { openDatabase } from '@doodleforge/database';
import { mockReviewFixture } from './mock-review-fixture.js';
const config = loadConfig();
const connection = openDatabase(config.databasePath);
try {
  console.log(
    JSON.stringify(await mockReviewFixture(connection, config.storageRoot)),
  );
} finally {
  connection.close();
}
