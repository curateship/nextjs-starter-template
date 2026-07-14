import pg from "pg"

import { getDatabaseUrl } from "@/server/db"

const LOCK_KEY = "market_scanner_worker_leader"
const RETRY_MS = 5_000

export async function acquireMarketScannerLeadership(): Promise<pg.Client> {
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
          console.error("market scanner leadership lost; exiting for restart")
          process.exit(1)
        })
        return client
      }
      await client.end()
      console.log("another market scanner holds the leader lock; standing by…")
    } catch (error) {
      await client.end().catch(() => {})
      console.error("market scanner leadership check failed; retrying", error)
    }
    await new Promise((resolve) => setTimeout(resolve, RETRY_MS))
  }
}
