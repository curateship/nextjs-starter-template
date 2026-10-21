import { describe, expect, it } from "vitest"

import { hookLine, readStartMs, type ViralBreakdown } from "./viral-breakdown"

function breakdown(overrides: Partial<ViralBreakdown>): ViralBreakdown {
  return {
    transcript: [],
    segments: [
      { role: "hook", startMs: 0, endMs: 3000, summary: "Opens on the result." },
      { role: "solution", startMs: 3000, endMs: 20000, summary: "Shows how." },
    ],
    scenes: [],
    ...overrides,
  }
}

describe("the words of a video's hook", () => {
  it("keeps the lines said during the hook and leaves the rest out", () => {
    const hook = hookLine(
      breakdown({
        transcript: [
          { startMs: 0, endMs: 1400, text: "Stop doing crunches." },
          { startMs: 1400, endMs: 2900, text: " Do this instead. " },
          { startMs: 3200, endMs: 6000, text: "Lie on your back." },
        ],
      })
    )
    expect(hook).toEqual({
      startMs: 0,
      endMs: 3000,
      text: "Stop doing crunches. Do this instead.",
    })
  })

  it("keeps a line that runs across the hook's edge", () => {
    const hook = hookLine(
      breakdown({
        transcript: [{ startMs: 2500, endMs: 4000, text: "Watch the knees." }],
      })
    )
    expect(hook?.text).toBe("Watch the knees.")
  })

  it("gives a silent video's on-screen text, which the transcript holds as lines too", () => {
    const hook = hookLine(
      breakdown({
        transcript: [{ startMs: 0, endMs: 20000, text: "POV: day 1 of no sugar" }],
      })
    )
    expect(hook?.text).toBe("POV: day 1 of no sugar")
  })

  it("leaves out a video with nothing said or shown during its hook", () => {
    expect(
      hookLine(
        breakdown({
          transcript: [{ startMs: 5000, endMs: 7000, text: "Too late." }],
        })
      )
    ).toBeNull()
    expect(hookLine(breakdown({ transcript: [{ startMs: 0, endMs: 900, text: "  " }] }))).toBeNull()
  })

  it("leaves out a breakdown with no hook part", () => {
    expect(
      hookLine(
        breakdown({
          segments: [{ role: "other", startMs: 0, endMs: 9000, summary: "One shot." }],
          transcript: [{ startMs: 0, endMs: 900, text: "Hello." }],
        })
      )
    ).toBeNull()
  })

  it("starts at the hook part's start, which need not be zero", () => {
    const hook = hookLine(
      breakdown({
        segments: [
          { role: "other", startMs: 0, endMs: 800, summary: "A logo." },
          { role: "hook", startMs: 800, endMs: 2500, summary: "The promise." },
        ],
        transcript: [
          { startMs: 0, endMs: 700, text: "Brand." },
          { startMs: 900, endMs: 2400, text: "You are breathing wrong." },
        ],
      })
    )
    expect(hook).toEqual({ startMs: 800, endMs: 2500, text: "You are breathing wrong." })
  })
})

describe("where an address says the video starts", () => {
  it("keeps whole milliseconds and drops anything else", () => {
    expect(readStartMs("1200")).toBe(1200)
    expect(readStartMs(800)).toBe(800)
    for (const bad of ["0", "-5", "1.5", "abc", "", null, undefined, "999999999"]) {
      expect(readStartMs(bad)).toBeUndefined()
    }
  })
})
