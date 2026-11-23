-- The member's Dating settings: what the AI is told about them and what they
-- want, how it decides, and the limits on the phone. One row per member per
-- site; the values are one JSON object, and a value not saved yet takes its
-- default in `src/lib/dating/settings.ts`. Task "tinder/01", part 3.
--
-- Additions only. Nothing stored is renamed or dropped.
CREATE TABLE IF NOT EXISTS "date_settings" (
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "workspace_id" varchar(36) NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "values" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("user_id", "workspace_id")
);
