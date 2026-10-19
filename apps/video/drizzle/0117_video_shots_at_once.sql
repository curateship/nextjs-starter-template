-- Several AI shots at once (task features/32).
--
-- Until now a project could make one AI shot at a time: the partial unique
-- index below allowed one row at 'queued' or 'processing' per project. Trying
-- three directions for the same first frame meant waiting through them one
-- after another, several minutes each.
--
-- The caps, and why there are any:
--
--   3 shots at once in one project.
--   6 shots at once across all of one person's projects.
--
-- Google charges for a shot when it arrives, not when it is asked for, so a
-- shot being made is money already promised but not yet on the meter. A
-- loosened limit with no cap would let a run of presses promise far more than
-- anyone added up. Six 32 second shots is 6 x $12.80 = $76.80 promised at once,
-- which is the most this allows. The app checks the same two numbers first
-- (SHOTS_AT_ONCE_PER_PROJECT and SHOTS_AT_ONCE_PER_PERSON in
-- src/lib/video/asset-factories.ts) so a person sees the reason in words; this
-- trigger is what makes two presses landing together unable to both get in.
--
-- A shot counts while one of its pieces is 'queued' or 'processing'. A shot's
-- pieces run one after another, so it never has two such rows. A shot stopped
-- by a failed piece holds no place until Try again queues it, and Try again is
-- refused the same way when the project is full.

DROP INDEX IF EXISTS "ux_video_ai_generations_project_active";

CREATE OR REPLACE FUNCTION video_ai_generations_shots_at_once() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  project_running integer;
  person_running integer;
BEGIN
  -- A piece moving from 'queued' to 'processing' was already counted.
  IF TG_OP = 'UPDATE' AND OLD.status IN ('queued', 'processing') THEN
    RETURN NEW;
  END IF;
  -- One person's rows wait for each other here until the transaction ends,
  -- so two presses at the same moment cannot both count a free place. The
  -- count below runs after the wait, so it sees the other press's row.
  PERFORM pg_advisory_xact_lock(hashtext('video_ai_generations:' || NEW.user_id));
  SELECT
    count(*) FILTER (WHERE project_id = NEW.project_id),
    count(*)
  INTO project_running, person_running
  FROM video_ai_generations
  WHERE user_id = NEW.user_id
    AND status IN ('queued', 'processing')
    AND id <> NEW.id;
  IF project_running >= 3 THEN
    RAISE EXCEPTION 'This project is already making 3 shots. Wait for one to finish.';
  END IF;
  IF person_running >= 6 THEN
    RAISE EXCEPTION 'You are already making 6 shots across your projects. Wait for one to finish.';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS "video_ai_generations_shots_at_once" ON "video_ai_generations";
CREATE TRIGGER "video_ai_generations_shots_at_once"
  BEFORE INSERT OR UPDATE OF "status" ON "video_ai_generations"
  FOR EACH ROW
  WHEN (NEW.status IN ('queued', 'processing'))
  EXECUTE FUNCTION video_ai_generations_shots_at_once();

-- The worker and the "how many are running" counts read by person.
CREATE INDEX IF NOT EXISTS "ix_video_ai_generations_user_running"
  ON "video_ai_generations" ("user_id", "project_id")
  WHERE "status" IN ('queued', 'processing');
