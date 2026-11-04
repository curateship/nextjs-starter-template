import { describe, expect, it } from "vitest"

import {
  fitSocialBox,
  isSocialClip,
  newSocialSticker,
  socialExportWindows,
  socialMovingMs,
  socialNaturalSize,
  socialStickerMarkup,
  subscribeCursor,
  SUBSCRIBE_PRESS_MS,
  wrapSocialText,
  type SocialClip,
} from "@/lib/video/social-stickers"
import { shapePathsMarkup } from "@/lib/video/shapes"
import { clipSchema } from "@/lib/video/timeline-schema"

const TALL = { width: 1080, height: 1920 }

function sticker(fields: Partial<SocialClip>): SocialClip {
  return {
    id: "s1",
    kind: "shape",
    shape: "comment",
    x: 0.1,
    y: 0.2,
    toX: 0.9,
    toY: 0.35,
    durationMs: 3500,
    ...fields,
  }
}

describe("cutting words into lines", () => {
  it("keeps words whole and lines under the width", () => {
    const lines = wrapSocialText("one two three four five six seven", 20, 120, 5)
    expect(lines.every((line) => line.length <= Math.floor(120 / (20 * 0.55)))).toBe(true)
    expect(lines.join(" ")).toBe("one two three four five six seven")
  })

  it("stops at the most lines and ends the last with …", () => {
    const lines = wrapSocialText("a ".repeat(200), 30, 200, 2)
    expect(lines).toHaveLength(2)
    expect(lines[1].endsWith("…")).toBe(true)
  })

  it("breaks a word longer than a line", () => {
    expect(wrapSocialText("x".repeat(30), 20, 110, 5)).toEqual(["x".repeat(10), "x".repeat(10), "x".repeat(10)])
  })
})

describe("what a sticker is", () => {
  it("is a shape clip with a social shape, and an arrow is not", () => {
    expect(isSocialClip({ kind: "shape", shape: "subscribe" })).toBe(true)
    expect(isSocialClip({ kind: "shape", shape: "arrow" })).toBe(false)
    expect(isSocialClip({ kind: "text", shape: "comment" })).toBe(false)
  })

  it("saves through the timeline's own check", () => {
    const parsed = clipSchema.safeParse({
      id: "s1",
      kind: "shape",
      name: "Comment reply",
      startMs: 0,
      durationMs: 3500,
      trimStartMs: 0,
      shape: "comment",
      text: "Hi",
      socialPlatform: "youtube",
      socialName: "Tyler",
      pictureUrl: "https://media.example.com/me.png",
      pointsUp: true,
      x: 0.1,
      y: 0.2,
      toX: 0.9,
      toY: 0.3,
    })
    expect(parsed.success).toBe(true)
  })

  it("is never drawn as an arrow by the shape drawer", () => {
    expect(shapePathsMarkup({ ...sticker({}), shape: "comment" }, TALL, 1)).toBe("")
  })
})

describe("drawing one", () => {
  it("writes typed words as words, never as markup", () => {
    const markup = socialStickerMarkup(
      sticker({ text: '<script>alert("x")</script>', socialName: "A&B" }),
      TALL,
      1000,
      null
    )
    expect(markup).not.toContain("<script>")
    expect(markup).toContain("&lt;script&gt;")
    expect(markup).toContain("A&amp;B")
  })

  it("uses the picture when there is one, and the first letter when not", () => {
    const withPicture = socialStickerMarkup(sticker({ socialName: "Sam" }), TALL, 1000, "data:image/png;base64,AAAA")
    expect(withPicture).toContain('href="data:image/png;base64,AAAA"')
    const without = socialStickerMarkup(sticker({ socialName: "Sam" }), TALL, 1000, null)
    expect(without).not.toContain("<image")
    expect(without).toContain(">S</text>")
  })

  it("gives each sticker's picture and shadow ids of its own", () => {
    const one = socialStickerMarkup(sticker({ id: "a1" }), TALL, 1000, "x")
    const two = socialStickerMarkup(sticker({ id: "b2" }), TALL, 1000, "x")
    expect(one).toContain('id="social-a1-avatar"')
    expect(two).toContain('id="social-b2-avatar"')
  })

  it("draws the three comment looks differently", () => {
    const looks = (["tiktok", "instagram", "youtube"] as const).map((socialPlatform) =>
      socialStickerMarkup(sticker({ socialPlatform }), TALL, 1000, null)
    )
    expect(new Set(looks).size).toBe(3)
    expect(looks[0]).toContain("Reply to")
    expect(looks[2]).toContain("#0f0f0f")
  })
})

describe("the Subscribe button's film", () => {
  const subscribe = sticker({ shape: "subscribe", socialPlatform: "youtube" })

  it("says Subscribe before the press and Subscribed after it", () => {
    expect(socialStickerMarkup(subscribe, TALL, SUBSCRIBE_PRESS_MS - 1, null)).toContain(">Subscribe<")
    expect(socialStickerMarkup(subscribe, TALL, SUBSCRIBE_PRESS_MS, null)).toContain(">Subscribed<")
  })

  it("brings the cursor in, presses, and takes it away", () => {
    expect(subscribeCursor(0)).toBeNull()
    expect(subscribeCursor(SUBSCRIBE_PRESS_MS)?.scale).toBe(0.85)
    expect(subscribeCursor(1500)?.scale).toBe(1)
    expect(subscribeCursor(2000)).toBeNull()
  })

  it("is drawn every frame until the cursor has gone, then once", () => {
    const windows = socialExportWindows(subscribe, 30)
    expect(socialMovingMs(subscribe)).toBe(1900)
    expect(windows.at(-1)).toEqual({ fromMs: 1900, toMs: 3500, atMs: 3500 })
    expect(windows.length).toBe(Math.ceil(1900 / (1000 / 30)) + 1)
  })
})

describe("entrances", () => {
  it("draws a still sticker with no entrance as one picture", () => {
    expect(socialExportWindows(sticker({ animation: "none" }), 30)).toEqual([
      { fromMs: 0, toMs: 3500, atMs: 3500 },
    ])
  })

  it("draws Pop across its quarter second, then still", () => {
    const windows = socialExportWindows(sticker({ animation: "pop" }), 30)
    expect(windows.at(-1)?.fromMs).toBe(240)
  })
})

describe("its box", () => {
  it("starts the shape of the sticker", () => {
    const fields = newSocialSticker("comment", TALL, { name: "Tyler", pictureUrl: null })
    const size = socialNaturalSize({ id: "n", durationMs: 1, kind: "shape", ...fields })
    const boxRatio = ((fields.toX - fields.x) * TALL.width) / ((fields.toY - fields.y) * TALL.height)
    expect(boxRatio).toBeCloseTo(size.width / size.height, 2)
    expect(fields.socialName).toBe("Tyler")
  })

  it("grows its box when the words grow", () => {
    const short = sticker({ text: "Hi" })
    const long = sticker({ text: "word ".repeat(40) })
    expect(fitSocialBox(long, TALL).toY).toBeGreaterThan(fitSocialBox(short, TALL).toY)
  })
})
