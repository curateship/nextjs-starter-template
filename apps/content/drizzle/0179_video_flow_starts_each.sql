-- Every starter flow is put in each person's Flows table once, not only the
-- first (Tyler, 14 Nov 2026: "the flows are the templates"). New flow makes
-- a blank canvas; a flow is built from another by duplicating its row.
--
-- `video_flow_starts` said "made" once per person; it now says it once per
-- person per starter, so deleting one never brings it back, and a starter
-- added later still arrives. The rows already there were Transcript to
-- video's.

ALTER TABLE "video_flow_starts" ADD COLUMN IF NOT EXISTS "starter" varchar(40) NOT NULL DEFAULT 'transcript';
ALTER TABLE "video_flow_starts" DROP CONSTRAINT IF EXISTS "video_flow_starts_pkey";
ALTER TABLE "video_flow_starts" ADD PRIMARY KEY ("user_id", "starter");
ALTER TABLE "video_flow_starts" ALTER COLUMN "starter" DROP DEFAULT;
UPDATE "video_flows" SET "starter" = 'transcript' WHERE "starter" = 'transcript-to-video';
