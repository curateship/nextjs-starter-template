import { describe, expect, it } from "vitest"

import {
  progressMarkColor,
  progressMarkFilters,
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

describe("ad marks on the progress bar", () => {
  const bar = { edge: "bottom" as const, color: "#ff0000", thickness: 8, inset: 0 }
  const frame = { width: 1080, height: 1920 }

  it("draws one box per ad break, in white on a dark bar and black on a pale one", () => {
    const filter = progressMarkFilters({
      bar,
      frame,
      marksMs: [30_000, 60_000],
      durationMs: 120_000,
      inputLabel: "v3",
      outputLabel: "v4",
    })
    expect(filter).toBe(
      "[v3]drawbox=x=266:y=1912:w=8:h=8:color=0xffffff:t=fill,drawbox=x=536:y=1912:w=8:h=8:color=0xffffff:t=fill[v4]"
    )
    expect(progressMarkColor({ ...bar, color: "#ffee00" })).toBe("#000000")
  })

  it("draws nothing without a break inside the video", () => {
    expect(
      progressMarkFilters({ bar, frame, marksMs: [0], durationMs: 120_000, inputLabel: "a", outputLabel: "b" })
    ).toBeNull()
  })
})
