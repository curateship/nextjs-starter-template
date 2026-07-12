import { describe, expect, it } from "vitest"

import { summarizeGroupProgress } from "./backtest-progress"

describe("summarizeGroupProgress", () => {
  it("counts finished runs and flags when the whole group is terminal", () => {
    expect(
      summarizeGroupProgress([
        { status: "done" },
        { status: "running" },
        { status: "pending" },
      ])
    ).toEqual({ done: 1, total: 3, allTerminal: false })

    // Errored runs count as finished — the group must not poll forever.
    expect(
      summarizeGroupProgress([{ status: "done" }, { status: "error" }])
    ).toEqual({ done: 2, total: 2, allTerminal: true })
  })

  it("never reports an empty group as terminal", () => {
    // Right after enqueueing, a poll can race the insert and see zero rows.
    expect(summarizeGroupProgress([])).toEqual({
      done: 0,
      total: 0,
      allTerminal: false,
    })
  })
})
