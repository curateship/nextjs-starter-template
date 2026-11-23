import { describe, expect, it } from "vitest"

import {
  SHAPE_DRAW_ON_MS,
  shapeDesignFrame,
  shapeExportWindows,
  shapeProgress,
  shapeStrokes,
  shapeSvg,
} from "./shapes"
import { requireCanonicalTimeline } from "./timeline-schema"

const FRAME = { width: 1080, height: 1920 }
const arrow = { shape: "arrow" as const, x: 0.1, y: 0.5, toX: 0.9, toY: 0.5, lineWidth: 10 }

describe("drawing itself on", () => {
  it("is whole at once when it does not", () => {
    expect(shapeProgress({ drawOn: false }, 0)).toBe(1)
  })

  it("goes from nothing to whole over half a second, quickest at the start", () => {
    expect(shapeProgress({ drawOn: true }, 0)).toBe(0)
    expect(shapeProgress({ drawOn: true }, SHAPE_DRAW_ON_MS / 2)).toBeCloseTo(0.875)
    expect(shapeProgress({ drawOn: true }, SHAPE_DRAW_ON_MS)).toBe(1)
  })

  it("is one picture a frame in the export while it draws, then one still", () => {
    const windows = shapeExportWindows({ drawOn: true, durationMs: 3_000 }, 30)
    expect(windows).toHaveLength(16)
    expect(windows.at(-1)).toEqual({ fromMs: 500, toMs: 3_000, progress: 1 })
    expect(shapeExportWindows({ durationMs: 3_000 }, 30)).toEqual([
      { fromMs: 0, toMs: 3_000, progress: 1 },
    ])
  })
})

describe("an arrow", () => {
  it("is a shaft from tail to tip and a head at the tip", () => {
    const [shaft, head] = shapeStrokes(arrow, FRAME, 1)
    expect(shaft.d).toBe("M108 960L972 960")
    // The head's two strokes end on the tip, 35 pixels back along the shaft.
    expect(head.d).toMatch(/^M941\.1\d* 943\.5\d*L972 960L941\.1\d* 976\.4\d*$/)
  })

  it("grows out of its tail, its head riding on the end", () => {
    const [shaft] = shapeStrokes(arrow, FRAME, 0.5)
    expect(shaft.d).toBe("M108 960L540 960")
  })

  it("is nothing before it starts", () => {
    expect(shapeStrokes(arrow, FRAME, 0)).toEqual([])
  })
})

describe("a circle", () => {
  const circle = { shape: "circle" as const, x: 0.25, y: 0.25, toX: 0.75, toY: 0.5 }

  it("is the oval inside the box its two points make", () => {
    const [ring] = shapeStrokes(circle, FRAME, 1)
    expect(ring.d).toBe("M540 480A270 240 0 1 1 540 960A270 240 0 1 1 540 480")
    expect(ring.dashArray).toBeUndefined()
  })

  it("traces round from the top while it draws", () => {
    const [ring] = shapeStrokes(circle, FRAME, 0.25)
    expect(ring.dashArray).toBeCloseTo(1603.6, 0)
    expect(ring.dashOffset! / ring.dashArray!).toBeCloseTo(0.75)
  })
})

describe("the export's picture", () => {
  it("falls back to red when the colour is not one it can trust", () => {
    expect(shapeSvg({ ...arrow, color: '"/><script>' }, FRAME, 1)).toContain('stroke="#ff3b30"')
  })

  it("is drawn on a frame whose short side is 1080", () => {
    expect(shapeDesignFrame(9 / 16)).toEqual({ width: 1080, height: 1920 })
    expect(shapeDesignFrame(16 / 9)).toEqual({ width: 1920, height: 1080 })
  })
})

describe("a saved shape", () => {
  const base = { id: "s", name: "Arrow", startMs: 0, durationMs: 3000, trimStartMs: 0 }

  it("needs to say which shape it is", () => {
    expect(() =>
      requireCanonicalTimeline({ aspect: "9:16", tracks: [{ id: "t", muted: false, clips: [{ ...base, kind: "shape" }] }] })
    ).toThrow()
    expect(() =>
      requireCanonicalTimeline({ aspect: "9:16", tracks: [{ id: "t", muted: false, clips: [{ ...base, kind: "shape", shape: "arrow" }] }] })
    ).not.toThrow()
  })
})
