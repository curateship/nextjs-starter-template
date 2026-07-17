import { sql } from "drizzle-orm"

import { WORKER_KINDS, WORKER_LABELS, type WorkerKind } from "@/lib/workers"
import { db } from "@/server/db"
import { tradingWorkerHeartbeats } from "@/server/schema"
import { listWorkerControls } from "@/server/workers/control"

import type { AlertDraft } from "./scanner/alert-engine"
import { insertAlerts } from "./scanner/insert-alerts"

const DEFAULT_CHECK_INTERVAL_MS = 30_000
const DEFAULT_STALE_MULTIPLIER = 3
const DEFAULT_MIN_STALE_MS = 60_000
const DEFAULT_HEARTBEAT_INTERVAL_MS = 10_000

export type WatchdogHeartbeatRow = {
  lastSeenAt: Date
  meta: unknown
}

export type WatchdogControlRow = {
  kind: string
  enabled: boolean
  paused: boolean
}

export type LivenessVerdict = {
  kind: WorkerKind
  /**
   * ok: heartbeat fresh (even when the workload is deliberately paused).
   * down: heartbeat stale while the worker should be running.
   * paused: heartbeat stale but the workload is deliberately off/paused.
   * missing: no heartbeat row ever recorded (never ran, or pruned).
   */
  state: "ok" | "down" | "paused" | "missing"
  /** For "down": the dead worker's last heartbeat — the outage gap start. */
  gapStartedAt: Date | null
}

/**
 * Pure liveness check: which of the OTHER workers look dead? A worker counts
 * as down only when its newest heartbeat is older than staleMultiplier × its
 * own cadence (floored at minStaleMs) AND its control says it should be
 * running — Off/Paused workloads keep heartbeating, so a paused worker whose
 * heartbeat also stops was deliberately taken down with its process.
 */
export function evaluateWorkerLiveness(input: {
  selfKind: WorkerKind
  now: Date
  heartbeats: WatchdogHeartbeatRow[]
  controls: WatchdogControlRow[]
  staleMultiplier?: number
  minStaleMs?: number
}): LivenessVerdict[] {
  const staleMultiplier = input.staleMultiplier ?? DEFAULT_STALE_MULTIPLIER
  const minStaleMs = input.minStaleMs ?? DEFAULT_MIN_STALE_MS
  const controlsByKind = new Map(
    input.controls.map((control) => [control.kind, control])
  )

  return WORKER_KINDS.filter((kind) => kind !== input.selfKind).map((kind) => {
    const newest = newestHeartbeatFor(kind, input.heartbeats)
    if (!newest) {
      return { kind, state: "missing" as const, gapStartedAt: null }
    }
    const cadenceMs = heartbeatCadenceMs(newest.meta)
    const thresholdMs = Math.max(cadenceMs * staleMultiplier, minStaleMs)
    if (input.now.getTime() - newest.lastSeenAt.getTime() < thresholdMs) {
      return { kind, state: "ok" as const, gapStartedAt: null }
    }
    const control = controlsByKind.get(kind)
    if (!control || !control.enabled || control.paused) {
      return { kind, state: "paused" as const, gapStartedAt: null }
    }
    return { kind, state: "down" as const, gapStartedAt: newest.lastSeenAt }
  })
}

function newestHeartbeatFor(
  kind: WorkerKind,
  heartbeats: WatchdogHeartbeatRow[]
): WatchdogHeartbeatRow | null {
  let newest: WatchdogHeartbeatRow | null = null
  for (const heartbeat of heartbeats) {
    if (metaOf(heartbeat.meta).workerKind !== kind) continue
    if (!newest || heartbeat.lastSeenAt > newest.lastSeenAt) newest = heartbeat
  }
  return newest
}

function heartbeatCadenceMs(meta: unknown): number {
  const cadence = metaOf(meta).heartbeatIntervalMs
  return typeof cadence === "number" && Number.isFinite(cadence) && cadence > 0
    ? cadence
    : DEFAULT_HEARTBEAT_INTERVAL_MS
}

function metaOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

/**
 * One alert per outage: the dedupe key pins the alert to the heartbeat-gap
 * start, so every surviving watcher races to insert the same row and only the
 * first one lands.
 */
export function workerDownDraft(
  kind: WorkerKind,
  gapStartedAt: Date,
  exposure: boolean,
  detectedBy: WorkerKind
): AlertDraft {
  const label = WORKER_LABELS[kind]
  const urgent = kind === "bot" && exposure
  const since = gapStartedAt.toISOString()
  return {
    type: "worker_down",
    title: urgent
      ? "URGENT: Bot Worker is down with live positions open"
      : `${label} is down`,
    body: urgent
      ? `No heartbeat since ${since}. Nothing is managing the open live positions or working orders until it restarts.`
      : kind === "bot"
        ? `No heartbeat since ${since}. No live positions or working orders are open, so nothing is at risk right now.`
        : `No heartbeat since ${since}. Its work is on hold until it restarts.`,
    data: {
      workerKind: kind,
      gapStartedAt: since,
      exposure,
      urgent,
      detectedBy,
    },
    dedupeKey: `worker-down:${kind}:${gapStartedAt.getTime()}`,
  }
}

export function workerRecoveredDraft(
  kind: WorkerKind,
  gapStartedAt: Date
): AlertDraft {
  const label = WORKER_LABELS[kind]
  return {
    type: "worker_recovered",
    title: `${label} is back online`,
    body:
      kind === "bot"
        ? "It rechecked its bots and open orders against the exchange on startup, so its records are current again."
        : "It is sending heartbeats and working again.",
    data: { workerKind: kind, gapStartedAt: gapStartedAt.toISOString() },
    dedupeKey: `worker-recovered:${kind}:${gapStartedAt.getTime()}`,
  }
}

/**
 * Live exposure = any nonzero position in the latest account snapshot of an
 * active wallet, or a working live bot order. Snapshots freeze when the bot
 * worker dies, which is exactly what we want: the last known exposure.
 */
export async function hasLiveExposure(): Promise<boolean> {
  const result = await db.execute<{ exposed: boolean }>(sql`
    select
      exists (
        select 1
        from (
          select distinct on (s.wallet_id) s.positions
          from account_snapshots s
          join wallets w on w.id = s.wallet_id and w.is_active
          order by s.wallet_id, s.captured_at desc
        ) latest
        cross join lateral jsonb_array_elements(
          case
            when jsonb_typeof(latest.positions) = 'array' then latest.positions
            else '[]'::jsonb
          end
        ) as p
        where coalesce((p ->> 'szi')::numeric, 0) <> 0
      )
      or exists (
        select 1
        from bot_orders o
        join bots b on b.id = o.bot_id
        where b.mode = 'live'
          and o.status in ('pending', 'resting', 'partially_filled')
      ) as exposed
  `)
  return result.rows[0]?.exposed === true
}

/**
 * Mutual watching: every leader worker runs this cheap check against all the
 * OTHER kinds, so any single worker's death is caught as long as one worker
 * survives. (Residual risk: all workers dying at once stays silent — that
 * needs an external uptime ping, out of scope here.)
 */
export class WorkerWatchdog {
  private readonly selfKind: WorkerKind
  private readonly intervalMs: number
  private readonly staleMultiplier: number
  private readonly minStaleMs: number
  private timer: NodeJS.Timeout | null = null
  private startDelay: NodeJS.Timeout | null = null
  private ticking = false
  /** kind → outage gap start (epoch ms) we have already alerted on. */
  private readonly outages = new Map<WorkerKind, number>()
  private lastCheckAt: string | null = null

  constructor(selfKind: WorkerKind) {
    this.selfKind = selfKind
    this.intervalMs = envNumber(
      "WORKER_WATCHDOG_INTERVAL_MS",
      DEFAULT_CHECK_INTERVAL_MS
    )
    this.staleMultiplier = envNumber(
      "WORKER_WATCHDOG_STALE_MULTIPLIER",
      DEFAULT_STALE_MULTIPLIER
    )
    this.minStaleMs = envNumber(
      "WORKER_WATCHDOG_MIN_STALE_MS",
      DEFAULT_MIN_STALE_MS
    )
  }

  start() {
    // Hold the first sweep for one staleness window: on a cold start of the
    // whole stack, peers need a moment to write their first heartbeat over
    // last session's stale rows — judging them instantly spams false
    // down/recovered pairs. A truly dead worker still alerts one window in.
    this.startDelay = setTimeout(
      () => {
        void this.tick()
        this.timer = setInterval(() => void this.tick(), this.intervalMs)
      },
      Math.max(this.minStaleMs, this.intervalMs)
    )
  }

  stop() {
    if (this.startDelay) clearTimeout(this.startDelay)
    this.startDelay = null
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  meta() {
    return { watchdogLastCheckAt: this.lastCheckAt }
  }

  private async tick() {
    if (this.ticking) return
    this.ticking = true
    try {
      const [heartbeats, controls] = await Promise.all([
        db
          .select({
            lastSeenAt: tradingWorkerHeartbeats.lastSeenAt,
            meta: tradingWorkerHeartbeats.meta,
          })
          .from(tradingWorkerHeartbeats),
        listWorkerControls(),
      ])
      const verdicts = evaluateWorkerLiveness({
        selfKind: this.selfKind,
        now: new Date(),
        heartbeats,
        controls,
        staleMultiplier: this.staleMultiplier,
        minStaleMs: this.minStaleMs,
      })

      const drafts: AlertDraft[] = []
      let exposure: boolean | null = null
      for (const verdict of verdicts) {
        if (verdict.state === "down" && verdict.gapStartedAt) {
          const gapStart = verdict.gapStartedAt.getTime()
          if (this.outages.get(verdict.kind) === gapStart) continue
          // An exposure lookup failure must not silence the down alert —
          // assume exposure so the alert errs on the urgent side.
          exposure =
            exposure ??
            (await hasLiveExposure().catch((error: unknown) => {
              console.error(
                `${this.selfKind} worker: watchdog exposure check failed`,
                error
              )
              return true
            }))
          drafts.push(
            workerDownDraft(
              verdict.kind,
              verdict.gapStartedAt,
              exposure,
              this.selfKind
            )
          )
          this.outages.set(verdict.kind, gapStart)
          console.error(
            `${this.selfKind} worker: watchdog found ${verdict.kind} worker down since ${verdict.gapStartedAt.toISOString()}`
          )
        } else if (verdict.state === "ok") {
          // Heartbeat is back (even if the workload is paused): close the
          // outage we alerted on with one deduped recovery notice.
          const gapStart = this.outages.get(verdict.kind)
          if (gapStart !== undefined) {
            drafts.push(workerRecoveredDraft(verdict.kind, new Date(gapStart)))
            this.outages.delete(verdict.kind)
            console.log(
              `${this.selfKind} worker: watchdog saw ${verdict.kind} worker recover`
            )
          }
        }
      }
      await insertAlerts(drafts)
      this.lastCheckAt = new Date().toISOString()
    } catch (error) {
      console.error(`${this.selfKind} worker: watchdog check failed`, error)
    } finally {
      this.ticking = false
    }
  }
}

function envNumber(name: string, fallback: number) {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value > 0 ? value : fallback
}
