import { Client, Pool } from "pg"

import { buildStamp, describeBuild, type BuildStamp } from "@/lib/build-stamp"
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
 * That is also why the long holders open a connection of their own rather
 * than using the app's pool. A pooled connection goes back to the pool after
 * the query, and the lock goes with it. The website's one-pass check below
 * keeps a single connection of its own for the same reason, checked out for
 * the whole pass.
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
   * Why the lock was handed straight back, when it was: this build is older
   * than one that has already led. Null when the lock is held or simply
   * taken by somebody else.
   */
  readonly refused?: string | null
  /**
   * Whether the connection holding the lock has died. The lock died with it —
   * another copy may take it at any moment — so the holder must stop trading
   * the moment this says true, then ask for the lock again from scratch.
   */
  lost: () => boolean
  release: () => Promise<void>
}

/**
 * **The newest build leads, and an older one never takes the lock again.**
 *
 * The website, the shell worker and the engine are three containers rebuilt
 * on three separate buttons. On 3 Sep 2026 and again on 4 Sep a container
 * built weeks earlier took this lock during an engine restart and ran old
 * code over live grids: it read short grids as buying grids, saved plans
 * back without their settings, and bought coins nobody asked for. Telling
 * people to press all three buttons did not stop it happening twice.
 *
 * So the lock remembers the build time of the newest copy that has held it,
 * on the ladders row of `trade_worker_controls`. A copy whose own build is
 * older than that hands the lock back at once, whatever container it is in.
 * A deliberate rollback is a fresh build with a fresh time, so it still
 * leads; only a container left behind is refused.
 *
 * A dev server and a test run carry no stamp. They neither raise the bar nor
 * are held to it, so running the app locally against the live database
 * behaves exactly as before.
 *
 * Answers the refusal to say, or null when this build may lead.
 */
export function olderThanLastLeader(
  mine: BuildStamp,
  lastLeaderBuiltAt: Date | null
): string | null {
  if (lastLeaderBuiltAt === null) return null
  if (lastLeaderBuiltAt.getTime() <= mine.builtAt) return null
  const newest = describeBuild({ builtAt: lastLeaderBuiltAt.getTime(), commit: null })
  return `this copy was ${describeBuild(mine)}, and a copy ${newest} has led since. Redeploy this container so it runs the current build.`
}

/** The one query shape the rule needs, so a pooled client fits as well as a plain one. */
type Querier = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: unknown[] }>
}

let saidUnmigrated = false
let lastRefusalSaid: string | null = null

/**
 * Apply the rule above on the connection that just took the lock, and record
 * this build as the newest leader when it is allowed through.
 *
 * Runs while the lock is held, so two copies cannot both read "nobody yet"
 * and both write themselves in. A database that has not had migration 0161
 * yet cannot answer, and is allowed through with one warning: the engine is
 * deployed before the website that migrates, and a lock nobody could take
 * would stop every wallet trading.
 */
async function buildAllowedToLead(client: Querier): Promise<string | null> {
  const mine = buildStamp()
  if (!mine) return null
  let recorded: Date | null
  try {
    const answer = await client.query(
      "select leader_build_at from trade_worker_controls where kind = 'ladders'",
      []
    )
    const row = answer.rows[0] as { leader_build_at: Date | null } | undefined
    recorded = row?.leader_build_at ?? null
  } catch (error) {
    const code = (error as { code?: string }).code
    // 42703: no such column. 42P01: no such table. Both mean "not migrated".
    if (code !== "42703" && code !== "42P01") throw error
    if (!saidUnmigrated) {
      saidUnmigrated = true
      console.warn(
        "Trade engine: the database has no leader_build_at column yet (migration 0161), so the newest-build rule is not applied until the website has migrated it."
      )
    }
    return null
  }
  const refusal = olderThanLastLeader(mine, recorded)
  if (refusal) {
    if (lastRefusalSaid !== refusal) {
      lastRefusalSaid = refusal
      console.error(`Trade engine: standing back — ${refusal}`)
    }
    return refusal
  }
  await client.query(
    `insert into trade_worker_controls (kind, leader_build_at, leader_build)
       values ('ladders', $1, $2)
     on conflict (kind) do update
       set leader_build_at = excluded.leader_build_at,
           leader_build = excluded.leader_build
     where trade_worker_controls.leader_build_at is null
        or trade_worker_controls.leader_build_at <= excluded.leader_build_at`,
    [new Date(mine.builtAt), mine.commit]
  )
  return null
}

function refusedLeadership(refused: string): Leadership {
  return { held: false, refused, lost: () => true, release: async () => {} }
}

function heldLeadership(client: Client): Leadership {
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
    const refused = await buildAllowedToLead(client)
    if (refused) {
      await client.query("select pg_advisory_unlock($1)", [TRADE_ENGINE_LOCK])
      await client.end()
      return refusedLeadership(refused)
    }

    return heldLeadership(client)
  } catch (error) {
    await client.end().catch(() => {})
    throw error
  }
}

/**
 * The lock for ONE short pass, on a connection that is kept warm between
 * passes.
 *
 * The website asks for the lock every four seconds from every open dashboard
 * tab, holds it for one reconcile pass, and lets it go. `tryBecomeLeader`
 * opens a brand-new connection each time — connect, TLS, sign in — which
 * measured at half a second against the database this app runs on. Half a
 * second of plumbing every four seconds, per tab, before any work starts.
 *
 * This keeps a pool of one connection for that job. The lock still lives on
 * a connection, so the guarantee above holds: the connection stays checked
 * out for the whole pass, and if the pass fails in a way that might leave
 * the lock behind, the connection is destroyed rather than returned. A
 * connection idle for half a minute is closed, so a tab left alone costs
 * nothing.
 *
 * Not for the dedicated engine, and not for the ladder worker: both hold the
 * lock for hours and need `heldLeadership`'s keepalive and dropped-line
 * watch. A pass is over in seconds.
 */
export async function tryBecomeLeaderForOnePass(): Promise<Leadership> {
  const pool = lockPool()
  // The one connection is busy: another tab's pass holds it. That pass is
  // doing this pass's work, so the answer is "not held", at once — never a
  // queue behind it, which would run the same pass twice or time out.
  if (pool.waitingCount > 0 || (pool.totalCount > 0 && pool.idleCount === 0)) {
    return { held: false, lost: () => true, release: async () => {} }
  }
  const client = await pool.connect()
  let held = false
  try {
    const answer = await client.query<{ locked: boolean }>(
      "select pg_try_advisory_lock($1) as locked",
      [TRADE_ENGINE_LOCK]
    )
    held = answer.rows[0]?.locked === true
  } catch (error) {
    client.release(true)
    throw error
  }
  if (!held) {
    client.release()
    return { held: false, lost: () => true, release: async () => {} }
  }
  let refused: string | null = null
  try {
    refused = await buildAllowedToLead(client)
    if (refused) {
      await client.query("select pg_advisory_unlock($1)", [TRADE_ENGINE_LOCK])
    }
  } catch (error) {
    client.release(true)
    throw error
  }
  if (refused) {
    client.release()
    return refusedLeadership(refused)
  }
  let lost = false
  // A line that drops mid-pass took the lock with it. Listened for the same
  // way the long holders do, and unhooked on release so the pooled client
  // does not collect a listener per pass.
  const markLost = () => {
    lost = true
  }
  client.on("error", markLost)
  let released = false
  return {
    held: true,
    lost: () => lost || released,
    release: async () => {
      if (released) return
      released = true
      client.off("error", markLost)
      if (lost) {
        client.release(true)
        return
      }
      try {
        await client.query("select pg_advisory_unlock($1)", [TRADE_ENGINE_LOCK])
        client.release()
      } catch {
        // The unlock did not go through, so the lock may still sit on this
        // connection. Closing the connection releases it for certain; the
        // pool opens a fresh one next time.
        client.release(true)
      }
    },
  }
}

declare global {
  var __tradeLockPool: Pool | undefined
}

/**
 * On `globalThis`, not a module constant: the dev server bundles this module
 * more than once, and a pool per bundle would be a pool per copy.
 */
function lockPool(): Pool {
  if (!globalThis.__tradeLockPool) {
    const pool = new Pool({
      connectionString: getDatabaseUrl(),
      max: 1,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      keepAlive: true,
    })
    // A spare connection the far end hung up on must not take the process
    // down; the pool has already discarded it.
    pool.on("error", () => {})
    globalThis.__tradeLockPool = pool
  }
  return globalThis.__tradeLockPool
}

/**
 * Queue the dedicated engine for the lock instead of asking every few seconds.
 *
 * PostgreSQL hands a released advisory lock to a queued connection before a
 * polling website or an old standby can race in and take it. The website must
 * keep using `tryBecomeLeader`, because a web request may never wait on this
 * lock. The dedicated engine has no request to hold up and should wait here.
 */
export async function waitToBecomeLeader(): Promise<Leadership> {
  const client = new Client({
    connectionString: getDatabaseUrl(),
    keepAlive: true,
  })
  await client.connect()
  try {
    await client.query("select pg_advisory_lock($1)", [TRADE_ENGINE_LOCK])
    const refused = await buildAllowedToLead(client)
    if (refused) {
      await client.query("select pg_advisory_unlock($1)", [TRADE_ENGINE_LOCK])
      await client.end()
      return refusedLeadership(refused)
    }
    return heldLeadership(client)
  } catch (error) {
    await client.end().catch(() => {})
    throw error
  }
}
