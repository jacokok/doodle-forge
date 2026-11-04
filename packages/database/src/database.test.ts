import {
  existsSync,
  mkdtempSync,
  openSync,
  closeSync,
  rmSync,
  unlinkSync,
  mkdirSync,
  copyFileSync,
  writeFileSync,
  readFileSync,
} from 'node:fs';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { canonicalJson, sha256 } from '@doodleforge/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  migrateDatabase,
  openDatabase,
  seedDevelopment,
  assertDatabaseReady,
  CharacterRepository,
  WorkflowRepository,
} from './index.js';

let root: string;
let path: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'doodle-db-'));
  path = join(root, 'test.sqlite');
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function withDatabase(
  run: (connection: ReturnType<typeof openDatabase>) => void,
) {
  migrateDatabase(path);
  const connection = openDatabase(path);
  try {
    run(connection);
  } finally {
    connection.close();
  }
}

describe('SQLite foundation', () => {
  it('migrates empty and existing databases idempotently with FK/WAL/timeout enabled', () => {
    migrateDatabase(path);
    migrateDatabase(path);
    withDatabase((connection) => {
      assertDatabaseReady(connection);
      expect(connection.sqlite.pragma('foreign_keys', { simple: true })).toBe(
        1,
      );
      expect(connection.sqlite.pragma('journal_mode', { simple: true })).toBe(
        'wal',
      );
      expect(connection.sqlite.pragma('busy_timeout', { simple: true })).toBe(
        5000,
      );
      expect(connection.sqlite.pragma('foreign_key_check')).toEqual([]);
    });
    expect(existsSync(`${path}.migrate.lock`)).toBe(false);
  });
  it('adds review/approval persistence to a baseline database without losing authoring history', () => {
    const baseline = join(root, 'baseline');
    mkdirSync(join(baseline, 'meta'), { recursive: true });
    const migrations = fileURLToPath(
      new URL('../migrations/', import.meta.url),
    );
    copyFileSync(
      join(migrations, '0000_zippy_lord_hawal.sql'),
      join(baseline, '0000_zippy_lord_hawal.sql'),
    );
    const journal = JSON.parse(
      readFileSync(join(migrations, 'meta/_journal.json'), 'utf8'),
    ) as { entries: unknown[] };
    journal.entries = journal.entries.slice(0, 1);
    writeFileSync(
      join(baseline, 'meta/_journal.json'),
      JSON.stringify(journal),
    );
    const old = openDatabase(path);
    try {
      migrate(old.db, { migrationsFolder: baseline });
      // Exercise the historical schema, not today's schema-bound seed/repository.
      old.sqlite
        .prepare(
          "INSERT INTO characters(id,name,description,body_type,fighting_style,special_power,created_at,updated_at) VALUES ('legacy-character','Foundation example','','humanoid','unselected','none',0,0)",
        )
        .run();
      old.sqlite
        .prepare(
          "INSERT INTO character_versions(id,character_id,version,source_snapshot_json,created_at,updated_at) VALUES ('legacy',?,1,'{}',0,0)",
        )
        .run('legacy-character');
    } finally {
      old.close();
    }
    migrateDatabase(path);
    migrateDatabase(path);
    const upgraded = openDatabase(path);
    try {
      expect(new CharacterRepository(upgraded).list()[0]?.name).toBe(
        'Foundation example',
      );
      expect(
        upgraded.sqlite
          .prepare(
            'SELECT id,manifest_json,manifest_sha256 FROM character_versions',
          )
          .get(),
      ).toEqual({ id: 'legacy', manifest_json: null, manifest_sha256: null });
      expect(
        upgraded.sqlite
          .prepare('SELECT count(*) AS count FROM approvals')
          .get(),
      ).toEqual({ count: 0 });
      expect(
        new CharacterRepository(upgraded).list()[0]?.originalAssetId,
      ).toBeNull();
      expect(
        upgraded.sqlite.prepare('SELECT count(*) AS count FROM assets').get(),
      ).toEqual({ count: 0 });
      expect(upgraded.sqlite.pragma('foreign_key_check')).toEqual([]);
    } finally {
      upgraded.close();
    }
  });
  it('adds the workflow tables to Phase 5 without changing authoring or publication state', () => {
    const historical = join(root, 'phase5');
    mkdirSync(join(historical, 'meta'), { recursive: true });
    const migrations = fileURLToPath(
      new URL('../migrations/', import.meta.url),
    );
    const journal = JSON.parse(
      readFileSync(join(migrations, 'meta/_journal.json'), 'utf8'),
    ) as {
      entries: { tag: string }[];
    };
    journal.entries = journal.entries.slice(0, 4);
    for (const entry of journal.entries)
      copyFileSync(
        join(migrations, `${entry.tag}.sql`),
        join(historical, `${entry.tag}.sql`),
      );
    writeFileSync(
      join(historical, 'meta/_journal.json'),
      JSON.stringify(journal),
    );
    const previous = openDatabase(path);
    let before: ReturnType<CharacterRepository['list']>;
    try {
      migrate(previous.db, { migrationsFolder: historical });
      seedDevelopment(previous);
      before = new CharacterRepository(previous).list();
    } finally {
      previous.close();
    }
    migrateDatabase(path);
    const upgraded = openDatabase(path);
    try {
      expect(new CharacterRepository(upgraded).list()).toEqual(before);
      for (const table of [
        'generation_jobs',
        'generation_steps',
        'generation_attempts',
        'approvals',
        'content_releases',
      ]) {
        expect(
          upgraded.sqlite
            .prepare(`SELECT count(*) AS count FROM ${table}`)
            .get(),
        ).toEqual({ count: 0 });
      }
      expect(upgraded.sqlite.pragma('foreign_key_check')).toEqual([]);
    } finally {
      upgraded.close();
    }
  });
  it('refuses a concurrent migration without stealing its lock', () => {
    const lock = openSync(`${path}.migrate.lock`, 'wx');
    closeSync(lock);
    expect(() => migrateDatabase(path)).toThrow('Migration lock unavailable');
    expect(existsSync(`${path}.migrate.lock`)).toBe(true);
    unlinkSync(`${path}.migrate.lock`);
    migrateDatabase(path);
  });
  it('refuses boot on an unmigrated database', () => {
    const connection = openDatabase(path);
    try {
      expect(() => assertDatabaseReady(connection)).toThrow();
    } finally {
      connection.close();
    }
  });
  it('persists characters and rejects stale edits across connections', () => {
    withDatabase((first) => {
      const repository = new CharacterRepository(first);
      const created = repository.create({
        name: 'Pencil hero',
        description: 'Synthetic test',
        bodyType: 'pending-contract',
        fightingStyle: 'pending-contract',
        specialPower: 'none',
      });
      const second = openDatabase(path);
      try {
        const other = new CharacterRepository(second);
        expect(other.rename(created.id, 1, 'Ink hero')?.editRevision).toBe(2);
        expect(repository.rename(created.id, 1, 'Stale')).toBeUndefined();
        expect(repository.list()[0]?.name).toBe('Ink hero');
      } finally {
        second.close();
      }
    });
    const reopened = openDatabase(path);
    try {
      expect(new CharacterRepository(reopened).list()[0]?.editRevision).toBe(2);
    } finally {
      reopened.close();
    }
  });
  it('enforces FKs, unique versions, valid JSON and positive versions', () => {
    withDatabase(({ sqlite }) => {
      sqlite
        .prepare(
          "INSERT INTO characters(id,name,body_type,fighting_style,special_power,created_at,updated_at) VALUES ('hero','Hero','test','test','none',0,0)",
        )
        .run();
      const insert = sqlite.prepare(
        'INSERT INTO character_versions(id,character_id,version,source_snapshot_json,created_at,updated_at) VALUES (?,?,?,?,0,0)',
      );
      expect(() => insert.run('bad-fk', 'missing', 1, '{}')).toThrow(
        /FOREIGN KEY/,
      );
      expect(() => insert.run('zero', 'hero', 0, '{}')).toThrow(/CHECK/);
      expect(() => insert.run('json', 'hero', 1, 'broken')).toThrow(/CHECK/);
      insert.run('valid', 'hero', 1, '{}');
      expect(() => insert.run('duplicate', 'hero', 1, '{}')).toThrow(/UNIQUE/);
      expect(() =>
        sqlite.prepare("DELETE FROM characters WHERE id='hero'").run(),
      ).toThrow(/FOREIGN KEY/);
    });
  });
  it('serializes competing writers while WAL permits readers, then recovers', () => {
    withDatabase((first) => {
      const second = openDatabase(path);
      try {
        second.sqlite.pragma('busy_timeout = 20');
        first.sqlite.exec('BEGIN IMMEDIATE');
        expect(new CharacterRepository(second).list()).toEqual([]);
        expect(() => second.sqlite.exec('BEGIN IMMEDIATE')).toThrow(/locked/);
        first.sqlite.exec('ROLLBACK');
        second.sqlite.exec('BEGIN IMMEDIATE; ROLLBACK;');
      } finally {
        if (first.sqlite.inTransaction) first.sqlite.exec('ROLLBACK');
        second.close();
      }
    });
  });
  it('records immutable cross-version checkpoint lineage only for the active owner and selected successful attempt', () => {
    withDatabase((connection) => {
      const character = new CharacterRepository(connection).create({
        name: 'Lineage hero',
        description: '',
        bodyType: 'humanoid',
        fightingStyle: 'light_melee',
        specialPower: 'none',
      });
      const sourceJobId = randomUUID();
      const childJobId = randomUUID();
      const stepId = randomUUID();
      const attemptId = randomUUID();
      const sourceVersionId = randomUUID();
      const source = {
        schemaVersion: 1,
        characterId: character.id,
        version: 1,
        original: { assetId: randomUUID() },
      };
      const child = {
        schemaVersion: 1,
        characterId: character.id,
        version: 2,
        original: source.original,
      };
      const sourceHash = sha256(canonicalJson(source));
      const childHash = sha256(canonicalJson(child));
      const input = {
        schemaVersion: 1,
        characterId: character.id,
        characterVersion: 1,
        sourceSnapshotHash: sourceHash,
        inputs: {},
        parameters: {},
      };
      const outputJson = canonicalJson({
        image: {
          stepId,
          attemptId,
          artifactId: randomUUID(),
          sha256: 'a'.repeat(64),
          bytes: 10,
          mediaType: 'image/png',
          width: 1,
          height: 1,
        },
      });
      const sourceRequest = canonicalJson({
        generation: { protocol: 'mock-factory@1', version: 1, source },
      });
      const childRequest = canonicalJson({
        generation: { protocol: 'mock-factory@1', version: 2, source: child },
      });
      connection.sqlite
        .prepare(
          "INSERT INTO character_versions(id,character_id,version,status,source_snapshot_json,manifest_json,manifest_sha256,created_at,updated_at) VALUES(?,?,1,'review',?,'{}',?,0,0)",
        )
        .run(
          sourceVersionId,
          character.id,
          canonicalJson({
            kind: 'workflow-artifacts',
            schemaVersion: 1,
            sourceSnapshotHash: sourceHash,
          }),
          'c'.repeat(64),
        );
      const insertJob = connection.sqlite.prepare(
        "INSERT INTO generation_jobs(id,character_id,character_version_id,kind,status,request_json,request_hash,idempotency_key,created_at,updated_at) VALUES(?,?,?,'generate',?,?,?, ?,0,0)",
      );
      insertJob.run(
        sourceJobId,
        character.id,
        sourceVersionId,
        'waiting_approval',
        sourceRequest,
        sha256(sourceRequest),
        randomUUID(),
      );
      insertJob.run(
        childJobId,
        character.id,
        null,
        'queued',
        childRequest,
        sha256(childRequest),
        randomUUID(),
      );
      connection.sqlite
        .prepare(
          `INSERT INTO generation_steps(id,job_id,stage_key,stage_version,target_key,dependencies_json,status,input_hash,input_json,output_json,attempt_count,max_attempts,available_at,lease_token)
         VALUES(?,?, 'build-sheet','1','walk','[]','succeeded',?,?,?,1,3,0,1)`,
        )
        .run(
          stepId,
          sourceJobId,
          sha256(
            canonicalJson({
              stageKey: 'build-sheet',
              stageVersion: '1',
              input,
            }),
          ),
          canonicalJson(input),
          outputJson,
        );
      const childStepInsert = connection.sqlite.prepare(
        `INSERT INTO generation_steps(id,job_id,stage_key,stage_version,target_key,dependencies_json,status,input_hash,input_json,max_attempts,available_at)
         VALUES(?,?,?, '1',?,'[]','queued',?,?,3,0)`,
      );
      const childStages = [
        ['build-sheet', 'walk'],
        ['generate-pose', 'idle'],
        ['generate-frames', 'idle'],
        ['normalize-frames', 'idle'],
        ['build-sheet', 'idle'],
        ['generate-metadata', ''],
        ['validate-review', ''],
      ];
      for (const [stageKey, targetKey] of childStages) {
        const envelope = {
          ...input,
          characterVersion: 2,
          sourceSnapshotHash: childHash,
        };
        childStepInsert.run(
          randomUUID(),
          childJobId,
          stageKey,
          targetKey,
          sha256(
            canonicalJson({ stageKey, stageVersion: '1', input: envelope }),
          ),
          canonicalJson(envelope),
        );
      }
      connection.sqlite
        .prepare(
          `INSERT INTO generation_attempts(id,step_id,attempt_no,lease_token,worker_id,started_at,ended_at,outcome)
         VALUES(?,?,1,1,'test',0,1,'succeeded')`,
        )
        .run(attemptId, stepId);
      const repository = new WorkflowRepository(connection);
      const record = {
        id: randomUUID(),
        characterId: character.id,
        sourceJobId,
        sourceStepId: stepId,
        sourceAttemptId: attemptId,
        childJobId,
        stageKey: 'build-sheet',
        stageVersion: '1',
        targetKey: 'walk',
        regenerationTarget: 'idle' as const,
        sourceSnapshotHash: sourceHash,
        childSnapshotHash: childHash,
        sourceOutputHash: sha256(outputJson),
        artifactHashes: ['a'.repeat(64)],
      };
      expect(() =>
        repository.recordCheckpointLineageClaim({
          ...record,
          id: randomUUID(),
          artifactHashes: ['b'.repeat(64)],
        }),
      ).toThrow('Checkpoint lineage identity mismatch');
      expect(() =>
        repository.recordCheckpointLineageClaim({
          ...record,
          id: randomUUID(),
          regenerationTarget: 'walk',
        }),
      ).toThrow('Checkpoint lineage identity mismatch');
      const mismatchedChildRequest = canonicalJson({
        generation: { protocol: 'mock-factory@1', version: 3, source: child },
      });
      connection.sqlite
        .prepare(
          'UPDATE generation_jobs SET request_json=?,request_hash=? WHERE id=?',
        )
        .run(
          mismatchedChildRequest,
          sha256(mismatchedChildRequest),
          childJobId,
        );
      expect(() =>
        repository.recordCheckpointLineageClaim({
          ...record,
          id: randomUUID(),
        }),
      ).toThrow('Checkpoint lineage identity mismatch');
      connection.sqlite
        .prepare(
          'UPDATE generation_jobs SET request_json=?,request_hash=? WHERE id=?',
        )
        .run(childRequest, sha256(childRequest), childJobId);
      const mismatchedSourceRequest = canonicalJson({
        generation: { protocol: 'mock-factory@1', version: 4, source },
      });
      connection.sqlite
        .prepare(
          'UPDATE generation_jobs SET request_json=?,request_hash=? WHERE id=?',
        )
        .run(
          mismatchedSourceRequest,
          sha256(mismatchedSourceRequest),
          sourceJobId,
        );
      expect(() =>
        repository.recordCheckpointLineageClaim({
          ...record,
          id: randomUUID(),
        }),
      ).toThrow('Checkpoint lineage identity mismatch');
      connection.sqlite
        .prepare(
          'UPDATE generation_jobs SET request_json=?,request_hash=? WHERE id=?',
        )
        .run(sourceRequest, sha256(sourceRequest), sourceJobId);
      expect(repository.recordCheckpointLineageClaim(record)).toBe(record.id);
      expect(repository.checkpointLineageClaims(childJobId)).toHaveLength(1);
      expect(() =>
        connection.sqlite
          .prepare(
            'UPDATE generation_checkpoint_lineage_claims SET source_version=2',
          )
          .run(),
      ).toThrow(/immutable/);
      expect(() =>
        connection.sqlite
          .prepare('DELETE FROM generation_checkpoint_lineage_claims')
          .run(),
      ).toThrow(/cannot be deleted/);
      expect(() =>
        repository.recordCheckpointLineageClaim({
          ...record,
          id: randomUUID(),
          sourceOutputHash: 'b'.repeat(64),
        }),
      ).toThrow('Checkpoint lineage identity mismatch');
    });
  });
  it('rolls back failed transactions and seeds metadata without fabricating approved content', () => {
    withDatabase((connection) => {
      expect(() =>
        connection.db.transaction(() => {
          new CharacterRepository(connection).create({
            name: 'Rollback',
            description: '',
            bodyType: 'test',
            fightingStyle: 'test',
            specialPower: 'none',
          });
          throw new Error('abort');
        }),
      ).toThrow('abort');
      const repository = new CharacterRepository(connection);
      expect(repository.list()).toEqual([]);
      const first = seedDevelopment(connection);
      expect(first.inserted).toBe(1);
      expect(seedDevelopment(connection)).toEqual({
        characterId: first.characterId,
        inserted: 0,
      });
      expect(repository.list()).toHaveLength(1);
      expect(
        connection.sqlite
          .prepare('SELECT count(*) AS count FROM character_versions')
          .get(),
      ).toEqual({ count: 0 });
      repository.rename(first.characterId!, 1, 'Edited seed');
      seedDevelopment(connection);
      expect(repository.list()[0]?.name).toBe('Edited seed');
    });
  });
});
