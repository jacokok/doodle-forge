DROP TRIGGER generation_checkpoint_lineage_update;
--> statement-breakpoint
DROP TRIGGER generation_checkpoint_lineage_delete;
--> statement-breakpoint
DROP INDEX checkpoint_lineage_child_target;
--> statement-breakpoint
ALTER TABLE generation_checkpoint_lineage RENAME TO generation_checkpoint_lineage_claims;
--> statement-breakpoint
ALTER TABLE generation_checkpoint_lineage_claims ADD COLUMN regeneration_target TEXT NOT NULL DEFAULT 'unclassified' CHECK (regeneration_target IN ('idle','walk','attack','hurt','ko','unclassified'));
--> statement-breakpoint
CREATE UNIQUE INDEX checkpoint_lineage_claim_child_target ON generation_checkpoint_lineage_claims (child_job_id,stage_key,target_key);
--> statement-breakpoint
CREATE TRIGGER generation_checkpoint_lineage_claim_update BEFORE UPDATE ON generation_checkpoint_lineage_claims
BEGIN SELECT RAISE(ABORT, 'Checkpoint lineage claim is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER generation_checkpoint_lineage_claim_delete BEFORE DELETE ON generation_checkpoint_lineage_claims
BEGIN SELECT RAISE(ABORT, 'Checkpoint lineage claim cannot be deleted'); END;
