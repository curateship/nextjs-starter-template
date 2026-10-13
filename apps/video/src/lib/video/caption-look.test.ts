import { describe, expect, it } from "vitest"

import { captionClipStyle, DEFAULT_CAPTION_LOOK } from "./caption-look"

describe("turning the look into a caption clip", () => {
  it("puts the box colour on the clip only when the box is on", () => {
    expect(captionClipStyle(DEFAULT_CAPTION_LOOK).highlightColor).toBe(
      "#000000"
    )
    expect(
      captionClipStyle({ ...DEFAULT_CAPTION_LOOK, boxed: false }).highlightColor
    ).toBeUndefined()
  })

  it("centres the words across and uses the look's height", () => {
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
