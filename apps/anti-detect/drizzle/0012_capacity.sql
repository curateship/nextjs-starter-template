-- Capacity inventory and launch budgets.

CREATE TABLE IF NOT EXISTS "nodes" (
  "id" varchar(255) PRIMARY KEY NOT NULL,
  "label" varchar(255) NOT NULL,
  "total_ram_mb" integer NOT NULL,
  "total_vcpu" integer NOT NULL,
  "status" varchar(20) NOT NULL,
  CONSTRAINT "nodes_total_ram_check" CHECK ("total_ram_mb" > 0),
  CONSTRAINT "nodes_total_vcpu_check" CHECK ("total_vcpu" > 0),
  CONSTRAINT "nodes_status_check" CHECK ("status" in ('active', 'draining', 'offline'))
);

CREATE TABLE IF NOT EXISTS "capacity_config" (
  "key" text PRIMARY KEY NOT NULL,
  "per_user_concurrency_cap" integer NOT NULL,
  "profile_ram_mb" integer NOT NULL,
  "profile_vcpu_millicores" integer NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "capacity_config_default_key" CHECK ("key" = 'default'),
  CONSTRAINT "capacity_config_user_cap_check" CHECK ("per_user_concurrency_cap" > 0),
  CONSTRAINT "capacity_config_profile_ram_check" CHECK ("profile_ram_mb" > 0),
  CONSTRAINT "capacity_config_profile_vcpu_check" CHECK ("profile_vcpu_millicores" > 0)
);

INSERT INTO "nodes" ("id", "label", "total_ram_mb", "total_vcpu", "status")
VALUES ('local', 'Local', 8192, 4, 'active')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "capacity_config" (
  "key",
  "per_user_concurrency_cap",
  "profile_ram_mb",
  "profile_vcpu_millicores",
  "created_at",
  "updated_at"
)
VALUES ('default', 5, 1536, 500, NOW(), NOW())
ON CONFLICT ("key") DO NOTHING;
