CREATE TABLE `generation_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`step_id` text NOT NULL,
	`attempt_no` integer NOT NULL,
	`lease_token` integer NOT NULL,
	`worker_id` text NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`outcome` text NOT NULL,
	`error_json` text,
	`provider_request_id` text,
	FOREIGN KEY (`step_id`) REFERENCES `generation_steps`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "attempt_outcome" CHECK("generation_attempts"."outcome" IN ('running','succeeded','failed','expired','cancelled')),
	CONSTRAINT "attempt_bounds" CHECK("generation_attempts"."attempt_no" > 0 AND "generation_attempts"."lease_token" > 0),
	CONSTRAINT "attempt_end" CHECK(("generation_attempts"."outcome" = 'running' AND "generation_attempts"."ended_at" IS NULL) OR ("generation_attempts"."outcome" != 'running' AND "generation_attempts"."ended_at" IS NOT NULL)),
	CONSTRAINT "attempt_error_json" CHECK("generation_attempts"."error_json" IS NULL OR json_valid("generation_attempts"."error_json"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `generation_attempt_number` ON `generation_attempts` (`step_id`,`attempt_no`);--> statement-breakpoint
CREATE UNIQUE INDEX `generation_attempt_fence` ON `generation_attempts` (`step_id`,`lease_token`);--> statement-breakpoint
CREATE TABLE `generation_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`character_id` text NOT NULL,
	`character_version_id` text,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`request_json` text NOT NULL,
	`request_hash` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`cancel_requested_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`character_version_id`) REFERENCES `character_versions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "job_kind" CHECK("generation_jobs"."kind" IN ('generate','publish')),
	CONSTRAINT "job_status" CHECK("generation_jobs"."status" IN ('queued','running','waiting_approval','waiting_publish','succeeded','failed','cancelled')),
	CONSTRAINT "job_request_json" CHECK(json_valid("generation_jobs"."request_json")),
	CONSTRAINT "job_request_hash" CHECK(length("generation_jobs"."request_hash") = 64 AND "generation_jobs"."request_hash" NOT GLOB '*[^a-f0-9]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `generation_jobs_idempotency_key_unique` ON `generation_jobs` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `generation_jobs_status` ON `generation_jobs` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `generation_steps` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`stage_key` text NOT NULL,
	`stage_version` text NOT NULL,
	`target_key` text NOT NULL,
	`dependencies_json` text NOT NULL,
	`status` text NOT NULL,
	`input_hash` text NOT NULL,
	`input_json` text NOT NULL,
	`output_json` text,
	`error_json` text,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer NOT NULL,
	`available_at` integer NOT NULL,
	`lease_owner` text,
	`lease_token` integer DEFAULT 0 NOT NULL,
	`lease_expires_at` integer,
	FOREIGN KEY (`job_id`) REFERENCES `generation_jobs`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "step_status" CHECK("generation_steps"."status" IN ('queued','running','succeeded','failed','cancelled','blocked')),
	CONSTRAINT "step_json" CHECK(json_valid("generation_steps"."input_json") AND json_valid("generation_steps"."dependencies_json") AND json_type("generation_steps"."dependencies_json") = 'array' AND ("generation_steps"."output_json" IS NULL OR json_valid("generation_steps"."output_json")) AND ("generation_steps"."error_json" IS NULL OR json_valid("generation_steps"."error_json"))),
	CONSTRAINT "step_input_hash" CHECK(length("generation_steps"."input_hash") = 64 AND "generation_steps"."input_hash" NOT GLOB '*[^a-f0-9]*'),
	CONSTRAINT "step_attempt_bounds" CHECK("generation_steps"."attempt_count" >= 0 AND "generation_steps"."max_attempts" BETWEEN 1 AND 10 AND "generation_steps"."attempt_count" <= "generation_steps"."max_attempts" AND "generation_steps"."lease_token" >= 0),
	CONSTRAINT "step_lease" CHECK(("generation_steps"."status" = 'running' AND "generation_steps"."lease_owner" IS NOT NULL AND "generation_steps"."lease_expires_at" IS NOT NULL) OR ("generation_steps"."status" != 'running' AND "generation_steps"."lease_owner" IS NULL AND "generation_steps"."lease_expires_at" IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `generation_step_target` ON `generation_steps` (`job_id`,`stage_key`,`target_key`);--> statement-breakpoint
CREATE INDEX `generation_steps_due` ON `generation_steps` (`status`,`available_at`,`lease_expires_at`);
--> statement-breakpoint
CREATE TRIGGER generation_attempt_history_update BEFORE UPDATE ON generation_attempts
WHEN OLD.outcome != 'running'
BEGIN SELECT RAISE(ABORT, 'Terminal attempt history is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER generation_attempt_history_delete BEFORE DELETE ON generation_attempts
BEGIN SELECT RAISE(ABORT, 'Attempt history cannot be deleted'); END;
--> statement-breakpoint
CREATE TRIGGER generation_checkpoint_update BEFORE UPDATE ON generation_steps
WHEN OLD.status = 'succeeded'
BEGIN SELECT RAISE(ABORT, 'Adopted checkpoint is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER generation_checkpoint_delete BEFORE DELETE ON generation_steps
WHEN OLD.status = 'succeeded'
BEGIN SELECT RAISE(ABORT, 'Adopted checkpoint cannot be deleted'); END;