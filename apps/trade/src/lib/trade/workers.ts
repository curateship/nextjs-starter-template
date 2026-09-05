/**
 * The trading engine as the Workers screen describes it.
 *
 * Shapes only — no database, no exchange — so the screen and the server can
 * both hold the same idea of what "running" means.
 */

export const WORKER_KINDS = ["ladders"] as const

export type WorkerKind = (typeof WORKER_KINDS)[number]

export const WORKER_LABELS: Record<WorkerKind, string> = {
  ladders: "Trading engine",
}

export const WORKER_DESCRIPTIONS: Record<WorkerKind, string> = {
  ladders:
    "Buys the rungs, fires the stops and places the exits, whether or not anybody has the app open.",
}

/**
 * What the screen says, in one word.
 *
 * - **running** — alive and working ladders.
 * - **idle** — alive, but there is nothing to work right now.
 * - **paused** — alive and deliberately not trading.
 * - **off** — switched off; it will not start until it is switched back on.
 * - **offline** — nothing has said it is alive recently. Either it was never
 *   started, or it has stopped without saying so.
 */
export type WorkerState = "running" | "idle" | "paused" | "off" | "offline"

export type WorkerStatus = {
  kind: WorkerKind
  label: string
  description: string
  state: WorkerState
  enabled: boolean
  paused: boolean
  /** Restart pressed, and the engine has not picked the mark up yet. */
  restartRequested: boolean
  /** Whether anything has beat inside the window. */
  online: boolean
  /** How many copies are alive, counting standbys. */
  copies: number
  /** The copy that holds the lock, if one is alive. */
  role: "leader" | "standby" | null
  startedAt: string | null
  lastSeenAt: string | null
  /** How it described itself at the last beat. */
  activity: string
  latestError: string | null
  latestErrorAt: string | null
  /** Where it is running: its own program, or inside the website. */
  host: string | null
  figures: Array<{ label: string; value: string }>
}

export type WorkersDashboard = {
  checkedAt: string
  canControl: boolean
  workers: WorkerStatus[]
  /**
   * The real-money permission, two layers deep: `masterAllowed` is the
   * server's own lock (changed only by a deploy), `enabled` is the Settings
   * toggle behind it. Orders for real money go out only when both are true.
   */
  realMoney: { masterAllowed: boolean; enabled: boolean }
}

/**
 * An error safe to show on a page: one line, no addresses, and nothing that
 * looks like a key. A worker's error text passes through whatever it was
 * talking to, so this is not paranoia.
 */
export function safeWorkerError(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null
  return value
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, "[removed]")
    .replace(
      /\b(password|token|secret|api[_ -]?key|private[_ -]?key|key)\s*[:=]\s*[^\s,;]+/gi,
      "$1=[removed]"
    )
    .slice(0, 300)
}

/** How the state reads, for a badge. */
export const WORKER_STATE_LABELS: Record<WorkerState, string> = {
  running: "Running",
  idle: "Waiting",
  paused: "Paused",
  off: "Switched off",
  offline: "Not running",
}
