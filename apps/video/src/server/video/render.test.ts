import { describe, expect, it } from "vitest"

import { RENDER_QUALITIES } from "@/lib/video/render"
import {
  exportDurationMs,
  renderSize,
  timelineEndMs,
} from "@/server/video/render"

/**
 * The numbers the finished file is described by. All three are stored in
 * columns that only take whole numbers, and the width and height have to be
 * even on top of that, so a fraction anywhere here fails the export after the
 * render has already happened.
 */

describe("how long the export runs", () => {
  it("is a whole number of milliseconds, however the clips fall", () => {
    // Real clip lengths: the editor works in frames, so they land on fractions.
    const tracks = [
      {
        id: "a",
        muted: false,
        clips: [
          { id: "1", startMs: 0, durationMs: 2014.0625 },
          { id: "2", startMs: 2014.0625, durationMs: 914.0625 },
        ],
      },
    ]
    const end = timelineEndMs(tracks as never)
    expect(end).not.toBe(Math.round(end))
    expect(Number.isInteger(exportDurationMs(end, 0))).toBe(true)
  })

  it("counts the end card in", () => {
    expect(exportDurationMs(4000, 3000)).toBe(7000)
  })

  it("is nothing when there is nothing on the timeline", () => {
    expect(timelineEndMs([])).toBe(0)
  })
})

describe("the size of the picture", () => {
  it("is whole and even for every shape and every quality", () => {
    for (const aspect of ["9:16", "16:9", "1:1", "4:3"] as const) {
      for (const quality of RENDER_QUALITIES) {
        const size = renderSize(aspect, quality.id)
        expect(size.width % 2).toBe(0)
        expect(size.height % 2).toBe(0)
        expect(Number.isInteger(size.width)).toBe(true)
        expect(Number.isInteger(size.height)).toBe(true)
      }
    }
  })
})
