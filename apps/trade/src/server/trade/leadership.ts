import { Client } from "pg"

import { getDatabaseUrl } from "@/server/db"

/**
 * Only one copy of the trading engine is ever allowed to trade.
 *
 * Two copies would not be twice as fast, they would be twice the position:
 * both would see the same rung waiting, both would place its buy, and the
 * account would be in double what the ladder asked for. A deploy that starts
 * the new container before stopping the old one does exactly this, and so does
 * a person running the app locally while the server is up.
 *
 * The lock is Postgres's own advisory lock, which is the right tool for one
 * reason: **it is held by a connection, not written down.** A row saying "I am
 * the leader" survives the process that wrote it, so a crash leaves a lock
 * nobody holds and the fix is a timeout that is either too slow to fail over
 * or too quick to be safe. A connection dying releases the lock at once,
 * whatever killed it.
 *
 * That is also why this opens a connection of its own rather than using the
 * pool. A pooled connection goes back to the pool after the query, and the
 * lock goes with it.
 */

/** Any number, as long as nothing else in this database picks the same one. */
const TRADE_ENGINE_LOCK = 8_140_233

export type Leadership = {
  /** True when this process holds the lock and may trade. */
  readonly held: boolean
  release: () => Promise<void>
}

/**
 * Take the lock if it is free. Returns immediately either way — a standby
 * asks again later rather than blocking on a lock that may be held for weeks.
 */
export async function tryBecomeLeader(): Promise<Leadership> {
  const client = new Client({ connectionString: getDatabaseUrl() })
  await client.connect()
  try {
    const answer = await client.query<{ locked: boolean }>(
      "select pg_try_advisory_lock($1) as locked",
      [TRADE_ENGINE_LOCK]
    )
    const held = answer.rows[0]?.locked === true
    if (!held) {
      await client.end()
      return { held: false, release: async () => {} }
    }
    return {
      held: true,
      release: async () => {
        // Unlocking explicitly is politeness, not the mechanism — ending the
        // connection would do it anyway. It makes a clean shutdown hand over
        // in milliseconds rather than waiting for the socket to close.
        await client
          .query("select pg_advisory_unlock($1)", [TRADE_ENGINE_LOCK])
          .catch(() => {})
        await client.end().catch(() => {})
      },
    }
  } catch (error) {
    await client.end().catch(() => {})
    throw error
  }
}
