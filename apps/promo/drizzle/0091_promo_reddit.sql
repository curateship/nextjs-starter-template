-- Promo's own tables: finding Reddit posts worth commenting on, drafting the
-- comment, and posting it from one isolated browser session.
--
-- `promo` in the file name rather than `custom_shell`, so a future shell
-- migration can take 0091_custom_shell_* without the two colliding. These
-- tables live in `src/server/reddit/schema.ts`, never in the shell's
-- `src/server/schema.ts`, which an app never edits.
--
-- Why a browser and not Reddit's API: a plain request to
-- reddit.com/search.json answers 403, and the HTML search page answers with a
-- JavaScript puzzle instead of results. Reddit also stops accepting new API
-- applications on 31 Oct 2026 and closes the public API in March 2027. So the
-- isolated anti-detect browser is the only way in, and it reads and posts with
-- one engine.
--
-- Everything here is scoped by user id, because promo is one site
-- (`workspaces.whoMayHave: "off"`) and a row belongs to whoever made it.

-- A proxy the browser can route through. The password is encrypted with the
-- shell's own `encryptSecret` (src/server/auth/encryption.ts), so it is never
-- stored in the clear and never sent to a browser.
CREATE TABLE IF NOT EXISTS "promo_proxies" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  -- What to call it on screen. Free text, the person's own words.
  "label" varchar(120) NOT NULL DEFAULT '',
  -- 'http', 'https' or 'socks5'. Checked on the server, where the wording of
  -- the refusal lives.
  "protocol" varchar(20) NOT NULL DEFAULT 'http',
  "host" varchar(255) NOT NULL,
  "port" integer NOT NULL,
  "username" varchar(255) NOT NULL DEFAULT '',
  -- AES-256-GCM, as `iv:authTag:ciphertext`. Empty means no password.
  "password_encrypted" text NOT NULL DEFAULT '',
  -- Two-letter country of the exit IP, filled in by a successful test rather
  -- than typed. The fingerprint's timezone follows it.
  "country" varchar(2) NOT NULL DEFAULT '',
  "last_tested_at" timestamptz,
  -- The whole answer from the last test: ok, ip, country, city, isp,
  -- timezone, latencyMs, or the error. Kept whole so a later screen can show
  -- any part of it without another migration.
  "last_test_result" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "ix_promo_proxies_user" ON "promo_proxies" ("user_id");

-- The social account posts go out from. Build one has exactly one, on Reddit,
-- so the voice and the product description are columns here rather than a
-- personas table of their own. A second account is when they move out.
CREATE TABLE IF NOT EXISTS "promo_accounts" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  -- 'reddit' today. Instagram, TikTok and X share this table when they land.
  "platform" varchar(30) NOT NULL DEFAULT 'reddit',
  -- The handle without the u/ prefix. Empty until the first sign-in reports it.
  "handle" varchar(120) NOT NULL DEFAULT '',
  -- Null means no proxy, which is allowed but means the account browses from
  -- this machine's own IP.
  "proxy_id" varchar(36) REFERENCES "promo_proxies"("id") ON DELETE SET NULL,
  -- The generated identity the browser launches with. Whole object in one
  -- column, the same decision anti-detect made: a 1:1 table bought nothing.
  "fingerprint" jsonb,
  -- How the AI should sound. The person's own words, handed to the model.
  "voice" text NOT NULL DEFAULT '',
  -- What is being promoted, so a draft can mention it when it genuinely fits.
  "product" text NOT NULL DEFAULT '',
  -- Lines the AI must not cross, the person's own words again.
  "comment_rules" text NOT NULL DEFAULT '',
  -- Last karma reading, or null when nothing has read it yet. Never 0 as a
  -- stand-in: zero karma and an unknown karma are different answers.
  "karma" integer,
  "last_posted_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "ix_promo_accounts_user" ON "promo_accounts" ("user_id");

-- A live isolated browser. One container, one Docker volume holding the
-- cookies, one proxy. The partial unique index below is what stops a second
-- container ever opening the same volume, which would corrupt the profile.
CREATE TABLE IF NOT EXISTS "promo_browser_sessions" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "account_id" varchar(36) NOT NULL REFERENCES "promo_accounts"("id") ON DELETE CASCADE,
  -- 'starting', 'running', 'stopped' or 'error'.
  "status" varchar(20) NOT NULL DEFAULT 'starting',
  "container_id" varchar(80) NOT NULL DEFAULT '',
  -- Survives the container, which is the whole point: the cookies live here.
  "volume_name" varchar(120) NOT NULL DEFAULT '',
  -- Where the command server answers, bound to 127.0.0.1 only.
  "command_port" integer,
  -- Where the video stream answers, so a person can watch and take over.
  "stream_port" integer,
  "webrtc_port" integer,
  "last_error" text NOT NULL DEFAULT '',
  "started_at" timestamptz NOT NULL DEFAULT now(),
  "ended_at" timestamptz,
  -- Moved forward by every command. An hour of silence gets the container
  -- reaped, because an idle Camoufox still holds about 1.5GB.
  "last_activity_at" timestamptz NOT NULL DEFAULT now()
);

-- At most one live session per account.
CREATE UNIQUE INDEX IF NOT EXISTS "ux_promo_sessions_live_account"
  ON "promo_browser_sessions" ("account_id")
  WHERE "status" IN ('starting', 'running');

-- Ports are claimed by writing the row, so two launches racing for the same
-- port lose one insert instead of starting two containers on it.
CREATE UNIQUE INDEX IF NOT EXISTS "ux_promo_sessions_live_command_port"
  ON "promo_browser_sessions" ("command_port")
  WHERE "status" IN ('starting', 'running') AND "command_port" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "ux_promo_sessions_live_stream_port"
  ON "promo_browser_sessions" ("stream_port")
  WHERE "status" IN ('starting', 'running') AND "stream_port" IS NOT NULL;

-- A saved search. Running it again adds whatever is new and leaves every
-- decision already made about the old posts alone.
CREATE TABLE IF NOT EXISTS "promo_keywords" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "term" varchar(200) NOT NULL,
  -- Subreddits to search inside, or an empty list for all of Reddit.
  "subreddits" jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Reddit's own sort: 'relevance', 'new', 'top', 'comments'.
  --
  -- 'relevance' is the default because the four were measured against the
  -- query "project management tool" over one week on 5 Oct 2026: relevance put
  -- 25 of 25 posts on topic with a typical 8 comments, 'new' put 0 of 25 on
  -- topic, and 'comments' and 'top' were on topic but typically 538 and 301
  -- replies deep, where a new comment is never read. The ranking in
  -- src/server/reddit/rank.ts then reorders what relevance returns.
  "sort" varchar(20) NOT NULL DEFAULT 'relevance',
  -- Reddit's own window: 'hour', 'day', 'week', 'month', 'year', 'all'.
  "time_window" varchar(10) NOT NULL DEFAULT 'week',
  "enabled" boolean NOT NULL DEFAULT true,
  "last_run_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- One keyword cannot be saved twice by the same person.
CREATE UNIQUE INDEX IF NOT EXISTS "ux_promo_keywords_user_term"
  ON "promo_keywords" ("user_id", lower("term"));

-- One run of one keyword. Kept so "nothing found" and "the search failed" stay
-- different answers on screen.
CREATE TABLE IF NOT EXISTS "promo_searches" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "keyword_id" varchar(36) NOT NULL REFERENCES "promo_keywords"("id") ON DELETE CASCADE,
  -- 'running', 'done' or 'failed'.
  "status" varchar(20) NOT NULL DEFAULT 'running',
  -- How many posts the run saw, and how many of those were new.
  "seen_count" integer NOT NULL DEFAULT 0,
  "new_count" integer NOT NULL DEFAULT 0,
  "last_error" text NOT NULL DEFAULT '',
  "started_at" timestamptz NOT NULL DEFAULT now(),
  "finished_at" timestamptz
);

CREATE INDEX IF NOT EXISTS "ix_promo_searches_keyword" ON "promo_searches" ("keyword_id", "started_at" DESC);

-- A Reddit post worth looking at, and what was decided about it.
CREATE TABLE IF NOT EXISTS "promo_finds" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "keyword_id" varchar(36) NOT NULL REFERENCES "promo_keywords"("id") ON DELETE CASCADE,
  -- The run that first saw it. A later run updates the figures and leaves this.
  "first_search_id" varchar(36) REFERENCES "promo_searches"("id") ON DELETE SET NULL,
  -- Reddit's own id for the post, like "t3_1abc234".
  "reddit_id" varchar(40) NOT NULL,
  -- The path after reddit.com, so the full address is built in one place.
  "permalink" varchar(600) NOT NULL,
  -- Without the r/ prefix.
  "subreddit" varchar(120) NOT NULL DEFAULT '',
  "title" varchar(600) NOT NULL DEFAULT '',
  -- The post's own words. Empty for a link or image post.
  "body" text NOT NULL DEFAULT '',
  "author" varchar(120) NOT NULL DEFAULT '',
  "score" integer NOT NULL DEFAULT 0,
  "comment_count" integer NOT NULL DEFAULT 0,
  -- When Reddit says it was posted. The ranking is mostly this.
  "posted_at" timestamptz,
  -- How worth commenting on it looked when it was last read. The arithmetic
  -- is in src/server/reddit/rank.ts and explained in the app's docs: a fresh
  -- quiet post beats a three-day-old busy one by about fifty times.
  "rank" numeric(10, 4) NOT NULL DEFAULT 0,
  -- 'new', 'shortlisted', 'skipped' or 'commented'. Only a person moves this,
  -- except 'commented', which a successful post sets.
  "status" varchar(20) NOT NULL DEFAULT 'new',
  -- The post plus its top replies, as the browser last read them. Null until
  -- the thread has been opened, which is how the screen tells "not read yet"
  -- from "read, and it had no replies".
  "thread" jsonb,
  "thread_read_at" timestamptz,
  "first_seen_at" timestamptz NOT NULL DEFAULT now(),
  "last_seen_at" timestamptz NOT NULL DEFAULT now()
);

-- The dedup key. One post appears once per keyword, so re-running a search
-- updates the figures rather than making a second row.
CREATE UNIQUE INDEX IF NOT EXISTS "ux_promo_finds_keyword_post"
  ON "promo_finds" ("keyword_id", "reddit_id");

CREATE INDEX IF NOT EXISTS "ix_promo_finds_keyword_rank"
  ON "promo_finds" ("keyword_id", "rank" DESC);

CREATE INDEX IF NOT EXISTS "ix_promo_finds_user_status"
  ON "promo_finds" ("user_id", "status");

-- What the AI wrote. Kept after posting, so what was asked for and what went
-- out can be compared later.
CREATE TABLE IF NOT EXISTS "promo_drafts" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "find_id" varchar(36) NOT NULL REFERENCES "promo_finds"("id") ON DELETE CASCADE,
  "text" text NOT NULL,
  -- Which provider and model wrote it, straight off the shell's fixed lists
  -- in src/lib/ai/ai-models.ts.
  "provider" varchar(30) NOT NULL DEFAULT '',
  "model" varchar(120) NOT NULL DEFAULT '',
  -- 'draft', 'sent' or 'discarded'.
  "status" varchar(20) NOT NULL DEFAULT 'draft',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "ix_promo_drafts_find" ON "promo_drafts" ("find_id", "created_at" DESC);

-- A comment that actually went out, or tried to. One row per attempt, so a
-- failure leaves a record instead of disappearing.
CREATE TABLE IF NOT EXISTS "promo_comments" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "find_id" varchar(36) NOT NULL REFERENCES "promo_finds"("id") ON DELETE CASCADE,
  -- Null if the draft was edited past recognition or written by hand.
  "draft_id" varchar(36) REFERENCES "promo_drafts"("id") ON DELETE SET NULL,
  "account_id" varchar(36) NOT NULL REFERENCES "promo_accounts"("id") ON DELETE CASCADE,
  -- Exactly what was sent, which may differ from the draft after an edit.
  "text" text NOT NULL,
  -- 'posted' or 'failed'.
  "status" varchar(20) NOT NULL DEFAULT 'posted',
  -- Where it landed on Reddit. Empty on a failure.
  "comment_url" varchar(600) NOT NULL DEFAULT '',
  "last_error" text NOT NULL DEFAULT '',
  "posted_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "ix_promo_comments_find" ON "promo_comments" ("find_id", "posted_at" DESC);
CREATE INDEX IF NOT EXISTS "ix_promo_comments_account" ON "promo_comments" ("account_id", "posted_at" DESC);

-- The work queue. A search through a real browser takes tens of seconds, far
-- too long to ride the shell's fifteen-second ticker, so the browser runs in a
-- process of its own and claims jobs from here.
--
-- The claiming shape copies the shell's own, proved in
-- src/server/automations/engine.ts: a claim token, a claimed_at that expires
-- so a worker that vanished hands its job back, and an attempt counter so an
-- abandoned job stops rather than being reclaimed forever in silence.
CREATE TABLE IF NOT EXISTS "promo_jobs" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  -- 'search', 'thread' or 'comment'.
  "kind" varchar(30) NOT NULL,
  -- What the job needs: a keyword id, a find id, or a find id plus the text.
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- 'queued', 'running', 'done' or 'failed'.
  "status" varchar(20) NOT NULL DEFAULT 'queued',
  "claim_token" varchar(36),
  "claimed_at" timestamptz,
  "attempts" integer NOT NULL DEFAULT 0,
  "last_error" text NOT NULL DEFAULT '',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "finished_at" timestamptz
);

-- The claiming read: oldest queued job first, which is also the order a person
-- pressed the buttons in.
CREATE INDEX IF NOT EXISTS "ix_promo_jobs_claimable"
  ON "promo_jobs" ("status", "created_at");
