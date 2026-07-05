import pg from "pg"

import { getDatabaseUrl } from "@/server/db"

const LOCK_KEY = "trading_worker_leader"
const RETRY_MS = 5_000

/**
 * Single-engine guarantee: a session-level Postgres advisory lock held on a
 * dedicated connection. Only the lock holder runs bots — a second worker
 * (rolling deploy, stray dev process) waits in standby until the leader's
 * connection drops, which releases the lock automatically.
 */
export async function acquireLeadership(): Promise<pg.Client> {
  for (;;) {
    const client = new pg.Client({ connectionString: getDatabaseUrl() })
    try {
      await client.connect()
      const result = await client.query(
        "select pg_try_advisory_lock(hashtext($1)) as acquired",
        [LOCK_KEY]
      )
      if (result.rows[0]?.acquired) {
        client.on("error", () => {
          console.error("leadership connection lost; exiting for restart")
          process.exit(1)
        })
        return client
      }
      await client.end()
      console.log("another worker holds the leader lock; standing by…")
    } catch (error) {
      await client.end().catch(() => {})
      console.error("leadership check failed; retrying", error)
    }
    await new Promise((resolve) => setTimeout(resolve, RETRY_MS))
  }
}
