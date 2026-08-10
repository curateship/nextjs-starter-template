import { desc, eq, lt, sql } from "drizzle-orm"

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

export async function listWorkerControls(database: CustomShellDb = db) {
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
): Promise<{ enabled: boolean; paused: boolean }> {
  const rows = await database
    .select()
    .from(tradeWorkerControls)
    .where(eq(tradeWorkerControls.kind, kind))
    .limit(1)
  if (rows[0]) return { enabled: rows[0].enabled, paused: rows[0].paused }

  await database
    .insert(tradeWorkerControls)
    .values({ kind, enabled: true, paused: false })
    .onConflictDoNothing()
  return { enabled: true, paused: false }
}

export async function setWorkerSwitch(
  kind: WorkerKind,
  change: { enabled?: boolean; paused?: boolean },
  database: CustomShellDb = db
): Promise<void> {
  // Seeded first so switching a worker that has never run still writes.
  await workerControl(kind, database)
  await database
    .update(tradeWorkerControls)
    .set({ ...change, updatedAt: new Date() })
    .where(eq(tradeWorkerControls.kind, kind))
}

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
    .where(lt(tradeWorkerHeartbeats.lastSeenAt, new Date(Date.now() - HEARTBEAT_KEEP_MS)))
}

export async function workersDashboard(
  canControl: boolean,
  database: CustomShellDb = db
): Promise<WorkersDashboard> {
  const checkedAt = new Date()
  const [controls, beats, waiting] = await Promise.all([
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
  ])

  const ladderCount = waiting[0]?.count ?? 0

  const workers = WORKER_KINDS.map<WorkerStatus>((kind) => {
    const control = controls.find((one) => one.kind === kind)
    const enabled = control?.enabled ?? true
    const paused = control?.paused ?? false

    const alive = beats.filter(
      (beat) =>
        beat.kind === kind &&
        checkedAt.getTime() - beat.lastSeenAt.getTime() <= ONLINE_WINDOW_MS
    )
    const leader = alive.find((beat) => beat.role === "leader") ?? null
    // The leader speaks for the worker; with none alive, the most recent beat
    // of any kind still says when it was last seen.
    const speaking = leader ?? alive[0] ?? beats.find((beat) => beat.kind === kind) ?? null
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
            typeof meta.priceFeed === "string" ? meta.priceFeed : "Not reported",
        },
      ],
    }
  })

  return { checkedAt: checkedAt.toISOString(), canControl, workers }
}
