import { describe, expect, it } from "vitest"

import {
  captionClipStyle,
  captionTextClips,
  DEFAULT_CAPTION_LOOK,
  DEFAULT_CAPTION_SETTINGS,
  readCaptionLook,
  splitCaptionLines,
  type CaptionLook,
  type CaptionPlacement,
} from "./caption-look"
import { DEFAULT_SAFE_BOXES, SAFE_BOX_FRAME } from "./safe-box"
import { TEXT_LINE_HEIGHT } from "./text-lines"
import { DESIGN_HEIGHT } from "./timeline-utils"

function placed(
  look: Partial<CaptionLook> = {},
  aspect: CaptionPlacement["aspect"] = "9:16"
): CaptionPlacement {
  return {
    ...DEFAULT_CAPTION_SETTINGS,
    look: { ...DEFAULT_CAPTION_LOOK, ...look },
    aspect,
  }
}

function ids() {
  let next = 0
  return () => `id-${(next += 1)}`
}

describe("reading a saved look", () => {
  it("reads a look saved without a font as Inter", () => {
    const look = readCaptionLook({ fontSize: 80, color: "#ff0000" })
    expect(look.fontId).toBe("inter")
    expect(look.fontSize).toBe(80)
    expect(look.wordsPerCaption).toBe(4)
    expect(look.platform).toBeNull()
  })

  it("is the standard look when nothing is saved", () => {
    expect(readCaptionLook(null)).toEqual(DEFAULT_CAPTION_LOOK)
  })

  it("takes a field that no longer reads from the standard look", () => {
    const look = readCaptionLook({ fontId: "comic-sans", fontSize: 90 })
    expect(look.fontId).toBe("inter")
    expect(look.fontSize).toBe(90)
  })
})

describe("turning the look into a caption clip", () => {
  it("puts the box colour on the clip only when the box is on", () => {
    expect(captionClipStyle(placed(), "Hi").highlightColor).toBe("#000000")
    expect(
      captionClipStyle(placed({ boxed: false }), "Hi").highlightColor
    ).toBeUndefined()
  })

  it("centres the words across and uses the look's height", () => {
    const style = captionClipStyle(placed({ y: 0.3 }), "Hi")
    expect(style.x).toBe(0.5)
    expect(style.y).toBe(0.3)
    expect(style).not.toHaveProperty("wrapWidth")
  })

  it("lights up each word only when the look says so", () => {
    expect(captionClipStyle(placed(), "Hi").activeWordColor).toBeUndefined()
    expect(
      captionClipStyle(
        placed({ wordHighlight: true, wordColor: "#22c55e" }),
        "Hi"
      ).activeWordColor
    ).toBe("#22c55e")
  })

  it("carries the font, and an outline only when it has a width", () => {
    expect(captionClipStyle(placed({ fontId: "anton" }), "Hi").fontId).toBe(
      "anton"
    )
    expect(captionClipStyle(placed(), "Hi")).not.toHaveProperty("strokeColor")
    expect(
      captionClipStyle(
        placed({ strokeColor: "#facc15", strokeWidth: 5 }),
        "Hi"
      )
    ).toMatchObject({ strokeColor: "#facc15", strokeWidth: 5 })
  })
})

describe("keeping inside a platform's box", () => {
  it("changes nothing with no platform picked", () => {
    const style = captionClipStyle(placed(), "Said out loud")
    expect(style).toMatchObject({ x: 0.5, y: DEFAULT_CAPTION_LOOK.y })
    expect(style).not.toHaveProperty("wrapWidth")
  })

  it("changes nothing on a project that is not tall", () => {
    const style = captionClipStyle(
      placed({ platform: "tiktok" }, "16:9"),
      "Said out loud"
    )
    expect(style).toMatchObject({ x: 0.5, y: DEFAULT_CAPTION_LOOK.y })
  })

  it("lifts the caption so its bottom edge is above TikTok's bottom strip", () => {
    const style = captionClipStyle(placed({ platform: "tiktok" }), "Said out loud")
    // One line of 64px words on a box: 1.15 lines plus 0.4 of padding.
    const height = 64 * TEXT_LINE_HEIGHT + 64 * 0.4
    const bottomEdge = style.y + height / 2 / DESIGN_HEIGHT
    const boxBottom = 1 - DEFAULT_SAFE_BOXES.tiktok.bottom / SAFE_BOX_FRAME.height
    expect(bottomEdge).toBeLessThanOrEqual(boxBottom + 0.0001)
    expect(style.y).toBeLessThan(DEFAULT_CAPTION_LOOK.y)
    // TikTok's right strip pulls the middle left and narrows the line.
    expect(style.x).toBeLessThan(0.5)
    expect(style.wrapWidth).toBeLessThan(0.9)
  })

  it("leaves a caption that already sits inside the box where it was", () => {
    const style = captionClipStyle(
      placed({ platform: "shorts", y: 0.5 }),
      "Said out loud"
    )
    expect(style.y).toBe(0.5)
  })
})

describe("words at a time", () => {
  const line = {
    startMs: 1000,
    endMs: 3000,
    text: "one two three four",
    words: [
      { startMs: 1000, endMs: 1400 },
      { startMs: 1500, endMs: 1900 },
      { startMs: 2000, endMs: 2400 },
      { startMs: 2500, endMs: 2900 },
    ],
  }

  it("cuts four words at three a line into two and two, back to back", () => {
    const pieces = splitCaptionLines([line], 3)
    expect(pieces.map((piece) => piece.text)).toEqual(["one two", "three four"])
    expect(pieces.map((piece) => [piece.startMs, piece.endMs])).toEqual([
      [1000, 2000],
      [2000, 3000],
    ])
    expect(pieces[1].words).toEqual(line.words.slice(2))
  })

  it("leaves a line alone when it already fits, or has no word times", () => {
    expect(splitCaptionLines([line], 4)).toEqual([line])
    const plain = { startMs: 0, endMs: 900, text: "one two three four" }
    expect(splitCaptionLines([plain], 1)).toEqual([plain])
  })
})

describe("laying caption clips", () => {
  it("writes the words in capitals when the look says so", () => {
    const [clip] = captionTextClips(
      [{ startMs: 0, endMs: 900, text: "said out loud" }],
      placed({ capitals: true }),
      { newId: ids() }
    )
    expect(clip.text).toBe("SAID OUT LOUD")
    expect(clip.name).toBe("SAID OUT LOUD")
  })

  it("writes Turkish capitals in Turkish", () => {
    const line = [{ startMs: 0, endMs: 900, text: "istanbul" }]
    const look = placed({ capitals: true })
    const [turkish] = captionTextClips(line, look, {
      newId: ids(),
      locale: "tr",
    })
    expect(turkish.text).toBe("İSTANBUL")
  })

  it("draws a line without word times plain, even with word by word on", () => {
    const [clip] = captionTextClips(
      [{ startMs: 0, endMs: 900, text: "hola" }],
      placed({ wordHighlight: true }),
      { newId: ids() }
    )
    expect(clip.activeWordColor).toBeUndefined()
    expect(clip.wordTimes).toBeUndefined()
  })

  it("moves every caption to start where it was asked to", () => {
    const clips = captionTextClips(
      [{ startMs: 100, endMs: 900, text: "hi" }],
      placed(),
      { newId: ids(), atMs: 5000, spokenBy: "voice-1" }
    )
    expect(clips[0]).toMatchObject({
      startMs: 5100,
      durationMs: 800,
      spokenBy: "voice-1",
    })
  })
})
