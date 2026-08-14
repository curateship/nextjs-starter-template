CREATE TABLE "member_tags" (
  "user_id" varchar(36) NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "tag" varchar(100) NOT NULL,
  "created_at" timestamptz NOT NULL,
  CONSTRAINT "member_tags_pk" PRIMARY KEY ("user_id", "tag"),
  CONSTRAINT "member_tags_normalized_check" CHECK (
    "tag" = lower(trim("tag")) AND length("tag") BETWEEN 1 AND 100
    AND position(',' in "tag") = 0
  )
);
--> statement-breakpoint
CREATE INDEX "ix_member_tags_tag_user" ON "member_tags" ("tag", "user_id");
