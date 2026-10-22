CREATE TABLE `abilities` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`schema_version` integer NOT NULL,
	`configuration_schema_json` text NOT NULL,
	`defaults_json` text NOT NULL,
	CONSTRAINT "ability_schema_positive" CHECK("abilities"."schema_version" > 0),
	CONSTRAINT "ability_schema_json" CHECK(json_valid("abilities"."configuration_schema_json")),
	CONSTRAINT "ability_defaults_json" CHECK(json_valid("abilities"."defaults_json"))
);
--> statement-breakpoint
CREATE TABLE `character_abilities` (
	`character_version_id` text NOT NULL,
	`ability_id` text NOT NULL,
	`configuration_json` text NOT NULL,
	PRIMARY KEY(`character_version_id`, `ability_id`),
	FOREIGN KEY (`character_version_id`) REFERENCES `character_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`ability_id`) REFERENCES `abilities`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "character_ability_json" CHECK(json_valid("character_abilities"."configuration_json"))
);
--> statement-breakpoint
CREATE TABLE `character_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`character_id` text NOT NULL,
	`version` integer NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`source_snapshot_json` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "version_positive" CHECK("character_versions"."version" > 0),
	CONSTRAINT "version_status" CHECK("character_versions"."status" IN ('draft','review','approved','published','superseded')),
	CONSTRAINT "snapshot_json_valid" CHECK(json_valid("character_versions"."source_snapshot_json"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `character_version_unique` ON `character_versions` (`character_id`,`version`);--> statement-breakpoint
CREATE TABLE `characters` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`body_type` text NOT NULL,
	`fighting_style` text NOT NULL,
	`special_power` text NOT NULL,
	`edit_revision` integer DEFAULT 1 NOT NULL,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "character_revision_positive" CHECK("characters"."edit_revision" > 0),
	CONSTRAINT "character_name_length" CHECK(length(trim("characters"."name")) BETWEEN 1 AND 80)
);
