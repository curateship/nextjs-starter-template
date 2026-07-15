import pg from "pg"

import { getDatabaseUrl } from "@/server/db"
import type { WorkerKind } from "@/lib/workers"

const RETRY_MS = 5_000

export function workerLockKey(kind: WorkerKind) {
  if (kind === "bot") return "trading_worker_leader"
  if (kind === "market-scanner") return "market_scanner_worker_leader"
  return `trading_${kind.replaceAll("-", "_")}_worker_leader`
}

/**
 * Single-engine guarantee: a session-level Postgres advisory lock held on a
 * dedicated connection. Only the lock holder runs bots — a second worker
 * (rolling deploy, stray dev process) waits in standby until the leader's
 * connection drops, which releases the lock automatically.
 */
export async function acquireLeadership(kind: WorkerKind): Promise<pg.Client> {
  const lockKey = workerLockKey(kind)
  for (;;) {
    const client = new pg.Client({ connectionString: getDatabaseUrl() })
    try {
      await client.connect()
      const result = await client.query(
        "select pg_try_advisory_lock(hashtext($1)) as acquired",
        [lockKey]
      )
      if (result.rows[0]?.acquired) {
        client.on("error", () => {
          console.error(`${kind} worker: leadership lost; exiting for restart`)
          process.exit(1)
        })
        return client
      }
      await client.end()
      console.log(`${kind} worker: another process is leader; standing by…`)
    } catch (error) {
      await client.end().catch(() => {})
      console.error(`${kind} worker: leadership check failed; retrying`, error)
    }
    await new Promise((resolve) => setTimeout(resolve, RETRY_MS))
  }
}
