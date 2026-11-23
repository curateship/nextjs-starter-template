-- A type and a short headline on every deal, like "20% off" or "Free dessert":
-- the few words a card on the Deals page shows in big type.
--
-- The type is one of five fixed words. A type can be added later but never
-- removed or renamed, because old deals store it. Deals made before this
-- migration have no type and an empty headline, and the pages show "Deal"
-- until somebody edits them; saving one then needs a type.
--
-- For money off and percent off the headline is built from `amount` when the
-- deal is saved ("$5 off" from 5, "20% off" from 20), and `amount` is kept so
-- the window can show the number again. The other types have a typed headline
-- and no amount. The site never works out what a visitor saves.
ALTER TABLE "promotions"
  ADD COLUMN IF NOT EXISTS "deal_type" varchar(20),
  ADD COLUMN IF NOT EXISTS "amount" numeric(7, 2),
  ADD COLUMN IF NOT EXISTS "headline" varchar(24) NOT NULL DEFAULT '';

ALTER TABLE "promotions"
  DROP CONSTRAINT IF EXISTS "promotions_deal_type_check",
  ADD CONSTRAINT "promotions_deal_type_check"
    CHECK ("deal_type" IS NULL OR "deal_type" IN ('money_off', 'percent_off', 'two_for_one', 'free_item', 'other'));

-- A deal with a type always has a headline; one without has neither.
ALTER TABLE "promotions"
  DROP CONSTRAINT IF EXISTS "promotions_headline_check",
  ADD CONSTRAINT "promotions_headline_check"
    CHECK (("deal_type" IS NULL) = ("headline" = ''));

-- Only money off and percent off have a number, and they always do.
ALTER TABLE "promotions"
  DROP CONSTRAINT IF EXISTS "promotions_amount_check",
  ADD CONSTRAINT "promotions_amount_check"
    CHECK (
      CASE WHEN "deal_type" IN ('money_off', 'percent_off')
        THEN "amount" IS NOT NULL
        ELSE "amount" IS NULL
      END
    );
