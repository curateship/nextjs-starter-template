import { describe, expect, it } from "vitest"

import {
  canPunchIn,
  clipPunchIns,
  movePunchIn,
  newPunchIn,
  PUNCH_ONLY_FULL_FRAME,
  PUNCH_OVERLAPS,
  punchInFilter,
  punchScaleAt,
  punchSpanOnClip,
  type PunchIn,
} from "@/lib/video/punch-ins"

const clip = (extra: Record<string, unknown> = {}) => ({
  kind: "video",
  startMs: 10_000,
  durationMs: 8_000,
  trimStartMs: 2_000,
  ...extra,
})

const zoom = (sourceStartMs: number, sourceEndMs: number, extra: Partial<PunchIn> = {}): PunchIn => ({
  sourceStartMs,
  sourceEndMs,
  scale: 1.3,
  ease: "ease",
  ...extra,
})

describe("zoom in on a moment", () => {
  it("adds a 2 second zoom at the playhead, kept in the file's time", () => {
    const made = newPunchIn(clip(), 4_000)
    expect(made).toEqual({ punch: zoom(6_000, 8_000) })
  })

  it("counts in the file's time on a faster clip", () => {
    const made = newPunchIn(clip({ speed: 2 }), 1_000)
    expect(made).toEqual({ punch: zoom(4_000, 8_000) })
    expect(punchSpanOnClip(clip({ speed: 2 }), zoom(4_000, 8_000))).toEqual({ startMs: 1_000, endMs: 3_000 })
  })

  it("stops short of the next zoom and refuses one on top of another", () => {
    const existing = clip({ punchIns: [zoom(7_000, 8_000)] })
    expect(newPunchIn(existing, 4_000)).toEqual({ punch: zoom(6_000, 7_000) })
    expect(newPunchIn(existing, 5_500)).toEqual({ refusal: PUNCH_OVERLAPS })
  })

  it("is only for a video that fills the frame", () => {
    expect(canPunchIn(clip({ scale: 0.5 }))).toBe(false)
    expect(newPunchIn(clip({ boxWidth: 0.5 }), 0)).toEqual({ refusal: PUNCH_ONLY_FULL_FRAME })
    expect(clipPunchIns(clip({ scale: 0.5, punchIns: [zoom(3_000, 4_000)] }))).toEqual([])
  })

  it("eases in, holds, and eases out", () => {
    const zoomed = clip({ punchIns: [zoom(6_000, 8_000)] })
    expect(punchScaleAt(zoomed, 5_999)).toBe(1)
    expect(punchScaleAt(zoomed, 6_150)).toBeCloseTo(1.15, 5)
    expect(punchScaleAt(zoomed, 7_000)).toBe(1.3)
    expect(punchScaleAt(zoomed, 8_000)).toBe(1)
    const jump = clip({ punchIns: [zoom(6_000, 8_000, { ease: "jump" })] })
    expect(punchScaleAt(jump, 6_000)).toBe(1.3)
  })

  it("moves an end without crossing its neighbour or getting too short", () => {
    const two = clip({ punchIns: [zoom(3_000, 4_000), zoom(6_000, 8_000)] })
    const moved = movePunchIn(two, 0, 1_000, 9_000)
    expect(moved[0]).toEqual(zoom(3_000, 6_000))
    const squeezed = movePunchIn(two, 1, 4_000, 4_100)
    expect(squeezed[1].sourceEndMs - squeezed[1].sourceStartMs).toBe(300)
  })

  it("writes the export's ffmpeg stages from the same numbers", () => {
    const zoomed = clip({ punchIns: [zoom(6_000, 8_000, { ease: "jump" })] })
    const stages = punchInFilter(zoomed, { width: 1080, height: 1920, sourceStartS: 2, rate: 30 })
    expect(stages[0]).toBe("fps=30")
    expect(stages.at(-1)).toContain("0.3*between((2+in/30),6,8)")
    expect(punchInFilter(clip(), { width: 1080, height: 1920, sourceStartS: 2, rate: 30 })).toEqual([])
  })
})
