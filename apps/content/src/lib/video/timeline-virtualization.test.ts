import { describe, expect, it } from "vitest"

import {
  metricsCovered,
  padWindow,
  scrollToRevealClip,
  TIMELINE_OVERSCAN_PX,
  visibleClips,
  visibleTickSeconds,
  visibleTimeRange,
} from "./timeline-virtualization"

const GUTTER = 120
const RULER = 28
const ROW = 52

// The studio timeline's own numbers: 30px per second, a 1200px-wide scroll box.
const PPS = 30
const VIEWPORT = 1200

function clips(count: number, durationMs = 3000) {
  return Array.from({ length: count }, (_, index) => ({
    id: `clip-${index}`,
    startMs: index * durationMs,
    durationMs,
  }))
}

// The ruler before virtualization: every labelled second across the project.
function allTickSeconds(durationMs: number, step: number) {
  const seconds: number[] = []
  const last = Math.ceil(Math.max(durationMs, 1000) / 1000)
  for (let s = 0; s <= last; s += 1) {
    if (s % step === 0) seconds.push(s)
  }
  return seconds
}

describe("visibleTimeRange", () => {
  it("measures from the lane origin, one gutter in from the content edge", () => {
    const range = visibleTimeRange({
      scrollLeft: 720,
      viewportPx: VIEWPORT,
      gutterPx: GUTTER,
      pxPerSecond: PPS,
    })
    expect(range.startMs).toBe(20_000)
    expect(range.endMs).toBe(60_000)
  })

  it("clamps to zero at the left edge instead of going negative", () => {
    const range = visibleTimeRange({
      scrollLeft: 0,
      viewportPx: VIEWPORT,
      gutterPx: GUTTER,
      pxPerSecond: PPS,
    })
    expect(range.startMs).toBe(0)
    expect(range.endMs).toBe(36_000)
  })

  it("returns an empty range when the zoom has not been measured yet", () => {
    const range = visibleTimeRange({
      scrollLeft: 500,
      viewportPx: VIEWPORT,
      gutterPx: GUTTER,
      pxPerSecond: 0,
    })
    expect(range).toEqual({ startMs: 0, endMs: 0 })
  })
})

describe("padWindow", () => {
  it("adds the overscan on both sides", () => {
    const padded = padWindow({ startMs: 20_000, endMs: 60_000 }, PPS)
    const padMs = (TIMELINE_OVERSCAN_PX / PPS) * 1000
    expect(padded.startMs).toBe(20_000 - padMs)
    expect(padded.endMs).toBe(60_000 + padMs)
  })

  it("never pads back past the start of the project", () => {
    const padded = padWindow({ startMs: 0, endMs: 36_000 }, PPS)
    expect(padded.startMs).toBe(0)
  })
})

describe("metricsCovered", () => {
  const drawn = { scrollLeft: 6800, viewportPx: VIEWPORT }

  it("is true while the viewport sits inside what is drawn", () => {
    expect(metricsCovered(drawn, drawn)).toBe(true)
    expect(
      metricsCovered(drawn, { scrollLeft: 7200, viewportPx: VIEWPORT })
    ).toBe(true)
    expect(
      metricsCovered(drawn, { scrollLeft: 6400, viewportPx: VIEWPORT })
    ).toBe(true)
  })

  it("is false once the viewport passes the overscan on either side", () => {
    expect(
      metricsCovered(drawn, {
        scrollLeft: 6800 + TIMELINE_OVERSCAN_PX + 1,
        viewportPx: VIEWPORT,
      })
    ).toBe(false)
    expect(
      metricsCovered(drawn, {
        scrollLeft: 6800 - TIMELINE_OVERSCAN_PX - 1,
        viewportPx: VIEWPORT,
      })
    ).toBe(false)
  })

  it("is false when the box grows past what was drawn for it", () => {
    expect(
      metricsCovered(drawn, { scrollLeft: 6800, viewportPx: VIEWPORT + 600 })
    ).toBe(false)
  })

  // Zoom moves every timestamp but no scroll offset, so a measurement taken
  // before a zoom still describes what is on screen after it.
  it("ignores the zoom entirely", () => {
    const before = padWindow(
      visibleTimeRange({ ...drawn, gutterPx: GUTTER, pxPerSecond: PPS }),
      PPS
    )
    const after = padWindow(
      visibleTimeRange({ ...drawn, gutterPx: GUTTER, pxPerSecond: PPS * 3 }),
      PPS * 3
    )
    expect(metricsCovered(drawn, drawn)).toBe(true)
    expect(before).not.toEqual(after)
  })
})

describe("visibleClips", () => {
  const track = clips(10)

  it("keeps clips that overlap the window and drops the rest", () => {
    const found = visibleClips(track, { startMs: 10_000, endMs: 16_000 })
    expect(found.map((entry) => entry.index)).toEqual([3, 4, 5])
  })

  it("keeps a clip that starts before the window but reaches into it", () => {
    const long = [
      { id: "a", startMs: 0, durationMs: 60_000 },
      { id: "b", startMs: 90_000, durationMs: 1_000 },
    ]
    const found = visibleClips(long, { startMs: 30_000, endMs: 40_000 })
    expect(found.map((entry) => entry.clip.id)).toEqual(["a"])
  })

  it("reports the index in the full track so an off-screen neighbour is reachable", () => {
    const found = visibleClips(track, { startMs: 12_500, endMs: 13_000 })
    expect(found).toHaveLength(1)
    expect(found[0].index).toBe(4)
    expect(track[found[0].index - 1].id).toBe("clip-3")
  })

  it("returns nothing past the end of the project", () => {
    expect(visibleClips(track, { startMs: 60_000, endMs: 70_000 })).toEqual([])
  })

  // The editor sorts as it edits, but a saved timeline loads exactly as stored
  // and the schema does not enforce an order — an out-of-order clip must not
  // hide the ones behind it.
  it("finds clips stored out of start order", () => {
    const unsorted = [
      { id: "late", startMs: 30_000, durationMs: 3_000 },
      { id: "early", startMs: 0, durationMs: 3_000 },
      { id: "middle", startMs: 12_000, durationMs: 3_000 },
    ]
    expect(
      visibleClips(unsorted, { startMs: 10_000, endMs: 16_000 }).map(
        (entry) => entry.clip.id
      )
    ).toEqual(["middle"])
    expect(
      visibleClips(unsorted, { startMs: 0, endMs: 1_000 }).map(
        (entry) => entry.clip.id
      )
    ).toEqual(["early"])
  })

  it("mounts a viewport-sized slice no matter how long the project is", () => {
    const window = padWindow(
      visibleTimeRange({
        scrollLeft: 0,
        viewportPx: VIEWPORT,
        gutterPx: GUTTER,
        pxPerSecond: PPS,
      }),
      PPS
    )
    const counts = [100, 500, 1000].map(
      (size) => visibleClips(clips(size), window).length
    )
    expect(counts).toEqual([counts[0], counts[0], counts[0]])
    // A 1200px viewport plus 480px of overscan at 30px/s holds ~17 three-second
    // clips; the bound is what matters, not the exact figure.
    expect(counts[0]).toBeLessThan(30)
  })

  it("stays bounded scrolled deep into a 1000-clip project", () => {
    const track1000 = clips(1000)
    const window = padWindow(
      visibleTimeRange({
        scrollLeft: 45_000,
        viewportPx: VIEWPORT,
        gutterPx: GUTTER,
        pxPerSecond: PPS,
      }),
      PPS
    )
    const found = visibleClips(track1000, window)
    expect(found.length).toBeLessThan(30)
    expect(found[0].index).toBeGreaterThan(400)
  })
})

describe("visibleTickSeconds", () => {
  it("draws the same seconds the full ruler would, limited to the window", () => {
    const durationMs = 120_000
    const step = 2
    const window = { startMs: 30_000, endMs: 50_000 }
    const expected = allTickSeconds(durationMs, step).filter(
      (s) => s * 1000 >= window.startMs - 1000 && s * 1000 <= window.endMs + 1000
    )
    expect(visibleTickSeconds(window, durationMs, step)).toEqual(expected)
  })

  it("never runs past the end of the project", () => {
    const ticks = visibleTickSeconds({ startMs: 0, endMs: 90_000 }, 20_000, 1)
    expect(ticks.at(-1)).toBe(20)
  })

  it("keeps a minimum one-second project on the ruler", () => {
    expect(visibleTickSeconds({ startMs: 0, endMs: 5_000 }, 0, 1)).toEqual([
      0, 1,
    ])
  })
})

describe("scrollToRevealClip", () => {
  const base = {
    trackIndex: 0,
    pxPerSecond: PPS,
    scrollLeft: 0,
    scrollTop: 0,
    viewportWidth: VIEWPORT,
    viewportHeight: 200,
    gutterPx: GUTTER,
    rulerPx: RULER,
    rowHeightPx: ROW,
  }

  it("leaves a clip that is already on screen where it is", () => {
    const offsets = scrollToRevealClip({
      ...base,
      clip: { startMs: 10_000, durationMs: 2_000 },
    })
    expect(offsets).toEqual({ left: 0, top: 0 })
  })

  it("scrolls right until a clip past the viewport is fully visible", () => {
    const offsets = scrollToRevealClip({
      ...base,
      clip: { startMs: 60_000, durationMs: 2_000 },
    })
    // Clip spans 1920–1980 in content pixels; the 1200px viewport ends at 1980.
    expect(offsets.left).toBe(780)
    expect(offsets.top).toBe(0)
  })

  it("scrolls back so a clip behind the sticky gutter clears it", () => {
    const offsets = scrollToRevealClip({
      ...base,
      scrollLeft: 1_000,
      clip: { startMs: 30_000, durationMs: 2_000 },
    })
    // Clip starts at 1020; it must sit a full gutter in from the left edge.
    expect(offsets.left).toBe(900)
  })

  it("aligns a clip wider than the viewport to its left edge", () => {
    const offsets = scrollToRevealClip({
      ...base,
      clip: { startMs: 60_000, durationMs: 120_000 },
    })
    expect(offsets.left).toBe(1_920 - GUTTER)
  })

  it("brings a track below the fold up without hiding it under the ruler", () => {
    const offsets = scrollToRevealClip({
      ...base,
      trackIndex: 6,
      clip: { startMs: 0, durationMs: 2_000 },
    })
    // Row 6 spans 340–392; the 200px-tall viewport must end at 392.
    expect(offsets.top).toBe(192)
  })

  it("never scrolls to a negative offset", () => {
    const offsets = scrollToRevealClip({
      ...base,
      scrollLeft: 40,
      clip: { startMs: 0, durationMs: 2_000 },
    })
    expect(offsets).toEqual({ left: 0, top: 0 })
  })
})
