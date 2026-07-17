import { describe, expect, it } from "vitest"

import {
  resolvePendingCommand,
  type PendingCommand,
  type WatchedBot,
} from "./use-bot-command-toasts"

const NOW = 1_000_000

function bot(
  id: string,
  status: string,
  reason: string | null = null
): WatchedBot {
  return { id, status, status_reason: reason }
}

function byId(...bots: WatchedBot[]) {
  return new Map(bots.map((entry) => [entry.id, entry]))
}

function pausePending(overrides: Partial<PendingCommand> = {}): PendingCommand {
  return {
    ids: ["a"],
    isDone: (watched) => watched.status === "paused",
    successText: "Bot paused.",
    commandLabel: "Pause",
    alreadyDeadIds: new Set(),
    deadline: NOW + 30_000,
    ...overrides,
  }
}

describe("resolvePendingCommand", () => {
  it("waits while the status has not converged", () => {
    expect(
      resolvePendingCommand(pausePending(), byId(bot("a", "running")), NOW)
    ).toEqual({ kind: "waiting" })
  })

  it("succeeds once every watched bot reaches the wanted state", () => {
    expect(
      resolvePendingCommand(
        pausePending({ ids: ["a", "b"] }),
        byId(bot("a", "paused"), bot("b", "paused")),
        NOW
      )
    ).toEqual({ kind: "success", text: "Bot paused." })
  })

  it("fails with the reason when a bot lands in error", () => {
    const resolution = resolvePendingCommand(
      pausePending(),
      byId(bot("a", "error", "Strategy crashed")),
      NOW
    )
    expect(resolution).toEqual({
      kind: "failure",
      text: "Pause failed — Strategy crashed",
    })
  })

  it("does not read a pre-existing error as the command failing", () => {
    // Stopping a bot that was already errored: the error state predates the
    // command, so keep waiting for the worker to converge it to stopped.
    const pending = pausePending({
      isDone: (watched) => watched.status === "stopped",
      successText: "Bot stopped.",
      commandLabel: "Stop",
      alreadyDeadIds: new Set(["a"]),
    })
    expect(
      resolvePendingCommand(pending, byId(bot("a", "error", "old crash")), NOW)
    ).toEqual({ kind: "waiting" })
    expect(
      resolvePendingCommand(pending, byId(bot("a", "stopped")), NOW)
    ).toEqual({ kind: "success", text: "Bot stopped." })
  })

  it("fails after the deadline instead of waiting forever", () => {
    const resolution = resolvePendingCommand(
      pausePending(),
      byId(bot("a", "running")),
      NOW + 30_001
    )
    expect(resolution.kind).toBe("failure")
  })

  it("drops silently when every watched bot was deleted", () => {
    expect(resolvePendingCommand(pausePending(), byId(), NOW)).toEqual({
      kind: "dropped",
    })
  })
})
