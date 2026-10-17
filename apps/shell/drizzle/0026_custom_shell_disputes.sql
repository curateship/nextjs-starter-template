-- Chargebacks: a member telling their bank to take a payment back.
--
-- These arrive with a deadline. Miss it and the money is gone automatically,
-- plus Stripe's fee on top — so unlike everything else billing-related, this
-- table exists purely so the admin cannot fail to notice.
--
-- Written only by the Stripe webhook (charge.dispute.*), read only by the admin
-- billing page. Responding still happens in Stripe's own dashboard; this app's
-- job is making sure somebody knows there is something to respond to.
CREATE TABLE IF NOT EXISTS "disputes" (
  "id" varchar(36) PRIMARY KEY,
  "stripe_dispute_id" varchar(120) NOT NULL UNIQUE,
  "stripe_charge_id" varchar(120),
  -- Null when the disputed charge cannot be traced back to an account here:
  -- the charge may predate the account, or belong to a Stripe customer this
  -- app never recorded. A dispute nobody can be named for still has a deadline,
  -- so it is kept and shown either way.
  --
  -- SET NULL, never CASCADE: a chargeback outlives the account it came from.
  -- Money that left is a fact about the business, not about the member.
  "user_id" varchar(36) REFERENCES "users"("id") ON DELETE SET NULL,
  "amount_cents" integer NOT NULL,
  "currency" varchar(10) NOT NULL,
  "reason" varchar(60) NOT NULL,
  -- Deliberately no CHECK constraint. This is Stripe's vocabulary, not ours,
  -- and the app treats any status it does not recognise as still open — a
  -- status Stripe adds later must make the alert louder, never hide it.
  "status" varchar(30) NOT NULL,
  -- When evidence has to be with Stripe. Null on the warning stages, which have
  -- no deadline yet.
  "evidence_due_by" timestamp with time zone,
  -- Which Stripe dashboard the link should open. Kept per row so old links stay
  -- correct after the keys are switched from test to live.
  "livemode" boolean NOT NULL DEFAULT true,
  "opened_at" timestamp with time zone NOT NULL,
  "closed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);

-- The alert's query: everything still open, soonest deadline first.
CREATE INDEX IF NOT EXISTS "ix_disputes_status" ON "disputes" ("status");

-- The history list's order.
CREATE INDEX IF NOT EXISTS "ix_disputes_opened_at" ON "disputes" ("opened_at");

CREATE INDEX IF NOT EXISTS "ix_disputes_user_id" ON "disputes" ("user_id");
