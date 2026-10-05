-- The same index the previous migration gave `deliveries`, on the other table
-- the engagement rules read.
--
-- "When they last opened or clicked" asks both tables at once. The newsletter
-- side has had an index for that predicate since 0089; the automation side had
-- none, so half of every engagement query read the whole table. The rules run
-- on every segment count and on every filtered contacts page, so it is not a
-- rare query.
--
-- Partial, because the rows worth looking at are the small share that were
-- opened or clicked, and a full index over every automation send ever made
-- would be mostly nulls.
CREATE INDEX IF NOT EXISTS "ix_automation_deliveries_engaged"
  ON "automation_deliveries" ("contact_id")
  WHERE "opened_at" IS NOT NULL OR "clicked_at" IS NOT NULL;
