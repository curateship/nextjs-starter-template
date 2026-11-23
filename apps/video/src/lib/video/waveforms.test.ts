import { describe, expect, it } from "vitest"

import { waveformPath, waveformPlacement } from "@/lib/video/waveforms"

describe("waveformPath", () => {
  it("draws nothing for a file with no sound track", () => {
    expect(waveformPath(new Uint8Array())).toBe("")
  })

  it("mirrors each point about the middle line", () => {
    expect(waveformPath(Uint8Array.from([255, 0]))).toBe(
      "M0 1L0.5 0.00L1.5 0.97L2 1L1.5 1.03L0.5 2.00Z"
    )
  })
})

describe("waveformPlacement", () => {
  const waveform = { durationMs: 10_000 }

  it("draws the whole file at the timeline's scale", () => {
    expect(
      waveformPlacement(waveform, { trimStartMs: 0, speed: 1 }, 30)
    ).toEqual({ left: -0, width: 300 })
  })

  it("slides the shape left when the start is trimmed, without squashing it", () => {
    const untrimmed = waveformPlacement(waveform, { trimStartMs: 0, speed: 1 }, 30)
    const trimmed = waveformPlacement(waveform, { trimStartMs: 2000, speed: 1 }, 30)
    expect(trimmed.width).toBe(untrimmed.width)
    expect(trimmed.left).toBe(-60)
  })

  it("packs the shape tighter at double speed", () => {
    expect(
      waveformPlacement(waveform, { trimStartMs: 2000, speed: 2 }, 30)
    ).toEqual({ left: -30, width: 150 })
  })
})
