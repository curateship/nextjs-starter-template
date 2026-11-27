-- The phone farm's fourth and fifth steps: important and throwaway accounts
-- kept apart, each phone's setup check and what the platform sees, wiping a
-- phone between accounts, the Wi-Fi phone's address guard, and moving an
-- account from a browser profile to a phone. Tasks "Phone farm/04" and "05".
--
-- Additions only. Nothing stored is renamed or dropped.

-- Important or throwaway. Every account starts as throwaway until Tyler
-- marks it, and important is one way (Tyler, 14 Oct 2026). An important
-- account only ever runs on a phone.
ALTER TABLE "promo_accounts" ADD COLUMN IF NOT EXISTS "importance" varchar(12) NOT NULL DEFAULT 'throwaway';

-- The phone a throwaway is being moved to. Set when the move starts, and
-- cleared when the phone reads the account signed in and the move is done.
ALTER TABLE "promo_accounts" ADD COLUMN IF NOT EXISTS "moving_to_phone_id" varchar(36) REFERENCES "promo_phones"("id") ON DELETE SET NULL;

-- When an account last left the phone, which then needs wiping before any
-- other account is set on it. Null when it does not.
ALTER TABLE "promo_phones" ADD COLUMN IF NOT EXISTS "needs_wipe_at" timestamptz;
-- When an important account was first on it since its last wipe. A
-- throwaway is refused here until the phone is wiped.
ALTER TABLE "promo_phones" ADD COLUMN IF NOT EXISTS "held_important_at" timestamptz;
-- When the rack last wiped it. After a wipe it takes an account only once a
-- setup check newer than this has passed.
ALTER TABLE "promo_phones" ADD COLUMN IF NOT EXISTS "wiped_at" timestamptz;
-- The last setup check, line by line, with what the platform sees.
ALTER TABLE "promo_phones" ADD COLUMN IF NOT EXISTS "setup_check" jsonb;
ALTER TABLE "promo_phones" ADD COLUMN IF NOT EXISTS "setup_checked_at" timestamptz;
-- When a Wi-Fi phone was found showing the house's address, or an address
-- that is not its proxy's, and the words saying so. Every job on it is
-- refused until a check finds the proxy's address again.
ALTER TABLE "promo_phones" ADD COLUMN IF NOT EXISTS "address_stop_at" timestamptz;
ALTER TABLE "promo_phones" ADD COLUMN IF NOT EXISTS "address_stop_words" text NOT NULL DEFAULT '';
