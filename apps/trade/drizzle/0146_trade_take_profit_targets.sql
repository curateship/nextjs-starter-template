-- Up to three fixed-size take-profit orders on one practice position.
--
-- The old columns mirror the first target for one release. Existing positions
-- keep their current target when this column arrives.
ALTER TABLE "trade_paper_positions"
  ADD COLUMN IF NOT EXISTS "targets" jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE "trade_paper_positions"
SET "targets" = jsonb_build_array(
  jsonb_build_object(
    'px', "tp_px",
    'sz', "tp_sz",
    'orderId', NULL
  )
)
WHERE "tp_px" IS NOT NULL
  AND "targets" = '[]'::jsonb;
