import { describe, expect, it } from "vitest"

import {
  clipScale,
  containedShare,
  isPlacedPicture,
  pictureBoxCss,
  pictureOverlayPosition,
  pictureScaleFilter,
  storedClipScale,
} from "./clip-size"

describe("clipScale", () => {
  it("reads an unset picture as the full frame", () => {
    expect(clipScale({ kind: "image" })).toBe(1)
  })

  it("keeps a value inside the range it allows", () => {
    expect(clipScale({ kind: "image", scale: 0.01 })).toBe(0.1)
    expect(clipScale({ kind: "image", scale: 0.3 })).toBe(0.3)
  })

  it("never shrinks a video, which the preview always draws full frame", () => {
    expect(clipScale({ kind: "video", scale: 0.3 })).toBe(1)
    expect(isPlacedPicture({ kind: "video", scale: 0.3 })).toBe(false)
  })
})

describe("storedClipScale", () => {
  it("stores nothing for the full frame, so older projects match", () => {
    expect(storedClipScale(1)).toBeUndefined()
    expect(storedClipScale(0.5)).toBe(0.5)
  })
})

describe("full-frame pictures", () => {
  const clip = { kind: "image", x: 0.2, y: 0.9 }

  it("fill the stage and ignore any position, as they always have", () => {
    expect(pictureBoxCss(clip)).toEqual({
      left: "0%",
      top: "0%",
      width: "100%",
      height: "100%",
    })
  })

  it("export exactly as before: no shrinking, centred", () => {
    expect(pictureScaleFilter(clip)).toBeNull()
    expect(pictureOverlayPosition(clip)).toEqual({ x: "(W-w)/2", y: "(H-h)/2" })
  })
})

describe("a picture smaller than the frame", () => {
  const clip = { kind: "image", scale: 0.3, x: 0.25, y: 0.75 }

  it("sits with its middle on its position in the preview", () => {
    expect(pictureBoxCss(clip)).toEqual({
      left: "10%",
      top: "60%",
      width: "30%",
      height: "30%",
    })
  })

  it("hugs the picture once its shape is known", () => {
    // A square logo in a tall 9:16 frame covers all the width and 56.25% of
    // the height, so at 30% it is 30% across and 16.875% down.
    const share = containedShare(1, 9 / 16)
    expect(share).toEqual({ width: 1, height: 0.5625 })
    const box = pictureBoxCss(clip, share)
    expect(parseFloat(box.width)).toBeCloseTo(30)
    expect(parseFloat(box.height)).toBeCloseTo(16.875)
    expect(parseFloat(box.top)).toBeCloseTo(75 - 16.875 / 2)
  })

  it("is shrunk to even sides and overlaid at the same spot in the export", () => {
    expect(pictureScaleFilter(clip)).toBe(
      "scale=trunc(iw*0.3/2)*2:trunc(ih*0.3/2)*2"
    )
    expect(pictureOverlayPosition(clip)).toEqual({
      x: "W*0.25-w/2",
      y: "H*0.75-h/2",
    })
  })

  it("is centred when it has never been dragged", () => {
    expect(pictureOverlayPosition({ kind: "image", scale: 0.3 })).toEqual({
      x: "W*0.5-w/2",
      y: "H*0.5-h/2",
    })
  })
})

describe("containedShare", () => {
  it("fits a wide picture across a tall frame", () => {
    expect(containedShare(16 / 9, 9 / 16).width).toBe(1)
  })

  it("fits a tall picture down a wide frame", () => {
    expect(containedShare(9 / 16, 16 / 9).height).toBe(1)
  })

  it("falls back to the whole frame on a shape it cannot read", () => {
    expect(containedShare(0, 1)).toEqual({ width: 1, height: 1 })
  })
})
