import { and, eq, inArray, isNull, lt } from "drizzle-orm"

import { db, type Db } from "@/server/db"
import { createAlert } from "@/server/notifications"
import { stopSession } from "@/server/orchestrator"
import { testUserProxy } from "@/server/proxies"
import {
  browserSessions,
  profiles,
  proxies,
  type BrowserSession,
} from "@/server/schema"
import { now } from "@/server/security"

// Sessions that are still holding resources and therefore worth watching.
const ACTIVE_STATUSES = ["starting", "running", "stopping"]

// A session is "alive" when its probe resolves true. Injected so the DB logic
// can be tested without a real container/stream.
export type SessionLivenessProbe = (
  session: BrowserSession
) => Promise<boolean>

// Re-tests every proxy and lets testUserProxy record the result and fire a
// proxy_dead alert on the ok/untested -> dead transition (its own dedupe).
export async function sweepProxyHealth(database: Db = db) {
  const rows = await database
    .select({ id: proxies.id, userId: proxies.userId })
    .from(proxies)

  let tested = 0
  for (const row of rows) {
    try {
      await testUserProxy(row.userId, row.id, database)
      tested += 1
    } catch (error) {
      console.error("[scheduler] proxy sweep failed", { proxyId: row.id, error })
    }
  }
  return { tested }
}

// Probes every running session; a dead one is flipped to error and alerted.
// Only sessions currently "running" are considered so we never re-alert (the
// running -> error transition happens exactly once).
export async function detectCrashedSessions(
  probe: SessionLivenessProbe,
  database: Db = db
) {
  const active = await database
    .select()
    .from(browserSessions)
    .where(
      and(
        isNull(browserSessions.endedAt),
        eq(browserSessions.status, "running")
      )
    )

  let crashed = 0
  for (const session of active) {
    let alive = true
    try {
      alive = await probe(session)
    } catch {
      alive = false
    }
    if (alive) continue

    const failedAt = now()
    await database
      .update(browserSessions)
      .set({ status: "error", endedAt: failedAt, updatedAt: failedAt })
      .where(eq(browserSessions.id, session.id))
    await database
      .update(profiles)
      .set({ status: "error", updatedAt: failedAt })
      .where(eq(profiles.id, session.profileId))
    await createAlert({
      recipientUserId: session.userId,
      type: "session_crashed",
      severity: "critical",
      title: "A browser session stopped unexpectedly",
      entityType: "profile",
      entityId: session.profileId,
      metadata: { sessionId: session.id },
      database,
    })
    crashed += 1
  }
  return { crashed }
}

// Stops sessions idle past the threshold and alerts (info) for each. The single
// canonical idle reaper — selects idle sessions, stops each (resilient to one
// bad stop), and attaches a session_reaped alert.
export async function reapIdleSessionsWithAlerts(
  idleMs: number,
  database: Db = db
) {
  const cutoff = new Date(now().getTime() - idleMs)
  const idle = await database
    .select()
    .from(browserSessions)
    .where(
      and(
        isNull(browserSessions.endedAt),
        inArray(browserSessions.status, ACTIVE_STATUSES),
        lt(browserSessions.lastActiveAt, cutoff)
      )
    )

  let stopped = 0
  for (const session of idle) {
    try {
      await stopSession(session.userId, session.id, { db: database })
      await createAlert({
        recipientUserId: session.userId,
        type: "session_reaped",
        severity: "info",
        title: "Idle browser session stopped",
        entityType: "profile",
        entityId: session.profileId,
        metadata: { sessionId: session.id },
        database,
      })
      stopped += 1
    } catch (error) {
      console.error("[scheduler] idle reap failed", {
        sessionId: session.id,
        error,
      })
    }
  }
  return { stopped }
}

// Default liveness probe: the stream endpoint answers. Neko may reply 401 while
// perfectly alive, so any HTTP response counts as alive; only a transport
// failure (container gone) reads as dead.
async function probeStreamAlive(
  url: string,
  timeoutMs = 3000
): Promise<boolean> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    await fetch(url, { method: "GET", signal: controller.signal })
    return true
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

const DEFAULT_PROXY_SWEEP_MS = 10 * 60 * 1000
const DEFAULT_SESSION_POLL_MS = 90 * 1000
const DEFAULT_IDLE_MS = 30 * 60 * 1000

let schedulerStarted = false

function intMs(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

// Runs `task` every `everyMs`, never overlapping a slow run with the next tick,
// and swallowing per-tick errors so the loop survives a bad run.
function scheduleLoop(label: string, everyMs: number, task: () => Promise<unknown>) {
  let running = false
  const handle = setInterval(() => {
    if (running) return
    running = true
    void Promise.resolve()
      .then(task)
      .catch((error) => console.error(`[scheduler] ${label} tick failed`, error))
      .finally(() => {
        running = false
      })
  }, everyMs)
  // Don't keep the process alive just for the scheduler (Node timers only).
  ;(handle as { unref?: () => void }).unref?.()
}

// Boot entrypoint. Idempotent and gated: does nothing unless
// ANTIDETECT_SCHEDULER_ENABLED === "true", so it is safe to always register.
export function startAntidetectScheduler() {
  if (schedulerStarted) return
  if (process.env.ANTIDETECT_SCHEDULER_ENABLED !== "true") return
  schedulerStarted = true

  const proxyMs = intMs(process.env.ANTIDETECT_PROXY_SWEEP_MS, DEFAULT_PROXY_SWEEP_MS)
  const sessionMs = intMs(process.env.ANTIDETECT_SESSION_POLL_MS, DEFAULT_SESSION_POLL_MS)
  const idleMs = intMs(process.env.ANTIDETECT_IDLE_REAP_MS, DEFAULT_IDLE_MS)

  console.info("[scheduler] starting", { proxyMs, sessionMs, idleMs })
  scheduleLoop("proxy-sweep", proxyMs, () => sweepProxyHealth())
  scheduleLoop("session-crash", sessionMs, () =>
    detectCrashedSessions((session) => probeStreamAlive(session.streamUrl))
  )
  scheduleLoop("idle-reap", sessionMs, () => reapIdleSessionsWithAlerts(idleMs))
}
