import { drizzle, type NodePgQueryResultHKT } from "drizzle-orm/node-postgres"
import type { PgDatabase } from "drizzle-orm/pg-core"
import { Pool } from "pg"

import { getDatabaseUrl } from "@/server/database-url"
import * as schema from "@/server/schema"

// Re-exported so the many callers that already ask `db.ts` for the address keep
// working. Anything that wants only the address — no pool — should import
// `@/server/database-url` directly.
export { getDatabaseUrl }

const pool = new Pool({
  connectionString: getDatabaseUrl(),
  max: Number.parseInt(process.env.CUSTOM_SHELL_PGPOOL_MAX || "10", 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
})

/**
 * A connection dropped while nobody was using it, which must not take the app
 * down with it.
 *
 * Connections wait in the pool between queries, and something on the other end
 * eventually lets one go — the database restarting, a container's network
 * blinking, an idle timeout further along the wire. The pool's answer is to
 * throw that connection away, which is right, and to announce it, which is also
 * right. **Nothing was listening.** In Node an announced error with no listener
 * is not an announcement, it is an uncaught exception — so one dropped spare
 * connection took the whole server down with a bare "read ECONNRESET" and not a
 * line of application code anywhere in the trace.
 *
 * It turned up on long jobs, and that is the tell rather than a coincidence: a
 * pass that works for minutes leaves its spare connections untouched for
 * exactly that long, which is what gives the other end time to hang up.
 *
 * There is nothing to repair here. The pool has already discarded the
 * connection and the next query opens a fresh one, so this only has to say what
 * happened loudly enough to be found afterwards.
 */
pool.on("error", (error) => {
  console.error("Idle database connection dropped", error)
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
