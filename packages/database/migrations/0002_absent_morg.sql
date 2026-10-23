CREATE TABLE `content_release_entries` (
	`release_id` text NOT NULL,
	`character_id` text NOT NULL,
	`character_version_id` text NOT NULL,
	`manifest_path` text NOT NULL,
	`manifest_sha256` text NOT NULL,
	PRIMARY KEY(`release_id`, `character_id`),
	FOREIGN KEY (`release_id`) REFERENCES `content_releases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`character_version_id`) REFERENCES `character_versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `content_releases` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`index_key` text NOT NULL,
	`index_sha256` text NOT NULL,
	`index_json` text NOT NULL,
	`previous_release_id` text,
	`expected_generation` integer NOT NULL,
	`published_at` integer,
	CONSTRAINT "release_status" CHECK("content_releases"."status" IN ('preparing','ready','failed')),
	CONSTRAINT "release_json" CHECK(json_valid("content_releases"."index_json"))
);
--> statement-breakpoint
CREATE TABLE `content_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`active_release_id` text,
	`generation` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`active_release_id`) REFERENCES `content_releases`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "state_singleton" CHECK("content_state"."id" = 1),
	CONSTRAINT "generation_positive" CHECK("content_state"."generation" >= 0)
);
--> statement-breakpoint
INSERT INTO content_state(id, generation) VALUES (1, 0);
--> statement-breakpoint
CREATE TRIGGER ready_release_no_update BEFORE UPDATE ON content_releases
WHEN OLD.status IN ('ready','failed')
BEGIN SELECT RAISE(ABORT, 'terminal release is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER ready_release_no_delete BEFORE DELETE ON content_releases
BEGIN SELECT RAISE(ABORT, 'release audit is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER release_entry_insert BEFORE INSERT ON content_release_entries
WHEN (SELECT status FROM content_releases WHERE id=NEW.release_id) != 'preparing'
BEGIN SELECT RAISE(ABORT, 'release entries are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER release_entry_update BEFORE UPDATE ON content_release_entries
BEGIN SELECT RAISE(ABORT, 'release entries are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER release_entry_delete BEFORE DELETE ON content_release_entries
BEGIN SELECT RAISE(ABORT, 'release entries are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER active_release_ready BEFORE UPDATE ON content_state
WHEN NEW.active_release_id IS NULL OR COALESCE((SELECT status FROM content_releases WHERE id=NEW.active_release_id), '') != 'ready' OR NEW.generation != OLD.generation + 1
BEGIN SELECT RAISE(ABORT, 'ready release and generation increment required'); END;
--> statement-breakpoint
CREATE TRIGGER state_no_delete BEFORE DELETE ON content_state
BEGIN SELECT RAISE(ABORT, 'content state is required'); END;
