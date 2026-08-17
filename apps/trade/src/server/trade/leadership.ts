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

/**
 * How often the lock's connection says something, so the wire never goes
 * quiet.
 *
 * The connection's only job is to exist — after taking the lock it never
 * carries another query — and something on the network path hangs up any
 * connection that has been silent for an hour. That is what killed the engine
 * at exactly sixty minutes old, every hour, on both servers it ever ran on.
 * A trivial query every couple of minutes keeps the line counted as busy, and
 * doubles as proof the lock is still really held: the same query failing is
 * how a dropped line is noticed at all.
 */
const KEEPALIVE_EVERY_MS = 2 * 60_000

export type Leadership = {
  /** True when this process holds the lock and may trade. */
  readonly held: boolean
  /**
   * Whether the connection holding the lock has died. The lock died with it —
   * another copy may take it at any moment — so the holder must stop trading
   * the moment this says true, then ask for the lock again from scratch.
   */
  lost: () => boolean
  release: () => Promise<void>
}

/**
 * Take the lock if it is free. Returns immediately either way — a standby
 * asks again later rather than blocking on a lock that may be held for weeks.
 */
export async function tryBecomeLeader(): Promise<Leadership> {
  const client = new Client({
    connectionString: getDatabaseUrl(),
    // Kernel-level keepalives as well as the query below — two different
    // layers of plumbing can each decide a silent line is dead.
    keepAlive: true,
  })
  await client.connect()
  try {
    const answer = await client.query<{ locked: boolean }>(
      "select pg_try_advisory_lock($1) as locked",
      [TRADE_ENGINE_LOCK]
    )
    const held = answer.rows[0]?.locked === true
    if (!held) {
      await client.end()
      // Never held, so there is nothing to lose; `lost` answers about the
      // lock, and a lock this process does not hold is as gone as gone gets.
      return { held: false, lost: () => true, release: async () => {} }
    }

    let lost = false
    let keepalive: ReturnType<typeof setInterval> | null = null
    const markLost = () => {
      lost = true
      if (keepalive) {
        clearInterval(keepalive)
        keepalive = null
      }
    }

    // Without a listener, the client re-throws a dropped connection as a
    // process-killing error. This is not hypothetical: the engine died this
    // way at sixty minutes old, every hour, from the day it first ran.
    client.on("error", markLost)
    client.on("end", markLost)

    keepalive = setInterval(() => {
      void client.query("select 1").catch(markLost)
    }, KEEPALIVE_EVERY_MS)
    // Never a reason to hold the process open on its own.
    keepalive.unref?.()

    return {
      held: true,
      lost: () => lost,
      release: async () => {
        markLost()
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
