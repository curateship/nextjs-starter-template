import { describe, expect, it } from "vitest"

import {
  newProgressBar,
  progressBarFilters,
  progressBarSchema,
  progressBarShare,
  progressBarThicknessPx,
  progressBarTopPx,
} from "./progress-bar"

const TALL = { width: 1080, height: 1920 }

describe("how full the bar is", () => {
  it("is half way at the half-way point of a 30 second video", () => {
    expect(progressBarShare(0, 30_000)).toBe(0)
    expect(progressBarShare(15_000, 30_000)).toBe(0.5)
    expect(progressBarShare(30_000, 30_000)).toBe(1)
  })

  it("never runs past either end, and is empty with nothing on the timeline", () => {
    expect(progressBarShare(40_000, 30_000)).toBe(1)
    expect(progressBarShare(-5, 30_000)).toBe(0)
    expect(progressBarShare(5, 0)).toBe(0)
  })
})

describe("where the bar sits", () => {
  it("starts at the bottom, white, eight pixels, inside the platform's strip", () => {
    expect(newProgressBar(0.15)).toEqual({
      edge: "bottom",
      color: "#ffffff",
      thickness: 8,
      inset: 0.15,
    })
  })

  it("counts its thickness on a frame whose short side is 1080", () => {
    const bar = newProgressBar(0)
    expect(progressBarThicknessPx(bar, TALL)).toBe(8)
    expect(progressBarThicknessPx(bar, { width: 1920, height: 1080 })).toBe(8)
    // A low quality tall export is 480 wide, so the bar is 4/9 as thick.
    expect(progressBarThicknessPx(bar, { width: 480, height: 854 })).toBeCloseTo(3.56, 2)
  })

  it("sits its inset in from the bottom, or from the top", () => {
    const bar = newProgressBar(0.1)
    expect(progressBarTopPx(bar, TALL)).toBe(1920 - 192 - 8)
    expect(progressBarTopPx({ ...bar, edge: "top" }, TALL)).toBe(192)
  })

  it("refuses a colour ffmpeg could not be handed", () => {
    expect(progressBarSchema.safeParse({ ...newProgressBar(0), color: "red" }).success).toBe(false)
    expect(progressBarSchema.safeParse({ ...newProgressBar(0), color: "#ff0000;x" }).success).toBe(false)
  })
})

describe("the export's drawing", () => {
  it("slides a strip of the colour in from the left over the whole length", () => {
    const [source, overlay] = progressBarFilters({
      bar: { edge: "bottom", color: "#ff3b30", thickness: 8, inset: 0 },
      frame: TALL,
      durationS: 30,
      fromS: 0,
      fps: 30,
      inputLabel: "v3",
      outputLabel: "v4",
    })
    expect(source).toBe("color=c=0xff3b30:s=1080x8:r=30:d=30.000[pbar]")
    expect(overlay).toBe(
      "[v3][pbar]overlay=x='-w+w*min(t/30.000,1)':y=1912:eof_action=pass[v4]"
    )
  })
})
