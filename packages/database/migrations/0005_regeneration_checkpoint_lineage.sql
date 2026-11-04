CREATE TABLE `generation_checkpoint_lineage` (
	`id` text PRIMARY KEY NOT NULL,
	`character_id` text NOT NULL,
	`source_job_id` text NOT NULL,
	`source_step_id` text NOT NULL,
	`source_attempt_id` text NOT NULL,
	`child_job_id` text NOT NULL,
	`stage_key` text NOT NULL,
	`stage_version` text NOT NULL,
	`target_key` text NOT NULL,
	`source_version` integer NOT NULL,
	`child_version` integer NOT NULL,
	`source_snapshot_hash` text NOT NULL,
	`child_snapshot_hash` text NOT NULL,
	`source_input_hash` text NOT NULL,
	`source_output_hash` text NOT NULL,
	`artifact_hashes_json` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_job_id`) REFERENCES `generation_jobs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_step_id`) REFERENCES `generation_steps`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_attempt_id`) REFERENCES `generation_attempts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`child_job_id`) REFERENCES `generation_jobs`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT `checkpoint_lineage_versions` CHECK (`source_version` < `child_version`),
	CONSTRAINT `checkpoint_lineage_hashes` CHECK (length(`source_snapshot_hash`)=64 AND `source_snapshot_hash` NOT GLOB '*[^a-f0-9]*' AND length(`child_snapshot_hash`)=64 AND `child_snapshot_hash` NOT GLOB '*[^a-f0-9]*' AND length(`source_input_hash`)=64 AND `source_input_hash` NOT GLOB '*[^a-f0-9]*' AND length(`source_output_hash`)=64 AND `source_output_hash` NOT GLOB '*[^a-f0-9]*'),
	CONSTRAINT `checkpoint_lineage_artifacts_json` CHECK (json_valid(`artifact_hashes_json`) AND json_type(`artifact_hashes_json`)='array')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `checkpoint_lineage_child_target` ON `generation_checkpoint_lineage` (`child_job_id`,`stage_key`,`target_key`);
--> statement-breakpoint
CREATE TRIGGER generation_checkpoint_lineage_update BEFORE UPDATE ON generation_checkpoint_lineage
BEGIN SELECT RAISE(ABORT, 'Checkpoint lineage is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER generation_checkpoint_lineage_delete BEFORE DELETE ON generation_checkpoint_lineage
BEGIN SELECT RAISE(ABORT, 'Checkpoint lineage cannot be deleted'); END;
