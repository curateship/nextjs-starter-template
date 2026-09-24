import { describe, expect, it } from "vitest"

import { createDefaultBrandKit, normalizeBrandKit } from "./brand-kit"
import {
  captionClipStyle,
  DEFAULT_CAPTION_LOOK,
  normalizeCaptionLook,
} from "./caption-look"

describe("reading the saved caption look", () => {
  it("gives a kit saved before captions had a look the standard white-on-black one", () => {
    const { captions: _captions, ...olderKit } = createDefaultBrandKit()
    expect(normalizeBrandKit(olderKit).captions).toEqual(DEFAULT_CAPTION_LOOK)
  })

  it("keeps every field that was saved", () => {
    const saved = {
      fontSize: 96,
      color: "#ffcc00",
      boxed: false,
      boxColor: "#123456",
      animation: "pop",
      wordHighlight: true,
      wordColor: "#22c55e",
      y: 0.2,
    }
    expect(normalizeCaptionLook(saved)).toEqual(saved)
  })

  it("takes the default only for a field that is missing or spoiled", () => {
    expect(
      normalizeCaptionLook({
        fontSize: "big",
        color: "red",
        boxed: "yes",
        boxColor: "#00ff00",
        animation: "spin",
        wordHighlight: "on",
        wordColor: "yellow",
        y: Number.NaN,
      })
    ).toEqual({ ...DEFAULT_CAPTION_LOOK, boxColor: "#00ff00" })
  })

  it("pulls a size or height out of range back to the nearest edge", () => {
    const look = normalizeCaptionLook({ fontSize: 400, y: -1 })
    expect(look.fontSize).toBe(140)
    expect(look.y).toBe(0.05)
  })
})

describe("turning the look into a caption clip", () => {
  it("puts the box colour on the clip only when the box is on", () => {
    expect(captionClipStyle(DEFAULT_CAPTION_LOOK).highlightColor).toBe(
      "#000000"
    )
    expect(
      captionClipStyle({ ...DEFAULT_CAPTION_LOOK, boxed: false }).highlightColor
    ).toBeUndefined()
  })

  it("centres the words across and uses the saved height", () => {
    const style = captionClipStyle({ ...DEFAULT_CAPTION_LOOK, y: 0.3 })
    expect(style.x).toBe(0.5)
    expect(style.y).toBe(0.3)
  })

  it("lights up each word only when the look says so", () => {
    expect(
      captionClipStyle(DEFAULT_CAPTION_LOOK).activeWordColor
    ).toBeUndefined()
    expect(
      captionClipStyle({
        ...DEFAULT_CAPTION_LOOK,
        wordHighlight: true,
        wordColor: "#22c55e",
      }).activeWordColor
    ).toBe("#22c55e")
  })
})
