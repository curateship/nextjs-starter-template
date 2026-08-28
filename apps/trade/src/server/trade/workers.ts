import { and, desc, eq, lt, sql } from "drizzle-orm"

import {
  safeWorkerError,
  WORKER_DESCRIPTIONS,
  WORKER_KINDS,
  WORKER_LABELS,
  type WorkerKind,
  type WorkerState,
  type WorkersDashboard,
  type WorkerStatus,
} from "@/lib/trade/workers"
import { db, type CustomShellDb } from "@/server/db"
import {
  tradeSmartLadders,
  tradeWorkerControls,
  tradeWorkerHeartbeats,
} from "@/server/trade/schema"

/**
 * The trading engine, as the Workers screen sees it — and the two switches
 * that control it.
 *
 * **Alive is not a question the engine can be asked.** A dead one answers
 * nothing, and a hung one answers cheerfully. So it writes down that it is
 * alive every few seconds and this reads the writing: anything older than
 * `ONLINE_WINDOW_MS` is gone, whatever it last claimed.
 *
 * The two switches are deliberately different. **Off** means do not run —
 * it survives restarts and is how you stop an engine you are not using.
 * **Paused** means keep running but do not trade, which is what you want when
 * something looks wrong and you would rather look before anything else
 * happens. A pause leaves the ladders exactly where they are.
 */

/** No beat for this long and the engine is treated as gone. */
const ONLINE_WINDOW_MS = 30_000

/** How long a stopped copy's last beat is kept, so "when did it last run" has an answer. */
const HEARTBEAT_KEEP_MS = 3 * 24 * 60 * 60_000

async function listWorkerControls(database: CustomShellDb = db) {
  return database.select().from(tradeWorkerControls)
}

/**
 * The engine's switches, seeding the row if it is not there.
 *
 * Seeded rather than assumed so the answer is the same whether or not the
 * migration's own insert ran — a fresh database and an upgraded one behave
 * identically.
 */
export async function workerControl(
  kind: WorkerKind,
  database: CustomShellDb = db
): Promise<{
  enabled: boolean
  paused: boolean
  restartRequestedAt: Date | null
  flowScanRequestedAt: Date | null
}> {
  const rows = await database
    .select()
    .from(tradeWorkerControls)
    .where(eq(tradeWorkerControls.kind, kind))
    .limit(1)
  if (rows[0]) {
    return {
      enabled: rows[0].enabled,
      paused: rows[0].paused,
      restartRequestedAt: rows[0].restartRequestedAt,
      flowScanRequestedAt: rows[0].flowScanRequestedAt,
    }
  }

  await database
    .insert(tradeWorkerControls)
    .values({ kind, enabled: true, paused: false })
    .onConflictDoNothing()
  return {
    enabled: true,
    paused: false,
    restartRequestedAt: null,
    flowScanRequestedAt: null,
  }
}

/** Ask the ladder engine to run the expensive coin hunt on its next pass. */
export async function requestFlowScan(
  database: CustomShellDb = db
): Promise<void> {
  await workerControl("ladders", database)
  const now = new Date()
  await database
    .update(tradeWorkerControls)
    .set({
      // Keep each request distinct even when two folder edits land in the same
      // millisecond. The engine can then clear the request it read without
      // erasing the edit that arrived behind it.
      flowScanRequestedAt: sql`GREATEST(
        COALESCE(${tradeWorkerControls.flowScanRequestedAt} + interval '1 millisecond', 'epoch'::timestamptz),
        date_trunc('milliseconds', clock_timestamp())
      )`,
      updatedAt: now,
    })
    .where(eq(tradeWorkerControls.kind, "ladders"))
}

/** Clear only the request this pass claimed, leaving a newer one in place. */
export async function clearFlowScanRequest(
  requestedAt: Date,
  database: CustomShellDb = db
): Promise<void> {
  await database
    .update(tradeWorkerControls)
    .set({ flowScanRequestedAt: null, updatedAt: new Date() })
    .where(
      and(
        eq(tradeWorkerControls.kind, "ladders"),
        eq(tradeWorkerControls.flowScanRequestedAt, requestedAt)
      )
    )
}

export async function setWorkerSwitch(
  kind: WorkerKind,
  change: { enabled?: boolean; paused?: boolean },
  database: CustomShellDb = db
): Promise<void> {
  // Seeded first so switching a worker that has never run still writes.
  await workerControl(kind, database)
  const changedAt = new Date()
  await database
    .update(tradeWorkerControls)
    .set({
      ...change,
      ...(change.enabled === true ? { enabledAt: changedAt } : {}),
      updatedAt: changedAt,
    })
    .where(eq(tradeWorkerControls.kind, kind))
}

/**
 * Ask the running engine to stop cleanly and be started again.
 *
 * A mark on the control row, not a signal: the engine reads the row every
 * pass, so it sees this within a second, finishes the pass in flight, clears
 * the mark, releases the leader lock, and exits — the container supervisor
 * does the starting. There is no path here that can leave two copies trading.
 */
export async function requestWorkerRestart(
  kind: WorkerKind,
  database: CustomShellDb = db
): Promise<void> {
  // Seeded first so pressing Restart on an engine that has never run still writes.
  await workerControl(kind, database)
  const now = new Date()
  await database
    .update(tradeWorkerControls)
    .set({ restartRequestedAt: now, updatedAt: now })
    .where(eq(tradeWorkerControls.kind, kind))
}

/**
 * The engine clearing the mark before it exits, so the replacement copy does
 * not read yesterday's request and restart itself again on boot.
 */
export async function clearWorkerRestart(
  kind: WorkerKind,
  database: CustomShellDb = db
): Promise<void> {
  await database
    .update(tradeWorkerControls)
    .set({ restartRequestedAt: null, updatedAt: new Date() })
    .where(eq(tradeWorkerControls.kind, kind))
}

/**
 * The row the real-money permission is kept under. Same table as the worker
 * switches — it is a switch — but not a worker kind, so the dashboard's
 * per-worker loop never mistakes it for an engine.
 */
const REAL_MONEY_KIND = "real-money"

export type RealMoneySwitch = {
  /**
   * Whether this install is allowed to touch real money at all. This is the
   * `TRADE_ENABLE_MAINNET` environment setting — the master lock. It can only
   * be changed by a deploy, so nothing clicked in a browser can arm an
   * install that was never meant to trade for real.
   */
  masterAllowed: boolean
  /** The Settings toggle behind the lock. No row yet means off — opt-in. */
  enabled: boolean
}

export async function realMoneySwitch(
  database: CustomShellDb = db
): Promise<RealMoneySwitch> {
  const rows = await database
    .select()
    .from(tradeWorkerControls)
    .where(eq(tradeWorkerControls.kind, REAL_MONEY_KIND))
    .limit(1)
  return {
    masterAllowed: process.env.TRADE_ENABLE_MAINNET === "true",
    // Deliberately NOT seeded like workerControl: a missing row must mean
    // off. Real money is the one thing a fresh database should never allow
    // until somebody switches it on out loud.
    enabled: rows[0]?.enabled === true,
  }
}

export async function setRealMoneySwitch(
  on: boolean,
  database: CustomShellDb = db
): Promise<void> {
  await database
    .insert(tradeWorkerControls)
    .values({ kind: REAL_MONEY_KIND, enabled: on, paused: false })
    .onConflictDoUpdate({
      target: tradeWorkerControls.kind,
      set: { enabled: on, updatedAt: new Date() },
    })
}

// The refusal built on this switch — assertRealMoneySwitchOn — lives in
// `@/server/protocols/real-money` with the rest of the real-money gate, so
// every exchange connector finds the whole gate in one place. This file keeps
// only what the Workers screen needs: reading and setting the toggle.

/**
 * A running copy saying it is alive. Called by the worker itself every few
 * seconds, and by nothing else.
 */
export async function writeHeartbeat(input: {
  id: string
  kind: WorkerKind
  startedAt: number
  role: "leader" | "standby"
  meta: Record<string, unknown>
  database?: CustomShellDb
}): Promise<void> {
  const database = input.database ?? db
  const now = new Date()
  await database
    .insert(tradeWorkerHeartbeats)
    .values({
      id: input.id,
      kind: input.kind,
      startedAt: new Date(input.startedAt),
      lastSeenAt: now,
      role: input.role,
      meta: input.meta,
    })
    .onConflictDoUpdate({
      target: tradeWorkerHeartbeats.id,
      set: { lastSeenAt: now, role: input.role, meta: input.meta },
    })

  // Old rows are swept here rather than on a schedule of their own: this runs
  // every few seconds anyway, and a delete of nothing costs nothing.
  await database
    .delete(tradeWorkerHeartbeats)
    .where(
      lt(
        tradeWorkerHeartbeats.lastSeenAt,
        new Date(Date.now() - HEARTBEAT_KEEP_MS)
      )
    )
}

export async function workersDashboard(
  canControl: boolean,
  database: CustomShellDb = db
): Promise<WorkersDashboard> {
  const checkedAt = new Date()
  const [controls, beats, waiting, realMoney] = await Promise.all([
    listWorkerControls(database),
    database
      .select()
      .from(tradeWorkerHeartbeats)
      .orderBy(desc(tradeWorkerHeartbeats.lastSeenAt))
      .limit(50),
    database
      .select({ count: sql<number>`count(*)::int` })
      .from(tradeSmartLadders)
      .where(eq(tradeSmartLadders.status, "active")),
    realMoneySwitch(database),
  ])

  const ladderCount = waiting[0]?.count ?? 0

  const workers = WORKER_KINDS.map<WorkerStatus>((kind) => {
    const control = controls.find((one) => one.kind === kind)
    const enabled = control?.enabled ?? true
    const paused = control?.paused ?? false
    // True from the button press until the engine picks the mark up, which it
    // does at the top of its next pass — so the card only says "Restart
    // requested" for the second or two the request is actually outstanding.
    const restartRequested = control?.restartRequestedAt != null

    const alive = beats.filter(
      (beat) =>
        beat.kind === kind &&
        checkedAt.getTime() - beat.lastSeenAt.getTime() <= ONLINE_WINDOW_MS
    )
    const leader = alive.find((beat) => beat.role === "leader") ?? null
    // The leader speaks for the worker; with none alive, the most recent beat
    // of any kind still says when it was last seen.
    const speaking =
      leader ?? alive[0] ?? beats.find((beat) => beat.kind === kind) ?? null
    const meta = (speaking?.meta ?? {}) as Record<string, unknown>

    const state: WorkerState = !enabled
      ? "off"
      : alive.length === 0
        ? "offline"
        : paused
          ? "paused"
          : ladderCount > 0
            ? "running"
            : "idle"

    return {
      kind,
      label: WORKER_LABELS[kind],
      description: WORKER_DESCRIPTIONS[kind],
      state,
      enabled,
      paused,
      restartRequested,
      online: alive.length > 0,
      copies: alive.length,
      role: leader ? "leader" : alive.length > 0 ? "standby" : null,
      startedAt: speaking?.startedAt.toISOString() ?? null,
      lastSeenAt: speaking?.lastSeenAt.toISOString() ?? null,
      activity:
        typeof meta.activity === "string" && meta.activity
          ? meta.activity
          : state === "running"
            ? "Working ladders"
            : "Nothing to do",
      latestError: safeWorkerError(meta.error),
      host: typeof meta.host === "string" ? meta.host : null,
      figures: [
        { label: "Ladders working", value: String(ladderCount) },
        { label: "Copies alive", value: String(alive.length) },
        {
          label: "Prices",
          value:
            typeof meta.priceFeed === "string"
              ? meta.priceFeed
              : "Not reported",
        },
      ],
    }
  })

  return { checkedAt: checkedAt.toISOString(), canControl, workers, realMoney }
}
