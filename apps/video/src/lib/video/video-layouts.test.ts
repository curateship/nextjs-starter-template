import { describe, expect, it } from "vitest"

import type { ProjectTimeline } from "./timeline-schema"
import { layoutPatches, splitPartner } from "./video-layouts"

type Clip = ProjectTimeline["tracks"][number]["clips"][number]

function clip(id: string, extra: Partial<Clip> = {}): Clip {
  return {
    id,
    kind: "video",
    name: id,
    mediaId: id,
    startMs: 0,
    durationMs: 10_000,
    trimStartMs: 0,
    ...extra,
  }
}

describe("the corner box", () => {
  it("sits at 30% in the bottom-right corner, filled", () => {
    const [{ patch }] = layoutPatches("corner", clip("face"), null)
    expect(patch).toMatchObject({ scale: 0.3, x: 0.82, y: 0.82, fit: "cover" })
  })

  it("keeps clear of the strips a platform covers", () => {
    // TikTok-like: 10% of the width on the right, 15% of the height below.
    const [{ patch }] = layoutPatches("corner", clip("face"), null, {
      right: 0.1,
      bottom: 0.15,
    })
    expect(patch.x).toBeCloseTo(0.72)
    expect(patch.y).toBeCloseTo(0.67)
  })
})

describe("the splits", () => {
  it("puts the picked clip on top and its partner underneath", () => {
    const patches = layoutPatches("stacked", clip("me"), clip("screen"))
    expect(patches).toEqual([
      {
        clipId: "me",
        patch: expect.objectContaining({ boxHeight: 0.5, y: 0.25, fit: "cover" }),
      },
      {
        clipId: "screen",
        patch: expect.objectContaining({ boxHeight: 0.5, y: 0.75, fit: "cover" }),
      },
    ])
  })

  it("puts them side by side the other way", () => {
    const [left, right] = layoutPatches("side-by-side", clip("a"), clip("b"))
    expect(left.patch).toMatchObject({ boxWidth: 0.5, x: 0.25 })
    expect(right.patch).toMatchObject({ boxWidth: 0.5, x: 0.75 })
  })

  it("moves only the picked clip when nothing is underneath", () => {
    expect(layoutPatches("stacked", clip("me"), null)).toHaveLength(1)
  })
})

describe("full frame", () => {
  it("clears every placing number, so it reads as it always did", () => {
    const [{ patch }] = layoutPatches(
      "full",
      clip("me", { scale: 0.3, x: 0.2, boxHeight: 0.5 }),
      null
    )
    expect(patch).toEqual({
      scale: undefined,
      x: undefined,
      y: undefined,
      boxWidth: undefined,
      boxHeight: undefined,
    })
  })
})

describe("the clip a split pairs with", () => {
  const tracks = [
    { clips: [clip("me", { startMs: 2_000, durationMs: 6_000 })] },
    {
      clips: [
        clip("early", { startMs: 0, durationMs: 3_000 }),
        clip("screen", { startMs: 3_000, durationMs: 9_000 }),
      ],
    },
  ]

  it("is the one on the lane below sharing the most time", () => {
    expect(splitPartner(tracks, "me")?.id).toBe("screen")
  })

  it("is nothing on the bottom lane", () => {
    expect(splitPartner(tracks, "screen")).toBeNull()
  })

  it("is never a sound or words", () => {
    const sound = [
      tracks[0],
      { clips: [clip("song", { kind: "audio" })] },
    ]
    expect(splitPartner(sound, "me")).toBeNull()
  })
})
