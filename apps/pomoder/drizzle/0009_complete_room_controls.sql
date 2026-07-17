ALTER TABLE "rooms" ADD COLUMN "cycle_focus_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_cycle_focus_count_check" CHECK ("cycle_focus_count" between 0 and 4);
