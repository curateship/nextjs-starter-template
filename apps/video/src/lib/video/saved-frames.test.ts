import { describe, expect, it } from "vitest"

import { savedFrameName } from "@/lib/video/saved-frames"

describe("what a saved frame is called", () => {
  it("names the project and the moment in seconds under a minute", () => {
    expect(savedFrameName("Summer trip", 12_430)).toBe("Summer trip at 12.4s")
  })

  it("counts minutes once past one, with the seconds padded", () => {
    expect(savedFrameName("Summer trip", 65_400)).toBe(
      "Summer trip at 1m 05.4s"
    )
  })

  it("rounds up into the next minute rather than writing 60 seconds", () => {
    expect(savedFrameName("Trip", 59_960)).toBe("Trip at 1m 00.0s")
  })

  it("has no colon, which the library would strip out of the file name", () => {
    expect(savedFrameName("Trip", 29 * 60_000 + 1_000)).not.toContain(":")
  })

  it("stands in a name when the project has none", () => {
    expect(savedFrameName("  ", 0)).toBe("Video at 0.0s")
  })
})
