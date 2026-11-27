-- The old addresses are gone (Tyler, 13 Nov 2026: "do all 3", taking out
-- the pages that only sent an old address on to its new place). A bell
-- notice remembers the address it opens, so every notice still holding an
-- old one is pointed at the new place here, with the rest of its address
-- (`?open=`, `?platform=` and so on) kept after the section.
--
-- `/admin/archive` goes too (Tyler's pick, 13 Nov 2026), although Video keeps
-- that address for items it sent before 12 Nov 2026; those links in Video now
-- show "not found". `/admin/comments` stays: Reddit's reply and removal
-- notices still open it.

-- Anti Detect: Profiles, Proxies, Bans and Phones keep their `?open=` and filters.
UPDATE "promo_notices" SET "href" = rtrim(regexp_replace("href", '^/admin/profiles\??', '/admin/anti-detect?section=profiles&'), '&')
WHERE "href" = '/admin/profiles' OR "href" LIKE '/admin/profiles?%';

UPDATE "promo_notices" SET "href" = rtrim(regexp_replace("href", '^/admin/proxies\??', '/admin/anti-detect?section=proxies&'), '&')
WHERE "href" = '/admin/proxies' OR "href" LIKE '/admin/proxies?%';

UPDATE "promo_notices" SET "href" = rtrim(regexp_replace("href", '^/admin/bans\??', '/admin/anti-detect?section=bans&'), '&')
WHERE "href" = '/admin/bans' OR "href" LIKE '/admin/bans?%';

UPDATE "promo_notices" SET "href" = rtrim(regexp_replace("href", '^/admin/phones\??', '/admin/anti-detect?section=phones&'), '&')
WHERE "href" = '/admin/phones' OR "href" LIKE '/admin/phones?%';

-- A rack's page opens Phones filtered to that rack; `?loose=1` was the phones on no rack.
UPDATE "promo_notices" SET "href" = '/admin/anti-detect?section=phones&rack='
  || split_part(split_part(substring("href" FROM length('/admin/racks/') + 1), '?', 1), '/', 1)
WHERE "href" LIKE '/admin/racks/%';

UPDATE "promo_notices" SET "href" = '/admin/anti-detect?section=phones&rack=none'
WHERE "href" LIKE '/admin/racks?%loose=1%';

UPDATE "promo_notices" SET "href" = '/admin/anti-detect?section=phones'
WHERE "href" = '/admin/racks' OR "href" LIKE '/admin/racks?%';

-- Projects dashboard: Voices, Accounts and Messages keep their `?open=` and `?platform=`.
UPDATE "promo_notices" SET "href" = rtrim(regexp_replace("href", '^/admin/voices\??', '/admin/projects?section=voices&'), '&')
WHERE "href" = '/admin/voices' OR "href" LIKE '/admin/voices?%';

UPDATE "promo_notices" SET "href" = rtrim(regexp_replace("href", '^/admin/accounts\??', '/admin/projects?section=accounts&'), '&')
WHERE "href" = '/admin/accounts' OR "href" LIKE '/admin/accounts?%';

UPDATE "promo_notices" SET "href" = '/admin/projects?section=accounts&platform=reddit'
WHERE "href" = '/admin/reddit-accounts' OR "href" LIKE '/admin/reddit-accounts?%';

UPDATE "promo_notices" SET "href" = rtrim(regexp_replace("href", '^/admin/messages\??', '/admin/projects?section=messages&'), '&')
WHERE "href" = '/admin/messages' OR "href" LIKE '/admin/messages?%';

UPDATE "promo_notices" SET "href" = rtrim(regexp_replace("href", '^/admin/archive\??', '/admin/projects?section=archive&'), '&')
WHERE "href" = '/admin/archive' OR "href" LIKE '/admin/archive?%';

-- Reddit's old dashboard, Today and Jobs: the Projects dashboard.
UPDATE "promo_notices" SET "href" = '/admin/projects'
WHERE "href" IN ('/admin/reddit', '/admin/today', '/admin/jobs')
   OR "href" LIKE '/admin/reddit?%' OR "href" LIKE '/admin/today?%' OR "href" LIKE '/admin/jobs?%';
