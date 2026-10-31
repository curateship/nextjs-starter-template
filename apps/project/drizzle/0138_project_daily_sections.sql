-- The order of the Daily card's sections in My dashboard's left panel, as the
-- site admin dragged them in the card's pencil window (Tyler, 30 Oct 2026:
-- "whats the point of dragging the cards in the modal if its not reflected in
-- the panel?"). Kept in the account so every computer shows the same order.
-- Empty is the card's own order; a section it doesn't name goes at the end.
ALTER TABLE "project_daily_cards" ADD COLUMN IF NOT EXISTS "section_order" text[] NOT NULL DEFAULT '{}';
