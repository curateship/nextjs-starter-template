-- Stops keeping our own copy of Stripe's chargebacks.
--
-- The table was mirrored here so that an open chargeback could be seen without
-- going to look for it. The only thing that ever showed one was a table on the
-- Membership page, and that page is gone -- so every row written since has been
-- written for nobody to read.
--
-- Nothing replaces it, on purpose. Stripe emails you when a chargeback opens,
-- and Stripe's dashboard is the only place one can actually be answered; this
-- app could never do either. A second copy of a fact we are not the source of
-- truth for is upkeep with nothing on the other side of it.
--
-- What this gives up: chargebacks are no longer recorded at all, so nothing here
-- can ever show a history of them. Getting that back means going to Stripe.
--
-- `IF EXISTS` because 0026, which created this table, has not been applied to
-- production yet. There the create and this drop land in the same run, and the
-- table simply never survives it.

DROP TABLE IF EXISTS "disputes";
