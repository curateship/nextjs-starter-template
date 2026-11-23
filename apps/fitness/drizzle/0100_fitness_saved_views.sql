-- A person's own saved History filters on one program, named. Nobody else
-- sees them, a coach's views included. `filters` holds the same values the
-- address carries: q, name, status, exercise and group.
CREATE TABLE IF NOT EXISTS "fitness_saved_views" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "program_id" varchar(36) NOT NULL REFERENCES "fitness_programs" ("id") ON DELETE CASCADE,
  "name" varchar(60) NOT NULL,
  "filters" jsonb NOT NULL,
  "created_at" timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS "ix_fitness_saved_views_owner"
  ON "fitness_saved_views" ("user_id", "program_id");

-- A program's dashboard now keeps the open item in `?open=`, the address
-- every three-column dashboard uses. New-record notices sent before this
-- pointed at `?pick=`, so they are moved over and still open their lift.
UPDATE "fitness_notice_links"
  SET "href" = replace("href", '&pick=', '&open=')
  WHERE "href" LIKE '/programs/%&pick=%';
