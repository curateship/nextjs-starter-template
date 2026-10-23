-- Tags on feedback, so a growing board can be filtered by what an item is
-- about ("Media", "Billing") on top of what kind of item it is (its type).
--
-- A plain text array beats a join table here: the tag list is a short fixed
-- set defined in code (`src/lib/feedback-tags.ts`), members pick at most three,
-- and nothing else joins on them. The check below repeats that code-side list
-- so a raw write cannot invent a tag the app has never heard of.
ALTER TABLE "feedback"
  ADD COLUMN IF NOT EXISTS "tags" text[] NOT NULL DEFAULT '{}';

ALTER TABLE "feedback"
  ADD CONSTRAINT "feedback_tags_check" CHECK (
    "tags" <@ ARRAY['dashboard','media','automations','account','billing','performance','design']::text[]
    AND cardinality("tags") <= 3
  );
