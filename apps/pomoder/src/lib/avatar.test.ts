import { describe, expect, it } from "vitest"

import { AVATAR_TONES, avatarImageUrl, avatarInitials, avatarTone } from "@/lib/avatar"

describe("avatar initials", () => {
  it("uses the first and last word of a display name", () => {
    expect(avatarInitials("Ada Lovelace")).toBe("AL")
    expect(avatarInitials("maya")).toBe("M")
    expect(avatarInitials("  ana   maria   ribeiro ")).toBe("AR")
  })

  it("never renders an empty circle", () => {
    expect(avatarInitials("")).toBe("?")
    expect(avatarInitials("   ")).toBe("?")
  })

  it("keeps a leading emoji or accented letter whole", () => {
    expect(avatarInitials("🌊 Ocean")).toBe("🌊O")
    expect(avatarInitials("Émile Zola")).toBe("ÉZ")
  })
})

describe("avatar tone", () => {
  it("gives the same person the same colour on every surface", () => {
    expect(avatarTone("Ada Lovelace")).toBe(avatarTone("  ada lovelace "))
  })

  it("always lands inside the palette", () => {
    for (const name of ["", "A", "Ada Lovelace", "🌊 Ocean", "x".repeat(200)]) {
      const tone = avatarTone(name)
      expect(tone).toBeGreaterThanOrEqual(0)
      expect(tone).toBeLessThan(AVATAR_TONES)
    }
  })

  it("spreads a handful of names across more than one colour", () => {
    const names = ["Ada Lovelace", "Maya Kern", "Tomas Reyes", "Ana Ribeiro", "Devon Hale", "Priya Anand"]
    expect(new Set(names.map(avatarTone)).size).toBeGreaterThan(1)
  })
})

describe("avatar url", () => {
  it("points at the public avatar route", () => {
    expect(avatarImageUrl("2f1b0f5a-0000-4000-8000-000000000000")).toBe(
      "/api/avatars/2f1b0f5a-0000-4000-8000-000000000000/file"
    )
  })
})
