-- A member's billing history: what happened to their plan, and when.
--
-- The `subscriptions` table is one row per person, overwritten on every change,
-- so it only ever says what is true right now. This table is the diary beside
-- it: trial started, subscribed, plan switched, payment failed, cancelled.
-- Support questions and refund decisions are all "what happened here", and
-- without this there is no answer.
--
-- Two rules, and everything else follows from them:
--
--   1. Insert only. Nothing updates or deletes a row here. A record that can be
--      edited is not a record.
--   2. One row per thing that actually changed. A Stripe webhook that repeats
--      what we already knew writes nothing, so the timeline is events, not
--      traffic.
--
-- History starts the day this ships. Nothing before it is reconstructed, and
-- the screen says so rather than letting a short history read as a quiet one.
CREATE TABLE IF NOT EXISTS "subscription_events" (
  "id" varchar(36) PRIMARY KEY,
  -- CASCADE, unlike disputes: this is the story of one person's plan, and it
  -- has no meaning once the person is gone. Money that actually moved is
  -- recorded in Stripe and in `disputes`, neither of which this replaces.
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  -- Our vocabulary, not Stripe's — see lib/subscription-events.ts, which turns
  -- each one into the sentence the timeline shows. Deliberately no CHECK: a
  -- kind added later must never be blocked from being recorded, and an
  -- unrecognised kind still renders as something readable.
  "kind" varchar(40) NOT NULL,
  -- The plan's name as it was at the time, copied rather than referenced. A
  -- plan renamed or archived next year must not rewrite what happened last
  -- year.
  "plan_name" varchar(120),
  -- The one extra fact the sentence needs, and its meaning depends on the kind:
  -- the previous plan's name for a switch, an ISO date for a scheduled end or a
  -- grant, Stripe's status word for a failed payment. Null everywhere else.
  "detail" varchar(200),
  -- Who caused it: 'stripe' for a webhook, 'admin' for something done in the
  -- back office.
  "source" varchar(10) NOT NULL,
  -- The Stripe event this came from. Unique, so one webhook can only ever
  -- produce one row here however many times it is delivered or replayed.
  "stripe_event_id" varchar(120) UNIQUE,
  "created_at" timestamp with time zone NOT NULL
);

-- The only query this table has: one person's history, newest first.
CREATE INDEX IF NOT EXISTS "ix_subscription_events_user_id"
  ON "subscription_events" ("user_id", "created_at" DESC);
