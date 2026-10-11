-- Whether a purchase was paid with Stripe's live keys or its sandbox keys
-- (audit of uploads-and-sharing task 07, 10 Oct 2026). Only purchases made
-- in the mode the site is using now count toward credits and space, so a
-- test-card purchase made while the site runs on sandbox keys stops counting
-- the day it switches to live ones. Every purchase so far was a sandbox one.
ALTER TABLE "pomodoro_purchases"
  ADD COLUMN IF NOT EXISTS "livemode" boolean NOT NULL DEFAULT false;
