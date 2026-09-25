-- Trade's own tables start at 0100. The shell numbers its migrations 00xx and
-- the runner applies this folder in filename order, so the gap keeps a future
-- shell merge from ever colliding with an app migration or running after one
-- it should have preceded.
CREATE TABLE IF NOT EXISTS "trade_market_favorites" (
  "user_id" varchar(36) PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "market_keys" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
