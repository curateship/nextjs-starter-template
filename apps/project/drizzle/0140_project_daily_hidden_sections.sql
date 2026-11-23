-- The Daily card's sections the site admin hid with the eye in the card's
-- pencil window (Tyler, 31 Oct 2026: "Add an eye icon to the sections ... for
-- me to hide or unhide a section"). Kept in the account beside the order.
-- Empty shows every section.
ALTER TABLE "project_daily_cards" ADD COLUMN IF NOT EXISTS "hidden_sections" text[] NOT NULL DEFAULT '{}';
