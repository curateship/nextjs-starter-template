import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"

import { installNetworkErrorGuard } from "@/server/net-guard"
import * as schema from "@/server/schema"

// Loaded by every server path that touches the DB, so this is a reliable place
// to arm the process-wide guard against benign transient socket resets.
installNetworkErrorGuard()

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

// An idle pooled connection dying (remote reset, dropped NAT mapping) emits
// "error" on the pool; without a handler that's an uncaught exception that
// crashes the process. The pool replaces the dead client on the next query.
pool.on("error", (error) => {
  console.error("pg pool idle client error:", error.message)
})

export let db = drizzle(pool, { schema })
export type CustomShellDb = typeof db

export function setDbForTests(nextDb: CustomShellDb) {
  db = nextDb
}
