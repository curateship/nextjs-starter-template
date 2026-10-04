-- Approval notices only make sense while their automation still exists.
-- Older databases could retain a run after its automation was deleted, which
-- left an unopenable "Deleted flow" notice behind. Clear those existing rows;
-- the application delete path now removes future notices explicitly.
DELETE FROM "notifications" AS "notification"
WHERE "notification"."type" = 'automation_approval'
  AND (
    "notification"."automation_run_id" IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM "automation_runs" AS "run"
      INNER JOIN "automations" AS "automation"
        ON "automation"."id" = "run"."automation_id"
      WHERE "run"."id" = "notification"."automation_run_id"
    )
  );
