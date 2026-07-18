import { describe, expect, it } from "vitest"

import {
  curatedBackgrounds,
  DEFAULT_BACKGROUND,
  parseBackgroundReference,
  sameBackgroundReference,
  serializeBackgroundReference,
} from "@/lib/background-catalog"

describe("background references", () => {
  it("round-trips scene and media references", () => {
    const scene = parseBackgroundReference("scene:ocean")
    expect(scene).toEqual({ type: "scene", key: "ocean" })
    expect(serializeBackgroundReference(scene)).toBe("scene:ocean")

    const mediaId = "9f8f6a52-1234-4abc-9def-aaaabbbbcccc"
    const media = parseBackgroundReference(`media:${mediaId}`)
    expect(media).toEqual({ type: "media", mediaId })
    expect(serializeBackgroundReference(media)).toBe(`media:${mediaId}`)
  })

  it("rejects unknown scene keys, malformed ids, and junk", () => {
    expect(parseBackgroundReference("scene:atlantis")).toBeNull()
    expect(parseBackgroundReference("media:not-a-uuid")).toBeNull()
    expect(parseBackgroundReference("media:")).toBeNull()
    expect(parseBackgroundReference("lofi")).toBeNull()
    expect(parseBackgroundReference(42)).toBeNull()
    expect(parseBackgroundReference(null)).toBeNull()
    expect(serializeBackgroundReference(null)).toBeNull()
  })

  it("ignores the client-only media kind when comparing references", () => {
    const withKind = { type: "media", mediaId: "9f8f6a52-1234-4abc-9def-aaaabbbbcccc", mediaKind: "video" } as const
    const withoutKind = parseBackgroundReference("media:9f8f6a52-1234-4abc-9def-aaaabbbbcccc")
    expect(sameBackgroundReference(withKind, withoutKind)).toBe(true)
    expect(sameBackgroundReference({ type: "scene", key: "plain" }, withoutKind)).toBe(false)
  })

  it("defaults to a real curated scene", () => {
    expect(DEFAULT_BACKGROUND).toEqual({ type: "scene", key: "lofi" })
    expect(curatedBackgrounds.some((scene) => scene.key === "lofi")).toBe(true)
  })
})
