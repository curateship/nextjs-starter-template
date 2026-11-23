import { describe, expect, it } from "vitest"

import {
  chapterLines,
  chapterProblems,
  chapterText,
  chapterTime,
} from "@/lib/video/youtube-chapters"

const pin = (atMs: number, name: string) => ({ id: `${atMs}`, atMs, name })

describe("chapters from markers", () => {
  it("writes the named markers as YouTube lines, in time order", () => {
    const lines = chapterLines([pin(95_000, "Outro"), pin(0, "Intro"), pin(40_000, "The trick"), pin(60_000, "")])
    expect(chapterText(lines)).toBe("0:00 Intro\n0:40 The trick\n1:35 Outro")
    expect(chapterProblems(lines, 120_000)).toEqual([])
  })

  it("opens with a Start chapter when no marker sits at the start", () => {
    expect(chapterLines([pin(30_000, "Middle")])).toEqual([
      { atMs: 0, name: "Start" },
      { atMs: 30_000, name: "Middle" },
    ])
    expect(chapterLines([pin(600, "Hook")])).toEqual([{ atMs: 600, name: "Hook" }])
  })

  it("rounds down to the second and writes hours once there are any", () => {
    expect(chapterTime(59_999)).toBe("0:59")
    expect(chapterTime(3_723_000)).toBe("1:02:03")
  })

  it("says which YouTube rule a list breaks", () => {
    const lines = chapterLines([pin(0, "Intro"), pin(5_000, "Too soon")])
    const problems = chapterProblems(lines, 60_000)
    expect(problems[0]).toMatch(/at least 3 chapters/)
    expect(problems[1]).toMatch(/Too short: 0:00 Intro\./)
  })

  it("has nothing to list without named markers", () => {
    expect(chapterLines([pin(0, " ")])).toEqual([])
  })
})
