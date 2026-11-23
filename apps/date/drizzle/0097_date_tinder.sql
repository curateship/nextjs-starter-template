-- What Date reads off Tinder and does there: the cards it read, the matches
-- and their messages, the member's own profile, and the job list of walks.
-- Task "tinder/01", part 2. The Drizzle side is `src/server/tinder/schema.ts`.
--
-- Additions only. Nothing stored is renamed or dropped.

-- One card read off Tinder's Discover screen, its photos, every line on it,
-- the swipe and who made it, and the AI's score and read. Sample cards have
-- no phone.
CREATE TABLE IF NOT EXISTS "date_profiles" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "workspace_id" varchar(36) NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "phone_id" varchar(36) REFERENCES "date_phones"("id") ON DELETE SET NULL,
  "name" varchar(120) NOT NULL,
  "age" integer,
  "distance" varchar(60) NOT NULL DEFAULT '',
  "verified" boolean NOT NULL DEFAULT false,
  "bio" text NOT NULL DEFAULT '',
  "job" text NOT NULL DEFAULT '',
  "school" text NOT NULL DEFAULT '',
  "lives_in" text NOT NULL DEFAULT '',
  "sections" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "handles" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "texts" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "photo_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "fingerprint" varchar(64) NOT NULL DEFAULT '',
  "read_at" timestamptz NOT NULL DEFAULT now(),
  "swipe" varchar(10) NOT NULL DEFAULT 'none',
  "swiped_by" varchar(10),
  "swiped_at" timestamptz,
  "ai_score" integer,
  "ai_read" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "ai_flags" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "ai_dealbreakers" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "ai_read_at" timestamptz,
  "ai_started_at" timestamptz,
  -- Why the AI's last try at this card failed, in words, or empty.
  "ai_error" text NOT NULL DEFAULT '',
  "sample" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "ix_date_profiles_user_read" ON "date_profiles" ("user_id", "workspace_id", "read_at" DESC);

-- One match and the state of its conversation: the counts that time the
-- date proposal, the AI's draft and when it goes out, and why the AI stopped
-- drafting when it did.
CREATE TABLE IF NOT EXISTS "date_matches" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "workspace_id" varchar(36) NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "phone_id" varchar(36) REFERENCES "date_phones"("id") ON DELETE SET NULL,
  "profile_id" varchar(36) REFERENCES "date_profiles"("id") ON DELETE SET NULL,
  "their_name" varchar(120) NOT NULL,
  "photo_id" varchar(36),
  "avatar_hash" varchar(16) NOT NULL DEFAULT '',
  "matched_at" timestamptz NOT NULL DEFAULT now(),
  "last_message_at" timestamptz,
  "last_preview" text NOT NULL DEFAULT '',
  "needs_read" boolean NOT NULL DEFAULT false,
  "unread_count" integer NOT NULL DEFAULT 0,
  "messages_from_them" integer NOT NULL DEFAULT 0,
  "messages_from_us" integer NOT NULL DEFAULT 0,
  "draft" text NOT NULL DEFAULT '',
  "draft_made_at" timestamptz,
  "draft_for_message_id" varchar(36),
  "draft_proposes_date" boolean NOT NULL DEFAULT false,
  "draft_send_at" timestamptz,
  "ai_started_at" timestamptz,
  "ai_error" text NOT NULL DEFAULT '',
  "flagged_reason" varchar(20),
  "ask_question" text NOT NULL DEFAULT '',
  "date_proposed_at" timestamptz,
  "unmatched_at" timestamptz,
  "sample" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "ix_date_matches_user" ON "date_matches" ("user_id", "workspace_id", "last_message_at" DESC);

-- One message, in conversation order. "hash" is how the same message is never
-- sent twice; "status" says whether a message of ours went out.
CREATE TABLE IF NOT EXISTS "date_messages" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "match_id" varchar(36) NOT NULL REFERENCES "date_matches"("id") ON DELETE CASCADE,
  "direction" varchar(3) NOT NULL,
  "sent_by" varchar(10) NOT NULL,
  "text" text NOT NULL,
  "hash" varchar(64) NOT NULL,
  "status" varchar(10) NOT NULL DEFAULT 'sent',
  "error" text NOT NULL DEFAULT '',
  "proposes_date" boolean NOT NULL DEFAULT false,
  "position" integer NOT NULL,
  "sent_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "ix_date_messages_match" ON "date_messages" ("match_id", "position");

-- The member's own Tinder profile as last read, and the AI's suggestions.
CREATE TABLE IF NOT EXISTS "date_own_profile" (
  "phone_id" varchar(36) PRIMARY KEY REFERENCES "date_phones"("id") ON DELETE CASCADE,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "workspace_id" varchar(36) NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "name" varchar(120) NOT NULL DEFAULT '',
  "photo_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "bio" text NOT NULL DEFAULT '',
  "sections" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "texts" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "read_at" timestamptz NOT NULL DEFAULT now(),
  "review" jsonb,
  "review_made_at" timestamptz,
  "ai_started_at" timestamptz,
  "ai_error" text NOT NULL DEFAULT ''
);

-- The job list of Tinder walks. A phone runs one at a time; a walk past its
-- lease was dropped by a restart and is marked stopped part-way.
CREATE TABLE IF NOT EXISTS "date_walks" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "workspace_id" varchar(36) NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "phone_id" varchar(36) NOT NULL REFERENCES "date_phones"("id") ON DELETE CASCADE,
  "kind" varchar(30) NOT NULL,
  "input" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "status" varchar(20) NOT NULL DEFAULT 'waiting',
  "result" jsonb,
  "error" text NOT NULL DEFAULT '',
  "asked_by" varchar(10) NOT NULL,
  "lease_until" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "started_at" timestamptz,
  "finished_at" timestamptz
);

CREATE INDEX IF NOT EXISTS "ix_date_walks_phone" ON "date_walks" ("phone_id", "status", "created_at");
