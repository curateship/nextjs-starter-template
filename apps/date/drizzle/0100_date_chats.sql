-- Chats and replies: what each person told you, openers and nudges, chats
-- that are over, agreed dates with a time, a place and a Google Calendar
-- event, a note and an off switch per chat, and the Calendar screen under
-- Dating. Task "features/01-chats-and-replies".
--
-- Additions only. Nothing stored is renamed or dropped.

ALTER TABLE "date_matches"
  -- Part 2: facts they told you, each { id, text, edited }, and how far into the chat they were read.
  ADD COLUMN IF NOT EXISTS "facts" jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "notes_read_through" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "notes_started_at" timestamptz,
  -- Parts 1, 3 and 14: what the waiting draft is (reply, opener or nudge) and, for an opener, its kind.
  ADD COLUMN IF NOT EXISTS "draft_kind" varchar(10) NOT NULL DEFAULT 'reply',
  ADD COLUMN IF NOT EXISTS "draft_opener_style" varchar(20),
  -- Part 6: the two more drafts "Show 3" wrote.
  ADD COLUMN IF NOT EXISTS "draft_choices" jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Part 3: the one follow-up on a quiet chat.
  ADD COLUMN IF NOT EXISTS "nudged_at" timestamptz,
  -- Part 4: the AI read the chat as over, with their line that says so.
  ADD COLUMN IF NOT EXISTS "ended_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "ended_line" text NOT NULL DEFAULT '',
  -- Part 5: they said yes to a drink or coffee, and the number they sent.
  ADD COLUMN IF NOT EXISTS "date_accepted_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "date_accepted_line" text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "their_number" varchar(40) NOT NULL DEFAULT '',
  -- Part 10.
  ADD COLUMN IF NOT EXISTS "moved_to_text_at" timestamptz,
  -- Part 11: who unmatched, and how many complete reads of the chat list in a row missed them.
  ADD COLUMN IF NOT EXISTS "unmatched_by" varchar(10),
  ADD COLUMN IF NOT EXISTS "missing_reads" integer NOT NULL DEFAULT 0,
  -- Part 13: the brief before a date, three lines from the chat.
  ADD COLUMN IF NOT EXISTS "brief_lines" jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "brief_made_at" timestamptz,
  -- Part 15: the date's time and place, typed by the member, and its Google Calendar event.
  ADD COLUMN IF NOT EXISTS "date_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "date_place" text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "google_event_id" varchar(200) NOT NULL DEFAULT '',
  -- Parts 18 and 19.
  ADD COLUMN IF NOT EXISTS "ai_off" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "member_note" text NOT NULL DEFAULT '';

-- Every unmatch so far was the member's own, through the dashboard.
UPDATE "date_matches" SET "unmatched_by" = 'member' WHERE "unmatched_at" IS NOT NULL AND "unmatched_by" IS NULL;

ALTER TABLE "date_messages"
  -- Part 17: the AI's draft as it stood when the member pressed Send, to tell "sent unchanged" from "changed".
  ADD COLUMN IF NOT EXISTS "draft_text" text,
  -- Part 14: an opener's kind, carried from the draft.
  ADD COLUMN IF NOT EXISTS "opener_style" varchar(20);

-- Part 15: the member's Google Calendar, connected one way: Date writes its
-- own date events there and never reads the calendar. The refresh token is
-- encrypted with the server's key.
CREATE TABLE IF NOT EXISTS "date_google_calendars" (
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "workspace_id" varchar(36) NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "email" varchar(320) NOT NULL DEFAULT '',
  "refresh_token_encrypted" text NOT NULL,
  "connected_at" timestamptz NOT NULL DEFAULT now(),
  "last_error" text NOT NULL DEFAULT '',
  PRIMARY KEY ("user_id", "workspace_id")
);

-- Part 15: Calendar under Dating in the left menu, after Phone. A Dating link
-- that already has it, or a menu with no Dating link, is left alone.
UPDATE "workspaces" AS "w"
SET "settings" = jsonb_set(
  "w"."settings",
  '{sections}',
  (
    SELECT jsonb_agg(
      CASE
        WHEN jsonb_typeof("s"."section"->'entries') <> 'array' THEN "s"."section"
        ELSE jsonb_set(
          "s"."section",
          '{entries}',
          (
            SELECT COALESCE(
              jsonb_agg(
                CASE
                  WHEN "e"."entry"->>'id' = 'item-date-dating' THEN jsonb_set(
                    "e"."entry",
                    '{children}',
                    COALESCE(
                      CASE WHEN jsonb_typeof("e"."entry"->'children') = 'array' THEN "e"."entry"->'children' END,
                      '[]'::jsonb
                    ) || jsonb_build_array(
                      jsonb_build_object('id', 'item-date-dating-calendar', 'href', '/admin/dating/calendar', 'label', 'Calendar')
                    )
                  )
                  ELSE "e"."entry"
                END
                ORDER BY "e"."ord"
              ),
              '[]'::jsonb
            )
            FROM jsonb_array_elements("s"."section"->'entries') WITH ORDINALITY AS "e"("entry", "ord")
          )
        )
      END
      ORDER BY "s"."ord"
    )
    FROM jsonb_array_elements("w"."settings"->'sections') WITH ORDINALITY AS "s"("section", "ord")
  )
)
WHERE jsonb_typeof("w"."settings"->'sections') = 'array'
  AND jsonb_array_length("w"."settings"->'sections') > 0
  AND jsonb_path_exists("w"."settings", '$.sections[*].entries[*] ? (@.id == "item-date-dating")')
  AND NOT jsonb_path_exists("w"."settings", '$.sections[*].entries[*].children[*] ? (@.href == "/admin/dating/calendar")');
