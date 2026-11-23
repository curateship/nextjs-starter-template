ALTER TABLE "tasks" ADD COLUMN "priority" varchar(10) DEFAULT 'normal' NOT NULL;
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "estimated_pomodoros" integer;
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_priority_check" CHECK ("priority" in ('low', 'normal', 'high'));
--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_estimated_pomodoros_check" CHECK ("estimated_pomodoros" is null or "estimated_pomodoros" between 1 and 20);
--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_sort_order_check" CHECK ("sort_order" >= 0);
--> statement-breakpoint
UPDATE "tasks" SET "sort_order" = ranked.position FROM (SELECT "id", row_number() OVER (PARTITION BY "user_id", "planned_date" ORDER BY "created_at", "id") AS position FROM "tasks") ranked WHERE "tasks"."id" = ranked."id";
