-- Travel's own tables: trips, the activities on their days, and everything a
-- trip page shows beside them. Each trip belongs to one person, and only that
-- person ever reads or changes it (Tyler, 2 Nov 2026: anyone who signs up,
-- each person sees only their own trips).

CREATE TABLE IF NOT EXISTS "travel_trips" (
  "id" varchar(36) PRIMARY KEY,
  "owner_user_id" varchar(36) NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "destination" text,
  -- How many day columns the board has. Dates are optional (Tyler's answer).
  "days" smallint NOT NULL,
  "start_date" date,
  -- One currency per trip, an ISO code such as USD or JPY.
  "currency" varchar(3) NOT NULL DEFAULT 'USD',
  -- Where the trip is, so "today" means today there.
  "time_zone" text,
  -- In cents of the trip's currency, like every cost.
  "budget_cents" bigint,
  "status" varchar(16) NOT NULL DEFAULT 'planning',
  "cover_url" text,
  "cover_credit" jsonb,
  -- One entry per day, in day order: its city and its one-line note.
  "day_info" jsonb NOT NULL DEFAULT '[]',
  "emergency" jsonb,
  "travel_mode" varchar(16) NOT NULL DEFAULT 'walk',
  "tags" text[] NOT NULL DEFAULT '{}',
  -- A long secret in the phone calendar link; null until asked for.
  "calendar_token" varchar(64),
  "is_sample" boolean NOT NULL DEFAULT false,
  "archived_at" timestamptz,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  CONSTRAINT "travel_trips_days" CHECK ("days" BETWEEN 1 AND 60),
  CONSTRAINT "travel_trips_status" CHECK ("status" IN ('planning', 'booked', 'done')),
  CONSTRAINT "travel_trips_mode" CHECK ("travel_mode" IN ('walk', 'transit', 'drive'))
);

CREATE INDEX IF NOT EXISTS "ix_travel_trips_owner" ON "travel_trips" ("owner_user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "ux_travel_trips_calendar" ON "travel_trips" ("calendar_token");

-- Each person's own list of activity types, edited in Settings → App settings.
CREATE TABLE IF NOT EXISTS "travel_activity_types" (
  "id" varchar(36) PRIMARY KEY,
  "owner_user_id" varchar(36) NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "name" varchar(40) NOT NULL,
  "icon" varchar(40) NOT NULL,
  "color" varchar(16) NOT NULL,
  -- Which built-in type this started as; "other" is the one that cannot go.
  "builtin" varchar(16),
  "position" integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS "ix_travel_activity_types_owner" ON "travel_activity_types" ("owner_user_id");

CREATE TABLE IF NOT EXISTS "travel_activities" (
  "id" varchar(36) PRIMARY KEY,
  "trip_id" varchar(36) NOT NULL REFERENCES "travel_trips" ("id") ON DELETE CASCADE,
  -- 1 is Day 1. Null is the Ideas column.
  "day" smallint,
  "position" integer NOT NULL DEFAULT 0,
  "title" text NOT NULL,
  "type_id" varchar(36) REFERENCES "travel_activity_types" ("id") ON DELETE SET NULL,
  -- "HH:MM", local time where the trip is.
  "start_time" varchar(5),
  "duration_minutes" integer,
  -- A stay longer than one night is drawn as a strip across its days.
  "nights" smallint,
  "place" jsonb,
  "opening_hours" jsonb,
  "website" text,
  "menu_url" text,
  "phone" varchar(40),
  "notes" text NOT NULL DEFAULT '',
  "confirmation" varchar(120),
  "booking_url" text,
  "booking" varchar(16),
  "cost_cents" bigint,
  "done" boolean NOT NULL DEFAULT false,
  "rating" smallint,
  "go_again" boolean NOT NULL DEFAULT false,
  "photo_url" text,
  "photo_credit" jsonb,
  -- In the bin since then; it can be put back for 30 days.
  "deleted_at" timestamptz,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  CONSTRAINT "travel_activities_start_time" CHECK ("start_time" IS NULL OR "start_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  CONSTRAINT "travel_activities_booking" CHECK ("booking" IS NULL OR "booking" IN ('booked', 'to_book')),
  CONSTRAINT "travel_activities_rating" CHECK ("rating" IS NULL OR "rating" BETWEEN 1 AND 5),
  CONSTRAINT "travel_activities_nights" CHECK ("nights" IS NULL OR "nights" BETWEEN 1 AND 60)
);

CREATE INDEX IF NOT EXISTS "ix_travel_activities_trip" ON "travel_activities" ("trip_id", "day", "position");

-- Files on an activity (tickets) or on the trip itself (passport, insurance).
CREATE TABLE IF NOT EXISTS "travel_files" (
  "id" varchar(36) PRIMARY KEY,
  "trip_id" varchar(36) NOT NULL REFERENCES "travel_trips" ("id") ON DELETE CASCADE,
  "activity_id" varchar(36) REFERENCES "travel_activities" ("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "url" text NOT NULL,
  "size_bytes" bigint NOT NULL,
  "content_type" varchar(120) NOT NULL,
  "created_at" timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS "ix_travel_files_trip" ON "travel_files" ("trip_id");

-- The packing list and the before-you-go to-dos, one table told apart by list.
CREATE TABLE IF NOT EXISTS "travel_checklist_items" (
  "id" varchar(36) PRIMARY KEY,
  "trip_id" varchar(36) NOT NULL REFERENCES "travel_trips" ("id") ON DELETE CASCADE,
  "list" varchar(16) NOT NULL,
  "text" varchar(300) NOT NULL,
  "done" boolean NOT NULL DEFAULT false,
  "due_date" date,
  "position" integer NOT NULL DEFAULT 0,
  CONSTRAINT "travel_checklist_items_list" CHECK ("list" IN ('packing', 'todo'))
);

CREATE INDEX IF NOT EXISTS "ix_travel_checklist_items_trip" ON "travel_checklist_items" ("trip_id", "list", "position");

-- One diary entry per day of a trip.
CREATE TABLE IF NOT EXISTS "travel_journal_entries" (
  "trip_id" varchar(36) NOT NULL REFERENCES "travel_trips" ("id") ON DELETE CASCADE,
  "day" smallint NOT NULL,
  "text" text NOT NULL DEFAULT '',
  "rating" smallint,
  "photos" text[] NOT NULL DEFAULT '{}',
  "updated_at" timestamptz NOT NULL,
  PRIMARY KEY ("trip_id", "day"),
  CONSTRAINT "travel_journal_entries_rating" CHECK ("rating" IS NULL OR "rating" BETWEEN 1 AND 10)
);

-- A person's favourite places, copied into a trip when used.
CREATE TABLE IF NOT EXISTS "travel_saved_places" (
  "id" varchar(36) PRIMARY KEY,
  "owner_user_id" varchar(36) NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "type_id" varchar(36) REFERENCES "travel_activity_types" ("id") ON DELETE SET NULL,
  "place" jsonb,
  "website" text,
  "menu_url" text,
  "phone" varchar(40),
  "notes" text NOT NULL DEFAULT '',
  "photo_url" text,
  "photo_credit" jsonb,
  "created_at" timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS "ix_travel_saved_places_owner" ON "travel_saved_places" ("owner_user_id");

-- Travel times Google answered, kept so a board only asks again when an
-- address changes.
CREATE TABLE IF NOT EXISTS "travel_route_times" (
  "from_key" text NOT NULL,
  "to_key" text NOT NULL,
  "mode" varchar(16) NOT NULL,
  "minutes" integer NOT NULL,
  "fetched_at" timestamptz NOT NULL,
  PRIMARY KEY ("from_key", "to_key", "mode")
);

-- People who have had the Tokyo sample trip, so a deleted one never returns.
CREATE TABLE IF NOT EXISTS "travel_sample_given" (
  "user_id" varchar(36) PRIMARY KEY REFERENCES "users" ("id") ON DELETE CASCADE,
  "given_at" timestamptz NOT NULL
);

-- Which menus already have the Trips link, so one removed by an admin stays removed.
CREATE TABLE IF NOT EXISTS "travel_navigation_added" (
  "scope" varchar(80) PRIMARY KEY,
  "added_at" timestamptz NOT NULL
);
