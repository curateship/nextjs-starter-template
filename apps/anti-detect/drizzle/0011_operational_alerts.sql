-- Generalize the notifications table so it can also hold operational alerts
-- (session/proxy failures), not just feedback social notifications.

ALTER TABLE "notifications" ALTER COLUMN "actor_user_id" DROP NOT NULL;
ALTER TABLE "notifications" ALTER COLUMN "feedback_id" DROP NOT NULL;

ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "severity" varchar(20);
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "title" varchar(200);
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "body" text;
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "entity_type" varchar(40);
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "entity_id" varchar(36);
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "metadata" jsonb;

ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "notifications_type_check";
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_type_check" CHECK (
  "type" in (
    'feedback_vote',
    'feedback_comment',
    'session_launch_failed',
    'session_stop_failed',
    'proxy_dead',
    'session_crashed',
    'session_reaped'
  )
);

ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "notifications_severity_check";
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_severity_check" CHECK (
  "severity" is null or "severity" in ('info', 'warning', 'critical')
);

CREATE INDEX IF NOT EXISTS "ix_notifications_entity" ON "notifications" ("entity_type", "entity_id");
