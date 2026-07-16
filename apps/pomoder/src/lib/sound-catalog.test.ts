import { describe, expect, it } from "vitest"

import {
  clampSoundVolume,
  curatedSounds,
  parseSoundReference,
  sameSoundReference,
  serializeSoundReference,
  soundSourceUrl,
} from "@/lib/sound-catalog"

describe("sound references", () => {
  it("round-trips curated and media references", () => {
    const curated = parseSoundReference("curated:rain")
    expect(curated).toEqual({ type: "curated", key: "rain" })
    expect(serializeSoundReference(curated)).toBe("curated:rain")

    const mediaId = "9f8f6a52-1234-4abc-9def-aaaabbbbcccc"
    const media = parseSoundReference(`media:${mediaId}`)
    expect(media).toEqual({ type: "media", mediaId })
    expect(serializeSoundReference(media)).toBe(`media:${mediaId}`)
  })

  it("rejects unknown curated keys, malformed ids, and junk", () => {
    expect(parseSoundReference("curated:vaporwave")).toBeNull()
    expect(parseSoundReference("media:not-a-uuid")).toBeNull()
    expect(parseSoundReference("media:")).toBeNull()
    expect(parseSoundReference("lofi")).toBeNull()
    expect(parseSoundReference(42)).toBeNull()
    expect(parseSoundReference(null)).toBeNull()
    expect(serializeSoundReference(null)).toBeNull()
  })

  it("keeps curated keys and media ids in separate namespaces", () => {
    const curated = parseSoundReference("curated:lofi")
    const media = parseSoundReference("media:9f8f6a52-1234-4abc-9def-aaaabbbbcccc")
    expect(sameSoundReference(curated, media)).toBe(false)
    expect(sameSoundReference(curated, { type: "curated", key: "lofi" })).toBe(true)
  })

  it("maps every curated sound to a playable static URL", () => {
    for (const sound of curatedSounds) {
      expect(soundSourceUrl({ type: "curated", key: sound.key })).toBe(`/pomoder/audio-${sound.key}.mp3`)
    }
    expect(soundSourceUrl({ type: "media", mediaId: "abc" })).toBe("/api/media/abc/file")
  })

  it("clamps volume into 0-100 and falls back on invalid values", () => {
    expect(clampSoundVolume(45)).toBe(45)
    expect(clampSoundVolume(-10)).toBe(0)
    expect(clampSoundVolume(400)).toBe(100)
    expect(clampSoundVolume(33.4)).toBe(33)
    expect(clampSoundVolume(Number.NaN)).toBe(70)
    expect(clampSoundVolume("loud")).toBe(70)
    expect(clampSoundVolume(undefined)).toBe(70)
  })
})
