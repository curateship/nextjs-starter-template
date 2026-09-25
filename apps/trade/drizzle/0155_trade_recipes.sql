CREATE TABLE "trade_recipes" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "workspace_id" varchar(36) NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "user_id" varchar(36) REFERENCES "users"("id") ON DELETE SET NULL,
  "name" varchar(80) NOT NULL,
  "graph" jsonb NOT NULL,
  "compiled_config" jsonb,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);

CREATE UNIQUE INDEX "ux_trade_recipes_workspace_name"
  ON "trade_recipes" ("workspace_id", "name");

CREATE INDEX "ix_trade_recipes_workspace_updated"
  ON "trade_recipes" ("workspace_id", "updated_at");
