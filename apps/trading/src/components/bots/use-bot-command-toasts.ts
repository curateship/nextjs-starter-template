import * as React from "react"
import { toast } from "sonner"

import { COMMAND_GRACE_MS } from "./bot-status"

export type WatchedBot = { id: string; status: string; status_reason: string | null }

export type PendingCommand = {
  /** Bots that must all reach the wanted state before the toast fires. */
  ids: string[]
  isDone: (bot: WatchedBot) => boolean
  successText: string
  /** Plain-English command name for failure toasts, e.g. "Pause". */
  commandLabel: string
  /**
   * Bots already error/killed when the command was sent. A stop issued on an
   * errored bot must wait for convergence, not instantly read as "failed".
   */
  alreadyDeadIds: ReadonlySet<string>
  deadline: number
}

export type PendingResolution =
  | { kind: "waiting" }
  /** Every watched bot disappeared (deleted); nothing left to confirm. */
  | { kind: "dropped" }
  | { kind: "success"; text: string }
  | { kind: "failure"; text: string }

/** Pure settle rules for one tracked command against the latest poll. */
export function resolvePendingCommand(
  pending: PendingCommand,
  botsById: ReadonlyMap<string, WatchedBot>,
  nowMs: number
): PendingResolution {
  const watched = pending.ids.flatMap((id) => botsById.get(id) ?? [])
  if (watched.length === 0) return { kind: "dropped" }
  const dead = watched.find(
    (bot) =>
      (bot.status === "error" || bot.status === "killed") &&
      !pending.alreadyDeadIds.has(bot.id)
  )
  if (dead) {
    return {
      kind: "failure",
      text: `${pending.commandLabel} failed — ${dead.status_reason ?? `the bot is ${dead.status}`}`,
    }
  }
  if (watched.every((bot) => pending.isDone(bot))) {
    return { kind: "success", text: pending.successText }
  }
  if (nowMs > pending.deadline) {
    return {
      kind: "failure",
      text: `${pending.commandLabel} hasn't completed — the worker never confirmed it. Check the Workers page.`,
    }
  }
  return { kind: "waiting" }
}

/**
 * Fires exactly one toast per tracked bot command, based on the statuses the
 * existing poll already brings in: success when the status converges to what
 * the command asked for, error when a watched bot lands in error/killed or
 * the wait exceeds the shared in-flight window (COMMAND_GRACE_MS — the same
 * moment the badge stops showing "pausing…"). Each tracked command is
 * removed the moment it settles, so repeated polls can never re-toast.
 */
export function useBotCommandToasts(bots: WatchedBot[]) {
  const pendingRef = React.useRef(new Map<string, PendingCommand>())
  // Statuses as of the last render — what track() reads to know which bots
  // were already dead when the command was sent.
  const botsRef = React.useRef(bots)

  const track = React.useCallback(
    (
      key: string,
      command: Omit<PendingCommand, "deadline" | "alreadyDeadIds">
    ) => {
      pendingRef.current.set(key, {
        ...command,
        alreadyDeadIds: new Set(
          botsRef.current
            .filter((bot) => bot.status === "error" || bot.status === "killed")
            .map((bot) => bot.id)
        ),
        deadline: Date.now() + COMMAND_GRACE_MS,
      })
    },
    []
  )

  React.useEffect(() => {
    botsRef.current = bots
    const byId = new Map(bots.map((bot) => [bot.id, bot]))
    for (const [key, pending] of pendingRef.current) {
      const resolution = resolvePendingCommand(pending, byId, Date.now())
      if (resolution.kind === "waiting") continue
      pendingRef.current.delete(key)
      if (resolution.kind === "success") toast.success(resolution.text)
      else if (resolution.kind === "failure") toast.error(resolution.text)
    }
  }, [bots])

  return track
}
