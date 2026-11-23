import { describe, expect, it } from "vitest"

import { botBadgeState, COMMAND_GRACE_MS } from "./bot-status"

const NOW = Date.parse("2026-07-17T12:00:00Z")

function bot(status: string, desired: string, ageMs = 1_000) {
  return {
    status,
    desired_state: desired,
    updated_at: new Date(NOW - ageMs).toISOString(),
  }
}

describe("botBadgeState", () => {
  it("shows the plain status when actual and desired agree", () => {
    expect(botBadgeState(bot("running", "running"), NOW)).toEqual({
      label: "running",
      status: "running",
      transient: false,
    })
    expect(botBadgeState(bot("paused", "paused"), NOW)).toEqual({
      label: "paused",
      status: "paused",
      transient: false,
    })
  })

  it("shows in-flight labels while a command is being carried out", () => {
    expect(botBadgeState(bot("running", "paused"), NOW).label).toBe("pausing…")
    expect(botBadgeState(bot("running", "stopped"), NOW).label).toBe(
      "stopping…"
    )
    expect(botBadgeState(bot("paused", "stopped"), NOW).label).toBe("stopping…")
    expect(botBadgeState(bot("paused", "running"), NOW).label).toBe("resuming…")
    expect(botBadgeState(bot("starting", "running"), NOW).label).toBe(
      "starting…"
    )
    expect(botBadgeState(bot("running", "paused"), NOW).transient).toBe(true)
  })

  it("a stop issued mid-start reads as stopping, not starting", () => {
    expect(botBadgeState(bot("starting", "stopped"), NOW).label).toBe(
      "stopping…"
    )
  })

  it("never hides an error or killed status behind a transient label", () => {
    expect(botBadgeState(bot("error", "running"), NOW)).toEqual({
      label: "error",
      status: "error",
      transient: false,
    })
    expect(botBadgeState(bot("killed", "paused"), NOW).label).toBe("killed")
  })

  it("falls back to the real status once the in-flight window expires", () => {
    const stale = bot("running", "paused", COMMAND_GRACE_MS + 1)
    expect(botBadgeState(stale, NOW)).toEqual({
      label: "running",
      status: "running",
      transient: false,
    })
  })
})
