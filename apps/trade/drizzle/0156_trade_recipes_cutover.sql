-- Move every drawing that contains a Trade step. The graph is the draft the
-- editor saves, including invalid drafts whose compiled_config is null.
INSERT INTO "trade_recipes" (
  "id",
  "workspace_id",
  "user_id",
  "name",
  "graph",
  "compiled_config",
  "created_at",
  "updated_at"
)
SELECT
  "id",
  "workspace_id",
  "user_id",
  "name",
  "graph",
  "compiled_config",
  "created_at",
  "updated_at"
FROM "automations"
WHERE jsonb_path_exists(
  "graph",
  '$.nodes[*] ? (@.kind == "tradeWallet" || @.kind == "tradeMarkets" || @.kind == "tradeDca" || @.kind == "tradeSignals" || @.kind == "tradeGrid")'
);

-- Point live runs at the copied recipe before the Automations row is removed.
-- Keeping the cascade means a stopped recipe still cleans up its old run rows;
-- the application refuses deletion while a run is live.
ALTER TABLE "trade_flow_runs"
  DROP CONSTRAINT IF EXISTS "trade_flow_runs_automation_fk";

ALTER TABLE "trade_flow_runs"
  ADD CONSTRAINT "trade_flow_runs_recipe_fk"
  FOREIGN KEY ("automation_id")
  REFERENCES "trade_recipes"("id") ON DELETE CASCADE;

DELETE FROM "automations"
WHERE jsonb_path_exists(
  "graph",
  '$.nodes[*] ? (@.kind == "tradeWallet" || @.kind == "tradeMarkets" || @.kind == "tradeDca" || @.kind == "tradeSignals" || @.kind == "tradeGrid")'
);
