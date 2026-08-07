import { drizzle, type NodePgQueryResultHKT } from "drizzle-orm/node-postgres"
import type { PgDatabase } from "drizzle-orm/pg-core"
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

/**
 * Something you can run a query on: the shared pool handle below, or a
 * transaction opened from it.
 *
 * Deliberately not `typeof db`. That carried the pool itself on `$client`, and
 * a transaction has no pool — so every helper that took a database refused a
 * transaction, and the two call sites that pass one had to be left broken. No
 * code here reads `$client` (`notification-events.test.ts` checks that on
 * purpose), so nothing is lost by leaving it out.
 */
export type CustomShellDb = PgDatabase<NodePgQueryResultHKT, typeof schema>

export let db: CustomShellDb = drizzle(pool, { schema })

export function setDbForTests(nextDb: CustomShellDb) {
  db = nextDb
}
