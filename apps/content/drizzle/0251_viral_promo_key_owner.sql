-- Who saved the Promo key on Settings → Promo connection. Promo's calls back
-- carry that key, so they may only touch that person's reads and ideas
-- (`workspace/docs/promo-connection.md`). A key saved before this column
-- has no owner, and Promo's calls are refused until it is pasted again.

ALTER TABLE "viral_settings" ADD COLUMN IF NOT EXISTS "promo_key_owner_id" varchar(36) REFERENCES "users"("id") ON DELETE SET NULL;
