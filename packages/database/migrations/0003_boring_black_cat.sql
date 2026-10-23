CREATE TABLE `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`character_id` text NOT NULL,
	`kind` text NOT NULL,
	`storage_key` text NOT NULL,
	`media_type` text NOT NULL,
	`sha256` text NOT NULL,
	`bytes` integer NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`source_asset_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "asset_kind" CHECK("assets"."kind" IN ('original','preview')),
	CONSTRAINT "asset_dimensions" CHECK("assets"."width" > 0 AND "assets"."height" > 0 AND "assets"."width" * "assets"."height" <= 20000000),
	CONSTRAINT "asset_size" CHECK("assets"."bytes" > 0 AND "assets"."bytes" <= 10485760),
	CONSTRAINT "asset_hash" CHECK(length("assets"."sha256") = 64 AND "assets"."sha256" NOT GLOB '*[^a-f0-9]*'),
	CONSTRAINT "asset_media_type" CHECK("assets"."media_type" IN ('image/jpeg','image/png','image/webp')),
	CONSTRAINT "asset_source" CHECK(("assets"."kind" = 'original' AND "assets"."source_asset_id" IS NULL) OR ("assets"."kind" = 'preview' AND "assets"."source_asset_id" IS NOT NULL AND "assets"."media_type" = 'image/png'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assets_storage_key_unique` ON `assets` (`storage_key`);--> statement-breakpoint
ALTER TABLE `characters` ADD `original_asset_id` text REFERENCES assets(id);
--> statement-breakpoint
CREATE TRIGGER assets_no_update BEFORE UPDATE ON assets BEGIN SELECT RAISE(ABORT, 'assets are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER assets_no_delete BEFORE DELETE ON assets BEGIN SELECT RAISE(ABORT, 'assets are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER assets_preview_owner BEFORE INSERT ON assets WHEN NEW.kind = 'preview' AND NOT EXISTS (SELECT 1 FROM assets WHERE id = NEW.source_asset_id AND kind = 'original' AND character_id = NEW.character_id) BEGIN SELECT RAISE(ABORT, 'invalid preview source'); END;
--> statement-breakpoint
CREATE TRIGGER characters_original_owner BEFORE UPDATE OF original_asset_id ON characters WHEN NEW.original_asset_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM assets WHERE id = NEW.original_asset_id AND kind = 'original' AND character_id = NEW.id) BEGIN SELECT RAISE(ABORT, 'invalid original attachment'); END;