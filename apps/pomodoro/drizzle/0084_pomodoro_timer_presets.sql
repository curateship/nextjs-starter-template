-- Custom focus rhythms: up to 10 per person, names unique per person
-- (case-insensitively enforced in code, structurally here).
CREATE TABLE IF NOT EXISTS "user_timer_presets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" varchar(60) NOT NULL,
  "focus_minutes" integer NOT NULL,
  "short_break_minutes" integer NOT NULL,
  "long_break_minutes" integer NOT NULL,
  "auto_start" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "timer_presets_focus_check" CHECK ("focus_minutes" BETWEEN 1 AND 90),
  CONSTRAINT "timer_presets_short_check" CHECK ("short_break_minutes" BETWEEN 1 AND 90),
  CONSTRAINT "timer_presets_long_check" CHECK ("long_break_minutes" BETWEEN 1 AND 90),
  CONSTRAINT "timer_presets_user_name_unique" UNIQUE ("user_id", "name")
);
