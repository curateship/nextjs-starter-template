import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"

import * as schema from "@/server/schema"

const LOCAL_DATABASE_URL = `postgresql://postgres:localdev@localhost:${process.env.POMODER_POSTGRES_PORT || "54326"}/pomoder`

export function getDatabaseUrl() {
  return process.env.POMODER_DATABASE_URL || LOCAL_DATABASE_URL
}

export const pool = new Pool({
  connectionString: getDatabaseUrl(),
  max: Number.parseInt(process.env.POMODER_PGPOOL_MAX || "10", 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
})

export let db = drizzle(pool, { schema })
export type PomoderDb = typeof db
export type CustomShellDb = PomoderDb

export function setDbForTests(nextDb: PomoderDb) {
  db = nextDb
}
