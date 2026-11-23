import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"

import * as schema from "@/server/schema"

const LOCAL_DATABASE_URL = `postgresql://postgres:localdev@localhost:${process.env.CUSTOM_SHELL_POSTGRES_PORT || "54320"}/custom_shell`

export function getDatabaseUrl() {
  return process.env.CUSTOM_SHELL_DATABASE_URL || LOCAL_DATABASE_URL
}

const pool = new Pool({
  connectionString: getDatabaseUrl(),
  max: Number.parseInt(process.env.CUSTOM_SHELL_PGPOOL_MAX || "10", 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
})

export let db = drizzle(pool, { schema })
export type CustomShellDb = typeof db

export function setDbForTests(nextDb: CustomShellDb) {
  db = nextDb
}
