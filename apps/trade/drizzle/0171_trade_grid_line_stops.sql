CREATE TABLE IF NOT EXISTS "trade_grid_line_stops" (
  "user_id" varchar(36) NOT NULL,
  "grid_id" varchar(36) NOT NULL,
  "drawing_id" varchar(36) NOT NULL,
  "armed_at" double precision NOT NULL,
  "state" varchar(12) NOT NULL DEFAULT 'watching',
  "fired_at" double precision,
  "line_price" double precision,
  "threshold" double precision,
  "completed_at" timestamp with time zone,
  "expected_close_sz" double precision,
  "close_confirmed" boolean NOT NULL DEFAULT false,
  "close_started_at" timestamp with time zone,
  PRIMARY KEY ("user_id", "grid_id", "drawing_id", "armed_at"),
  FOREIGN KEY ("user_id", "grid_id") REFERENCES "trade_smart_ladders" ("user_id", "id") ON DELETE CASCADE,
  CONSTRAINT "trade_grid_line_stops_state_check" CHECK ("state" IN ('watching', 'pending', 'done', 'released'))
);
CREATE INDEX IF NOT EXISTS "trade_grid_line_stops_drawing_idx"
  ON "trade_grid_line_stops" ("user_id", "drawing_id") WHERE "state" IN ('watching', 'pending');

-- Serialize attachment, firing and every destructive drawing mutation per
-- account. Wallet writers already hold their wallet lock before this lock.
-- These triggers never acquire a wallet lock or update a grid plan.
CREATE OR REPLACE FUNCTION trade_grid_line_stop_plan() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  link jsonb;
  drawing trade_chart_drawings%ROWTYPE;
BEGIN
  link := NEW.plan->'lineStop';
  IF (link IS NULL OR link = 'null'::jsonb) AND
     (TG_OP = 'INSERT' OR OLD.plan->'lineStop' IS NULL OR OLD.plan->'lineStop' = 'null'::jsonb) THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('grid-line-stop:' || NEW.user_id, 0));
  IF EXISTS (SELECT 1 FROM trade_grid_line_stops WHERE user_id = NEW.user_id AND grid_id = NEW.id AND state = 'pending') THEN
    IF NEW.status <> 'active' OR NEW.plan->'lineStop' IS DISTINCT FROM OLD.plan->'lineStop' THEN
      RAISE EXCEPTION 'SMART_GRID_LINE_STOP_PENDING';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.status = 'active' AND link IS NOT NULL AND link <> 'null'::jsonb THEN
    IF NEW.kind <> 'grid' OR NEW.flow_run_id IS NOT NULL THEN
      RAISE EXCEPTION 'SMART_GRID_LINE_STOP_MANUAL';
    END IF;
    SELECT * INTO drawing FROM trade_chart_drawings
      WHERE user_id = NEW.user_id AND id = link->>'drawingId';
    IF NOT FOUND OR drawing.market_key <> NEW.market_key OR
       drawing.shape->>'kind' NOT IN ('level', 'trendline') OR
       drawing.alert IS NULL OR drawing.alert->>'firedAt' IS NOT NULL OR
       (drawing.alert->>'armedAt')::double precision IS DISTINCT FROM (link->>'armedAt')::double precision THEN
      RAISE EXCEPTION 'SMART_GRID_LINE_STOP_UNAVAILABLE';
    END IF;
    IF EXISTS (SELECT 1 FROM trade_prefs WHERE user_id = NEW.user_id AND line_alerts_paused) THEN
      RAISE EXCEPTION 'SMART_GRID_LINE_STOP_PAUSED';
    END IF;
    IF EXISTS (SELECT 1 FROM trade_smart_ladders WHERE user_id = NEW.user_id AND wallet_id = NEW.wallet_id
      AND market_key = NEW.market_key AND status = 'active' AND kind = 'dca') THEN
      RAISE EXCEPTION 'SMART_GRID_LINE_STOP_PAIRED';
    END IF;
    INSERT INTO trade_grid_line_stops (user_id, grid_id, drawing_id, armed_at)
      VALUES (NEW.user_id, NEW.id, link->>'drawingId', (link->>'armedAt')::double precision)
      ON CONFLICT (user_id, grid_id, drawing_id, armed_at) DO UPDATE SET state = 'watching'
      WHERE trade_grid_line_stops.state = 'released';
  END IF;
  UPDATE trade_grid_line_stops SET state = 'released'
    WHERE user_id = NEW.user_id AND grid_id = NEW.id AND state = 'watching'
      AND (NEW.status <> 'active' OR link IS NULL OR link = 'null'::jsonb OR
        drawing_id <> link->>'drawingId' OR armed_at <> (link->>'armedAt')::double precision);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trade_grid_line_stop_plan ON trade_smart_ladders;
CREATE TRIGGER trade_grid_line_stop_plan AFTER INSERT OR UPDATE ON trade_smart_ladders
  FOR EACH ROW EXECUTE FUNCTION trade_grid_line_stop_plan();

CREATE OR REPLACE FUNCTION trade_grid_line_stop_drawing() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  linked_grid text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('grid-line-stop:' || OLD.user_id, 0));
  SELECT regexp_replace(g.market_key, '^[^:]+:[^:]+:', '') || ' in ' || w.label INTO linked_grid
    FROM trade_grid_line_stops s JOIN trade_smart_ladders g ON g.user_id = s.user_id AND g.id = s.grid_id
    JOIN trade_wallets w ON w.user_id = g.user_id AND w.id = g.wallet_id
    WHERE s.user_id = OLD.user_id AND s.drawing_id = OLD.id AND s.state IN ('watching', 'pending') LIMIT 1;
  IF linked_grid IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'SMART_GRID_LINE_STOP_LINKED:%', linked_grid; END IF;
  IF NEW.market_key <> OLD.market_key OR NEW.alert IS NULL OR
     NEW.shape->>'kind' NOT IN ('level', 'trendline') OR
     NEW.alert->>'armedAt' IS DISTINCT FROM OLD.alert->>'armedAt' OR
     (OLD.alert->>'firedAt' IS NOT NULL AND NEW.alert->>'firedAt' IS DISTINCT FROM OLD.alert->>'firedAt') OR
     (NEW.shape->>'kind' = 'trendline' AND NEW.shape->'from'->>'time' = NEW.shape->'to'->>'time') THEN
    RAISE EXCEPTION 'SMART_GRID_LINE_STOP_LINKED:%', linked_grid;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trade_grid_line_stop_drawing ON trade_chart_drawings;
CREATE TRIGGER trade_grid_line_stop_drawing BEFORE UPDATE OR DELETE ON trade_chart_drawings
  FOR EACH ROW EXECUTE FUNCTION trade_grid_line_stop_drawing();

-- Copy the firing engine's measured threshold, never calculate a second cross.
CREATE OR REPLACE FUNCTION trade_grid_line_stop_fire() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.alert->>'firedAt' IS NULL AND NEW.alert->>'firedAt' IS NOT NULL THEN
    IF NEW.alert->>'firedThreshold' IS NULL AND EXISTS (
      SELECT 1 FROM trade_grid_line_stops WHERE user_id = NEW.user_id AND drawing_id = NEW.id AND state = 'watching'
    ) THEN RAISE EXCEPTION 'SMART_GRID_LINE_STOP_ENGINE'; END IF;
    UPDATE trade_grid_line_stops SET state = 'pending',
      fired_at = (NEW.alert->>'firedAt')::double precision,
      line_price = (NEW.alert->>'firedPrice')::double precision,
      threshold = (NEW.alert->>'firedThreshold')::double precision
      WHERE user_id = NEW.user_id AND drawing_id = NEW.id AND armed_at = (NEW.alert->>'armedAt')::double precision
        AND state = 'watching';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trade_grid_line_stop_fire ON trade_chart_drawings;
CREATE TRIGGER trade_grid_line_stop_fire AFTER UPDATE ON trade_chart_drawings
  FOR EACH ROW EXECUTE FUNCTION trade_grid_line_stop_fire();

CREATE OR REPLACE FUNCTION trade_grid_line_stop_pause() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE linked_grid text;
BEGIN
  IF NEW.line_alerts_paused THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('grid-line-stop:' || NEW.user_id, 0));
    SELECT regexp_replace(g.market_key, '^[^:]+:[^:]+:', '') || ' in ' || w.label INTO linked_grid
      FROM trade_grid_line_stops s JOIN trade_smart_ladders g ON g.user_id = s.user_id AND g.id = s.grid_id
      JOIN trade_wallets w ON w.user_id = g.user_id AND w.id = g.wallet_id
      WHERE s.user_id = NEW.user_id AND s.state IN ('watching', 'pending') LIMIT 1;
    IF linked_grid IS NOT NULL THEN
      RAISE EXCEPTION 'SMART_GRID_LINE_STOP_LINKED:%', linked_grid;
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trade_grid_line_stop_pause ON trade_prefs;
CREATE TRIGGER trade_grid_line_stop_pause BEFORE INSERT OR UPDATE ON trade_prefs
  FOR EACH ROW EXECUTE FUNCTION trade_grid_line_stop_pause();
