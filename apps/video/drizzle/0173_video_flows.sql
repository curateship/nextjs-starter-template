-- Flow (workspace/tasks/flow/01-flow-dashboard.md, workspace/docs/flow.md).
-- Additions only.

-- A flow: a person's template of nodes and lines, drawn on a canvas. The
-- graph is the shell's automation canvas document (src/lib/automations/
-- graph.ts) holding Flow's own node kinds. "version" goes up with every save,
-- so a save sent from an older copy of the canvas is refused rather than
-- writing over a newer one.
--
--   starter   'transcript-to-video' for the starter flow, NULL for one the
--             person made. Only a label: editing it is like editing any flow.
CREATE TABLE IF NOT EXISTS "video_flows" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" varchar(120) NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "graph" jsonb NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "starter" varchar(40),
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);

CREATE INDEX IF NOT EXISTS "ix_video_flows_user"
  ON "video_flows" ("user_id", "updated_at");

-- When a person's starter flow was made. One row per person, so deleting the
-- starter never brings it back, as video_template_starts does for templates.
CREATE TABLE IF NOT EXISTS "video_flow_starts" (
  "user_id" varchar(36) PRIMARY KEY NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone NOT NULL
);

-- One run of a flow into a project. The run keeps its own copy of the graph,
-- so editing the flow never changes a run already going, and a run outlives
-- its flow being deleted.
--
--   video_id     The video the run added to the project when it started.
--   status       running, waiting, done, failed or stopped
--                (src/lib/video/flow/run-shape.ts).
--   lease_token  Held by the one worker making a step, so two never do.
CREATE TABLE IF NOT EXISTS "video_flow_runs" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "flow_id" varchar(36) REFERENCES "video_flows"("id") ON DELETE SET NULL,
  "flow_name" varchar(120) NOT NULL,
  "project_id" varchar(36) NOT NULL REFERENCES "video_projects"("id") ON DELETE CASCADE,
  "video_id" varchar(36) REFERENCES "video_project_videos"("id") ON DELETE SET NULL,
  "graph" jsonb NOT NULL,
  "status" varchar(12) NOT NULL,
  "error" text,
  "lease_token" varchar(36),
  "lease_expires_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  "finished_at" timestamp with time zone,
  CONSTRAINT "video_flow_runs_status_check"
    CHECK ("status" IN ('running', 'waiting', 'done', 'failed', 'stopped'))
);

CREATE INDEX IF NOT EXISTS "ix_video_flow_runs_user"
  ON "video_flow_runs" ("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "ix_video_flow_runs_flow"
  ON "video_flow_runs" ("flow_id");
CREATE INDEX IF NOT EXISTS "ix_video_flow_runs_status"
  ON "video_flow_runs" ("status");

-- One row per node of a run.
--
--   position       Its place in the run's order (src/lib/video/flow/advance.ts).
--   status         waiting, needs_input, queued, working, needs_ok, done or
--                  failed.
--   input          What the person gave an asking step.
--   output         What the step made, handed to every node with a line from it.
--   prompt_sent    The whole text an AI step was sent, so it can be read back.
--   estimate_cents About what the step costs, worked out before it runs.
--   cost_cents     What the meter recorded for it.
--   wake_at        A queued step the worker leaves until then, such as an AI
--                  video waiting for a big upload's smooth copy.
--   note           Why it is waiting, shown on the steps page.
CREATE TABLE IF NOT EXISTS "video_flow_run_steps" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "run_id" varchar(36) NOT NULL REFERENCES "video_flow_runs"("id") ON DELETE CASCADE,
  "node_id" varchar(64) NOT NULL,
  "kind" varchar(64) NOT NULL,
  "position" integer NOT NULL,
  "status" varchar(12) NOT NULL,
  "input" jsonb,
  "output" jsonb,
  "prompt_sent" text,
  "estimate_cents" integer,
  "cost_cents" integer,
  "error" text,
  "attempts" integer DEFAULT 0 NOT NULL,
  "wake_at" timestamp with time zone,
  "note" text,
  "started_at" timestamp with time zone,
  "finished_at" timestamp with time zone,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "video_flow_run_steps_status_check"
    CHECK ("status" IN ('waiting', 'needs_input', 'queued', 'working', 'needs_ok', 'done', 'failed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "ux_video_flow_run_steps_node"
  ON "video_flow_run_steps" ("run_id", "node_id");
