/**
 * What a bot's status badge should say. `status` is what the worker last
 * wrote; `desired_state` is what the user asked for. While the two disagree
 * a command is still in flight, so the badge shows an honest transient label
 * ("pausing…") instead of pretending the command already landed.
 */
export type BotBadgeView = {
  /** Text for the badge. In-flight labels end with "…". */
  label: string
  /** The persisted status behind the label — drives the badge color. */
  status: string
  /** True while a command is in flight; the badge shows a spinner. */
  transient: boolean
}

/**
 * How long a desired-vs-actual mismatch may read as "in flight". Past this
 * the badge falls back to the real status — the command likely failed or the
 * worker is offline (the offline banner explains that case).
 */
export const COMMAND_GRACE_MS = 30_000

export const COMMAND_LABELS = {
  start: "Start",
  stop: "Stop",
  pause: "Pause",
  resume: "Resume",
  flatten: "Flatten",
} as const

/** The status that proves each trackable command actually landed. */
export const EXPECTED_STATUS = {
  start: "running",
  resume: "running",
  pause: "paused",
  stop: "stopped",
} as const

/** Success-toast fragment: "<bot name> is running." etc. */
export const SUCCESS_TEXT = {
  start: "is running",
  resume: "is running",
  pause: "paused",
  stop: "stopped",
} as const

export function botBadgeState(
  bot: { status: string; desired_state: string; updated_at: string },
  nowMs: number
): BotBadgeView {
  const { status, desired_state: desired } = bot
  const plain: BotBadgeView = { label: status, status, transient: false }
  // Errors always win — a transient label must never hide a dead bot.
  if (status === "error" || status === "killed") return plain
  if (nowMs - Date.parse(bot.updated_at) >= COMMAND_GRACE_MS) return plain
  if (desired === "paused" && (status === "running" || status === "starting")) {
    return { label: "pausing…", status, transient: true }
  }
  if (desired === "stopped" && status !== "stopped") {
    return { label: "stopping…", status, transient: true }
  }
  if (desired === "running" && status === "paused") {
    return { label: "resuming…", status, transient: true }
  }
  if (status === "starting") {
    return { label: "starting…", status, transient: true }
  }
  return plain
}
