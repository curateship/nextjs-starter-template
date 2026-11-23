-- Features 16 Oct 2026.

-- Part 2: "Milestone due tomorrow" in the bell of the project's lead, or of
-- the owner and admins when it has no lead. One row per person per milestone
-- per date, written in the same transaction as the notice, so a moved date
-- sends a fresh one and two passes send one.
CREATE TABLE IF NOT EXISTS "project_milestone_reminders" (
  "milestone_id" varchar(36) NOT NULL REFERENCES "project_milestones" ("id") ON DELETE CASCADE,
  "user_id" varchar(36) NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "due_date" date NOT NULL,
  "sent_at" timestamptz NOT NULL,
  PRIMARY KEY ("milestone_id", "user_id", "due_date")
);

-- Part 5: My dashboard and the Team dashboard update by themselves. Tasks
-- already say "project P changed" on "project_live" (0109). What belongs to
-- the team rather than one task says "team T changed" on
-- "project_team_live": check-ins, meetings and their answers and notes, time
-- off, holidays, the members, the team itself (its announcement), and its
-- projects and their milestones (status, lead, due dates). The payload is the
-- team's id, never any words; the browser loads the page again the normal
-- way, which checks what it may see.
CREATE OR REPLACE FUNCTION "project_team_live_say"(team_id varchar)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF team_id IS NOT NULL THEN
    PERFORM pg_notify('project_team_live', team_id);
  END IF;
END;
$$;

-- For a table with a "team_id".
CREATE OR REPLACE FUNCTION "project_team_live_row_changed"()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  row_now record;
BEGIN
  IF TG_OP = 'DELETE' THEN row_now := OLD; ELSE row_now := NEW; END IF;
  PERFORM "project_team_live_say"(row_now."team_id");
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION "project_team_live_team_changed"()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  row_now record;
BEGIN
  IF TG_OP = 'DELETE' THEN row_now := OLD; ELSE row_now := NEW; END IF;
  PERFORM "project_team_live_say"(row_now."id");
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION "project_team_live_milestone_changed"()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  row_now record;
BEGIN
  IF TG_OP = 'DELETE' THEN row_now := OLD; ELSE row_now := NEW; END IF;
  PERFORM "project_team_live_say"(
    (SELECT p."team_id" FROM "project_projects" p WHERE p."id" = row_now."project_id")
  );
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION "project_team_live_checkin_item_changed"()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  row_now record;
BEGIN
  IF TG_OP = 'DELETE' THEN row_now := OLD; ELSE row_now := NEW; END IF;
  PERFORM "project_team_live_say"(
    (SELECT c."team_id" FROM "project_checkins" c WHERE c."id" = row_now."checkin_id")
  );
  RETURN NULL;
END;
$$;

-- For a table with a "meeting_id": who is invited, answers and notes.
CREATE OR REPLACE FUNCTION "project_team_live_meeting_part_changed"()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  row_now record;
BEGIN
  IF TG_OP = 'DELETE' THEN row_now := OLD; ELSE row_now := NEW; END IF;
  PERFORM "project_team_live_say"(
    (SELECT m."team_id" FROM "project_meetings" m WHERE m."id" = row_now."meeting_id")
  );
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS "project_team_live_checkins" ON "project_checkins";
CREATE TRIGGER "project_team_live_checkins"
  AFTER INSERT OR UPDATE OR DELETE ON "project_checkins"
  FOR EACH ROW EXECUTE FUNCTION "project_team_live_row_changed"();

DROP TRIGGER IF EXISTS "project_team_live_checkin_items" ON "project_checkin_items";
CREATE TRIGGER "project_team_live_checkin_items"
  AFTER INSERT OR UPDATE OR DELETE ON "project_checkin_items"
  FOR EACH ROW EXECUTE FUNCTION "project_team_live_checkin_item_changed"();

DROP TRIGGER IF EXISTS "project_team_live_meetings" ON "project_meetings";
CREATE TRIGGER "project_team_live_meetings"
  AFTER INSERT OR UPDATE OR DELETE ON "project_meetings"
  FOR EACH ROW EXECUTE FUNCTION "project_team_live_row_changed"();

DROP TRIGGER IF EXISTS "project_team_live_meeting_people" ON "project_meeting_people";
CREATE TRIGGER "project_team_live_meeting_people"
  AFTER INSERT OR UPDATE OR DELETE ON "project_meeting_people"
  FOR EACH ROW EXECUTE FUNCTION "project_team_live_meeting_part_changed"();

DROP TRIGGER IF EXISTS "project_team_live_meeting_answers" ON "project_meeting_answers";
CREATE TRIGGER "project_team_live_meeting_answers"
  AFTER INSERT OR UPDATE OR DELETE ON "project_meeting_answers"
  FOR EACH ROW EXECUTE FUNCTION "project_team_live_meeting_part_changed"();

DROP TRIGGER IF EXISTS "project_team_live_meeting_notes" ON "project_meeting_notes";
CREATE TRIGGER "project_team_live_meeting_notes"
  AFTER INSERT OR UPDATE OR DELETE ON "project_meeting_notes"
  FOR EACH ROW EXECUTE FUNCTION "project_team_live_meeting_part_changed"();

DROP TRIGGER IF EXISTS "project_team_live_time_off" ON "project_time_off";
CREATE TRIGGER "project_team_live_time_off"
  AFTER INSERT OR UPDATE OR DELETE ON "project_time_off"
  FOR EACH ROW EXECUTE FUNCTION "project_team_live_row_changed"();

DROP TRIGGER IF EXISTS "project_team_live_holidays" ON "project_team_holidays";
CREATE TRIGGER "project_team_live_holidays"
  AFTER INSERT OR UPDATE OR DELETE ON "project_team_holidays"
  FOR EACH ROW EXECUTE FUNCTION "project_team_live_row_changed"();

DROP TRIGGER IF EXISTS "project_team_live_members" ON "project_team_members";
CREATE TRIGGER "project_team_live_members"
  AFTER INSERT OR UPDATE OR DELETE ON "project_team_members"
  FOR EACH ROW EXECUTE FUNCTION "project_team_live_row_changed"();

DROP TRIGGER IF EXISTS "project_team_live_teams" ON "project_teams";
CREATE TRIGGER "project_team_live_teams"
  AFTER UPDATE ON "project_teams"
  FOR EACH ROW EXECUTE FUNCTION "project_team_live_team_changed"();

DROP TRIGGER IF EXISTS "project_team_live_projects" ON "project_projects";
CREATE TRIGGER "project_team_live_projects"
  AFTER INSERT OR UPDATE OR DELETE ON "project_projects"
  FOR EACH ROW EXECUTE FUNCTION "project_team_live_row_changed"();

DROP TRIGGER IF EXISTS "project_team_live_milestones" ON "project_milestones";
CREATE TRIGGER "project_team_live_milestones"
  AFTER INSERT OR UPDATE OR DELETE ON "project_milestones"
  FOR EACH ROW EXECUTE FUNCTION "project_team_live_milestone_changed"();
