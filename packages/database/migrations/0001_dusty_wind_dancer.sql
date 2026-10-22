CREATE TABLE `approvals` (
	`id` text PRIMARY KEY NOT NULL,
	`decision_order` integer NOT NULL,
	`character_version_id` text NOT NULL,
	`manifest_sha256` text NOT NULL,
	`decision` text NOT NULL,
	`actor_label` text NOT NULL,
	`note` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`character_version_id`) REFERENCES `character_versions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "approval_order_positive" CHECK("approvals"."decision_order" > 0),
	CONSTRAINT "approval_decision" CHECK("approvals"."decision" IN ('approved','rejected','revoked')),
	CONSTRAINT "approval_actor" CHECK(length(trim("approvals"."actor_label")) BETWEEN 1 AND 120),
	CONSTRAINT "approval_note" CHECK(length("approvals"."note") <= 2000),
	CONSTRAINT "approval_hash" CHECK(length("approvals"."manifest_sha256") = 64 AND "approvals"."manifest_sha256" NOT GLOB '*[^a-f0-9]*')
);
--> statement-breakpoint
ALTER TABLE `character_versions` ADD `manifest_json` text;--> statement-breakpoint
ALTER TABLE `character_versions` ADD `manifest_sha256` text;
--> statement-breakpoint
CREATE UNIQUE INDEX approvals_version_order ON approvals(character_version_id, decision_order);
--> statement-breakpoint
CREATE TRIGGER snapshot_insert_valid BEFORE INSERT ON character_versions
WHEN (NEW.manifest_json IS NULL) != (NEW.manifest_sha256 IS NULL)
 OR (NEW.manifest_json IS NOT NULL AND (
  NOT json_valid(NEW.manifest_json) OR length(NEW.manifest_sha256) != 64
  OR NEW.manifest_sha256 GLOB '*[^a-f0-9]*'))
 OR NEW.status NOT IN ('draft','review')
BEGIN SELECT RAISE(ABORT, 'invalid frozen snapshot'); END;
--> statement-breakpoint
CREATE TRIGGER snapshot_update_valid BEFORE UPDATE ON character_versions
WHEN (NEW.manifest_json IS NULL) != (NEW.manifest_sha256 IS NULL)
 OR (NEW.manifest_json IS NOT NULL AND (
  NOT json_valid(NEW.manifest_json) OR length(NEW.manifest_sha256) != 64
  OR NEW.manifest_sha256 GLOB '*[^a-f0-9]*'))
BEGIN SELECT RAISE(ABORT, 'invalid frozen snapshot'); END;
--> statement-breakpoint
CREATE TRIGGER snapshot_immutable BEFORE UPDATE ON character_versions
WHEN OLD.manifest_json IS NOT NULL AND (
 NEW.id IS NOT OLD.id OR NEW.character_id IS NOT OLD.character_id
 OR NEW.version IS NOT OLD.version OR NEW.source_snapshot_json IS NOT OLD.source_snapshot_json
 OR NEW.manifest_json IS NOT OLD.manifest_json OR NEW.manifest_sha256 IS NOT OLD.manifest_sha256
 OR NEW.created_at IS NOT OLD.created_at)
BEGIN SELECT RAISE(ABORT, 'frozen snapshot is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER snapshot_no_delete BEFORE DELETE ON character_versions
WHEN OLD.manifest_json IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'frozen snapshot is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER approval_matches_snapshot BEFORE INSERT ON approvals
WHEN NOT EXISTS (SELECT 1 FROM character_versions WHERE id = NEW.character_version_id
 AND manifest_json IS NOT NULL AND manifest_sha256 = NEW.manifest_sha256)
BEGIN SELECT RAISE(ABORT, 'approval does not match frozen snapshot'); END;
--> statement-breakpoint
CREATE TRIGGER approval_no_update BEFORE UPDATE ON approvals
BEGIN SELECT RAISE(ABORT, 'approvals are append-only'); END;
--> statement-breakpoint
CREATE TRIGGER approval_no_delete BEFORE DELETE ON approvals
BEGIN SELECT RAISE(ABORT, 'approvals are append-only'); END;
--> statement-breakpoint
CREATE TRIGGER approved_status_guard BEFORE UPDATE OF status ON character_versions
WHEN NEW.status IN ('approved','published') AND COALESCE((
 SELECT decision = 'approved' AND manifest_sha256 = NEW.manifest_sha256
 FROM approvals WHERE character_version_id = NEW.id ORDER BY decision_order DESC LIMIT 1), 0) = 0
BEGIN SELECT RAISE(ABORT, 'matching latest approval required'); END;
--> statement-breakpoint
CREATE TRIGGER published_version_immutable BEFORE UPDATE ON character_versions
WHEN OLD.status = 'published'
BEGIN SELECT RAISE(ABORT, 'published version is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER frozen_ability_insert BEFORE INSERT ON character_abilities
WHEN EXISTS (SELECT 1 FROM character_versions WHERE id = NEW.character_version_id AND manifest_json IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'frozen snapshot children are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER frozen_ability_update BEFORE UPDATE ON character_abilities
WHEN EXISTS (SELECT 1 FROM character_versions WHERE id IN (OLD.character_version_id, NEW.character_version_id) AND manifest_json IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'frozen snapshot children are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER frozen_ability_delete BEFORE DELETE ON character_abilities
WHEN EXISTS (SELECT 1 FROM character_versions WHERE id = OLD.character_version_id AND manifest_json IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'frozen snapshot children are immutable'); END;
