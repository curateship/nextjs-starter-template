-- The roadmap column: where each piece of feedback sits in its life. Every
-- existing row starts at 'open', which is what it already was in spirit.
ALTER TABLE "feedback"
  ADD COLUMN IF NOT EXISTS "status" varchar(20) NOT NULL DEFAULT 'open';

ALTER TABLE "feedback" DROP CONSTRAINT IF EXISTS "feedback_status_check";
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_status_check" CHECK (
  "status" in ('open', 'planned', 'in_progress', 'done')
);
