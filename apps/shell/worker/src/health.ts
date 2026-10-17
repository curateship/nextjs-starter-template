/**
 * Is this worker container well? Two questions, both of which have to be yes.
 *
 * 1. **Is its loop moving?** The worker writes a heartbeat after every pass;
 *    a missing or old one means the loop has stopped even though the process
 *    is technically still alive.
 * 2. **Does its database answer?** A worker that cannot reach the database
 *    completes passes that do nothing, so a moving loop on its own is not
 *    proof of anything.
 *
 * Run by Docker's HEALTHCHECK: `node worker/dist/health.mjs`. It prints one
 * short line and exits 0 for healthy, 1 for not. **It never prints the
 * connection string, the database host, or the underlying driver error** —
 * container health output is widely readable and is not the place to leak
 * where the database lives or what its credentials failed on.
 */

import { Client } from "pg"

// `@/server/database-url` and not `@/server/db`: the latter opens a connection
// pool as it loads, so a missing address would throw before a line of this file
// ran — printing a stack trace with the real error in it, which is exactly what
// the note above says this must never do.
import { getDatabaseUrl } from "@/server/database-url"
import { HEARTBEAT_STALE_MS, heartbeatAgeMs } from "@/server/worker-heartbeat"

/** Long enough that a database blinking does not fail an otherwise fine worker. */
const DATABASE_TIMEOUT_MS = 5_000

async function databaseAnswers(): Promise<boolean> {
  let url: string
  try {
    url = getDatabaseUrl()
  } catch {
    console.error("Worker unhealthy: no database is configured")
    return false
  }

  const client = new Client({
    connectionString: url,
    connectionTimeoutMillis: DATABASE_TIMEOUT_MS,
    query_timeout: DATABASE_TIMEOUT_MS,
  })
  try {
    await client.connect()
    await client.query("select 1")
    return true
  } catch {
    console.error("Worker unhealthy: the database did not answer")
    return false
  } finally {
    await client.end().catch(() => {})
  }
}

async function loopIsMoving(): Promise<boolean> {
  const age = await heartbeatAgeMs()
  if (age === null) {
    console.error("Worker unhealthy: it has not reported a pass yet")
    return false
  }
  if (age > HEARTBEAT_STALE_MS) {
    console.error(
      `Worker unhealthy: last pass was ${Math.round(age / 1000)}s ago, over the ${HEARTBEAT_STALE_MS / 1000}s limit`
    )
    return false
  }
  return true
}

// Both checks run before the answer, so an unhealthy container says everything
// that is wrong with it rather than only the first thing.
const [moving, answering] = await Promise.all([loopIsMoving(), databaseAnswers()])

if (moving && answering) {
  console.log("Worker healthy")
  process.exit(0)
}

process.exit(1)
