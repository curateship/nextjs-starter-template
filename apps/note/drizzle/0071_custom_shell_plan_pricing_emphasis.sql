ALTER TABLE "plans"
  ADD COLUMN IF NOT EXISTS "highlight_badge_text" varchar(50),
  ADD COLUMN IF NOT EXISTS "checkout_button_text" varchar(60);

CREATE UNIQUE INDEX IF NOT EXISTS "ux_plans_single_highlight"
  ON "plans" ((true))
  WHERE "highlight_badge_text" IS NOT NULL;
