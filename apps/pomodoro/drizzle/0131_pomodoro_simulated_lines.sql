-- What the made-up members say in rooms (live activity task 03, 9 Oct 2026).
--
-- One row per attempt at a line: an AI line that failed the checks, its
-- rewrite, and the fixed line that replaced them are three rows. `trigger_key`
-- names the moment that asked for the line ("greet:<membership>",
-- "break:<room>:<sequence>" and so on), so a moment is answered once.
-- `message_id` points at the room message a sent line became, and is empty
-- for a line thrown away. `cost_cents` keeps fractions, because one line on
-- Haiku costs well under a cent. Rows are kept 30 days.
CREATE TABLE IF NOT EXISTS "pomodoro_simulated_lines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "room_id" uuid NOT NULL REFERENCES "rooms"("id") ON DELETE CASCADE,
  "message_id" uuid REFERENCES "room_messages"("id") ON DELETE SET NULL,
  "trigger_key" varchar(120) NOT NULL,
  "kind" varchar(20) NOT NULL,
  "source" varchar(10) NOT NULL,
  "model" varchar(60),
  "cost_cents" numeric(10, 4) NOT NULL DEFAULT 0,
  "brief" text,
  "body" varchar(500),
  "rejected_reason" varchar(200),
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "pomodoro_simulated_lines_room_trigger_idx"
  ON "pomodoro_simulated_lines" ("room_id", "trigger_key");
CREATE INDEX IF NOT EXISTS "pomodoro_simulated_lines_created_idx"
  ON "pomodoro_simulated_lines" ("created_at");
