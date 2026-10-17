import { Client } from "pg"

import { getDatabaseUrl } from "@/server/db"

/**
 * Live updates for Project's pages: "project P, task T changed", so an open
 * task's chat and the project's Board and List refresh without a reload.
 * Tyler chose a stream of Project's own on 12 Oct 2026 over a 15-second
 * check, because the shell's bell stream only says "you have a new notice".
 *
 * The database says it. Triggers in `drizzle/0109_project_chat_and_talking.sql`
 * run `pg_notify('project_live', '<project id>:<task id>')` on every change to
 * a task and the things on it, so no server function has to remember to. The
 * nudge waits for the commit and never goes out for a rollback.
 *
 * One listening connection per server process, outside the pool, the same
 * way the shell's bell does it (`src/server/notifications/events.ts`). Only
 * ids travel, never words: a browser that hears one asks for the task or the
 * project again the normal way, which checks it may still see them.
 */

const CHANNEL = "project_live"
/**
 * "Team T changed": check-ins, meetings, time off, holidays, members, the
 * team and its projects and milestones (`drizzle/0118_project_features_16_oct.sql`),
 * for My dashboard and the Team dashboard.
 */
const TEAM_CHANNEL = "project_team_live"
const RECONNECT_DELAY_MS = 2000

/**
 * What changed: "task:<id>" for a task or anything on it, "chat" for the
 * project's own chat, and "all" after a gap in which changes went unheard.
 */
export type LiveChange = `task:${string}` | "chat" | "all"
type Listener = (change: LiveChange) => void

type LiveBus = {
  client: Client | null
  starting: Promise<void> | null
  reconnectTimer: ReturnType<typeof setTimeout> | null
  listenersByProject: Map<string, Set<Listener>>
  listenersByTeam: Map<string, Set<() => void>>
}

// Parked on globalThis so a dev-server reload reuses the connection and the
// listeners instead of opening another one on every edit.
const globals = globalThis as { __projectLiveBus?: LiveBus }
const bus: LiveBus = (globals.__projectLiveBus ??= {
  client: null,
  starting: null,
  reconnectTimer: null,
  listenersByProject: new Map(),
  listenersByTeam: new Map(),
})

function emitTeam(teamId: string) {
  for (const listener of bus.listenersByTeam.get(teamId) ?? []) {
    try {
      listener()
    } catch (error) {
      console.error("Project team live listener failed", error)
    }
  }
}

function emit(projectId: string, change: LiveChange) {
  for (const listener of bus.listenersByProject.get(projectId) ?? []) {
    try {
      listener(change)
    } catch (error) {
      console.error("Project live listener failed", error)
    }
  }
}

/** "<project id>:<task id>", with nothing after the colon for the project's chat. */
function readPayload(payload: string): { projectId: string; change: LiveChange } | null {
  const colon = payload.indexOf(":")
  if (colon < 1) return null
  const taskId = payload.slice(colon + 1)
  return { projectId: payload.slice(0, colon), change: taskId ? `task:${taskId}` : "chat" }
}

function scheduleReconnect() {
  if (bus.client) {
    const dead = bus.client
    bus.client = null
    dead.removeAllListeners()
    dead.end().catch(() => undefined)
  }
  if (bus.reconnectTimer) return
  bus.reconnectTimer = setTimeout(() => {
    bus.reconnectTimer = null
    ensureListening()
      .then(() => {
        // Whatever changed while the connection was down was told to nobody,
        // so every open page is asked to look again.
        for (const projectId of bus.listenersByProject.keys()) emit(projectId, "all")
        for (const teamId of bus.listenersByTeam.keys()) emitTeam(teamId)
      })
      .catch((error) => {
        console.error("Project live LISTEN reconnect failed", error)
        scheduleReconnect()
      })
  }, RECONNECT_DELAY_MS)
  bus.reconnectTimer.unref?.()
}

function ensureListening(): Promise<void> {
  if (bus.client) return Promise.resolve()
  if (bus.starting) return bus.starting
  bus.starting = (async () => {
    const client = new Client({
      connectionString: getDatabaseUrl(),
      application_name: "project_live_listen",
    })
    client.on("notification", (message) => {
      if (message.channel === TEAM_CHANNEL) {
        if (message.payload) emitTeam(message.payload)
        return
      }
      const change = message.payload ? readPayload(message.payload) : null
      if (change) emit(change.projectId, change.change)
    })
    client.on("error", (error) => {
      console.error("Project live LISTEN client error", error)
      scheduleReconnect()
    })
    client.on("end", () => {
      if (bus.client) scheduleReconnect()
    })
    await client.connect()
    await client.query(`LISTEN ${CHANNEL}`)
    await client.query(`LISTEN ${TEAM_CHANNEL}`)
    bus.client = client
  })()
  const pending = bus.starting
  pending.finally(() => {
    if (bus.starting === pending) bus.starting = null
  })
  return pending
}

/**
 * Calls `listener` on every change in one project until the returned function
 * is called. The stream route must call it when the browser goes away.
 */
export function subscribeToProject(projectId: string, listener: Listener): () => void {
  let listeners = bus.listenersByProject.get(projectId)
  if (!listeners) {
    listeners = new Set()
    bus.listenersByProject.set(projectId, listeners)
  }
  listeners.add(listener)
  void ensureListening().catch((error) => console.error("Project live LISTEN start failed", error))
  return () => {
    const current = bus.listenersByProject.get(projectId)
    if (!current) return
    current.delete(listener)
    if (current.size === 0) bus.listenersByProject.delete(projectId)
  }
}

/** Calls `listener` whenever something of the team's own changes, until the returned function is called. */
export function subscribeToTeam(teamId: string, listener: () => void): () => void {
  let listeners = bus.listenersByTeam.get(teamId)
  if (!listeners) {
    listeners = new Set()
    bus.listenersByTeam.set(teamId, listeners)
  }
  listeners.add(listener)
  void ensureListening().catch((error) => console.error("Project live LISTEN start failed", error))
  return () => {
    const current = bus.listenersByTeam.get(teamId)
    if (!current) return
    current.delete(listener)
    if (current.size === 0) bus.listenersByTeam.delete(teamId)
  }
}
