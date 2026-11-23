import { describe, expect, it } from "vitest"

import { BUILT_IN_STICKERS, MAX_STICKERS, readEmoji, readStickerList } from "./stickers"

describe("readEmoji", () => {
  it("takes one emoji, including ones built from several characters", () => {
    for (const emoji of ["🔥", "🇬🇧", "👍🏽", "👨‍👩‍👧", "1️⃣", "➡️"]) {
      expect(readEmoji(emoji)).toBe(emoji)
    }
  })

  it("trims the spaces an emoji picker leaves around it", () => {
    expect(readEmoji("  ✨ ")).toBe("✨")
  })

  it("saves a bare heart in its emoji form, so the two are one sticker", () => {
    expect(readEmoji("❤")).toBe("❤️")
  })

  it("refuses words, two emoji at once and nothing at all", () => {
    for (const value of ["", "   ", "a", "hi", "🔥🔥", "🔥 ✨", "1"]) {
      expect(readEmoji(value)).toBeNull()
    }
  })
})

describe("readStickerList", () => {
  it("reads a stored list in order", () => {
    expect(
      readStickerList([
        { kind: "image", mediaId: "m1" },
        { kind: "emoji", emoji: "🔥" },
      ])
    ).toEqual([
      { kind: "image", mediaId: "m1" },
      { kind: "emoji", emoji: "🔥" },
    ])
  })

  it("drops entries that do not read, and repeats", () => {
    expect(
      readStickerList([
        { kind: "emoji", emoji: "🔥" },
        { kind: "emoji", emoji: "word" },
        { kind: "sound", mediaId: "m1" },
        "🔥",
        { kind: "emoji", emoji: "🔥" },
      ])
    ).toEqual([{ kind: "emoji", emoji: "🔥" }])
  })

  it("reads anything that is not a list as an empty one", () => {
    expect(readStickerList(null)).toEqual([])
    expect(readStickerList({})).toEqual([])
  })

  it("stops at the most a list can hold", () => {
    const many = Array.from({ length: MAX_STICKERS + 5 }, (_, index) => ({
      kind: "image",
      mediaId: `m${index}`,
    }))
    expect(readStickerList(many)).toHaveLength(MAX_STICKERS)
  })
})

describe("the built-in stickers", () => {
  it("are the eight the Text panel has always shown, in the same order", () => {
    expect(BUILT_IN_STICKERS.map((sticker) => sticker.kind === "emoji" && sticker.emoji)).toEqual(
      ["🔥", "✨", "👀", "☕", "💯", "➡️", "❤️", "⭐"]
    )
  })

  it("all pass the same check a typed emoji does", () => {
    for (const sticker of BUILT_IN_STICKERS) {
      if (sticker.kind === "emoji") expect(readEmoji(sticker.emoji)).toBe(sticker.emoji)
    }
  })
})
