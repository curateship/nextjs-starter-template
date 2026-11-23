import { describe, expect, it } from "vitest"

import {
  badgeName,
  escapeXml,
  isBadgeTokenShape,
  renderStreakBadgeSvg,
  streakLine,
} from "@/lib/pomodoro/streak-badge"

describe("what counts as a badge address", () => {
  it("accepts what the token generator produces", () => {
    // 32 random bytes as base64url, which is what enableStreakBadge writes.
    expect(isBadgeTokenShape("1MYBRryfe3ud6ygZorHZjOjLKZhSEa-_9xKqwT4bNso")).toBe(
      true
    )
  })

  it("rejects a NUL byte, which Postgres refuses outright", () => {
    // Without this the route threw and answered 500 to anyone who asked for
    // /badge/streak/%00.svg.
    expect(isBadgeTokenShape("abc\u0000def")).toBe(false)
  })

  it("rejects the shapes an attacker reaches for first", () => {
    for (const junk of [
      "",
      "' OR '1'='1",
      "x'--",
      "%",
      "../../etc/passwd",
      "🔥",
      "a".repeat(65),
    ])
      expect(isBadgeTokenShape(junk)).toBe(false)
  })
})

describe("escaping the badge's text", () => {
  it("escapes every XML character", () => {
    expect(escapeXml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&apos;")
  })

  it("escapes the ampersand first, so an escape is not escaped twice", () => {
    expect(escapeXml("a & b < c")).toBe("a &amp; b &lt; c")
  })

  it("leaves ordinary names alone", () => {
    expect(escapeXml("Tyler Pham")).toBe("Tyler Pham")
  })
})

describe("the rendered badge", () => {
  it("cannot be made to carry markup through the display name", () => {
    // The badge is served from the app's own address, so a display name that
    // closed the text element and opened a script would run on our origin.
    const svg = renderStreakBadgeSvg({
      displayName: `</text><script>alert(1)</script>`,
      currentStreak: 3,
    })
    expect(svg).not.toContain("<script>")
    expect(svg).not.toContain("</text><script")
    expect(svg).toContain("&lt;script&gt;")
  })

  it("says the streak and names the app", () => {
    const svg = renderStreakBadgeSvg({ displayName: "Tyler", currentStreak: 23 })
    expect(svg).toContain("23-day focus streak")
    expect(svg).toContain("Tyler · pomodoro")
  })

  it("names the app alone when there is no display name", () => {
    const svg = renderStreakBadgeSvg({ displayName: null, currentStreak: 1 })
    expect(svg).toContain("1-day focus streak")
    expect(svg).toContain(">pomodoro<")
  })

  it("never draws a negative or fractional streak", () => {
    expect(renderStreakBadgeSvg({ displayName: null, currentStreak: -4 })).toContain(
      "0-day focus streak"
    )
    expect(
      renderStreakBadgeSvg({ displayName: null, currentStreak: 2.7 })
    ).toContain("2-day focus streak")
  })

  it("is a complete SVG document", () => {
    const svg = renderStreakBadgeSvg({ displayName: "A", currentStreak: 0 })
    expect(svg.startsWith("<svg xmlns=")).toBe(true)
    expect(svg.trimEnd().endsWith("</svg>")).toBe(true)
  })

  it("fetches nothing from anywhere else", () => {
    // An embed runs on someone else's page; a request of ours to a third
    // party there would be slow and unasked for.
    const svg = renderStreakBadgeSvg({ displayName: "Tyler", currentStreak: 9 })
    expect(svg).not.toMatch(/https?:\/\/(?!www\.w3\.org)/)
  })
})

describe("the name on the badge", () => {
  it("drops an empty or blank name", () => {
    expect(badgeName(null)).toBeNull()
    expect(badgeName("   ")).toBeNull()
  })

  it("trims a long name so the picture keeps its shape", () => {
    const long = "a".repeat(50)
    expect(badgeName(long)).toHaveLength(22)
    expect(badgeName(long)?.endsWith("…")).toBe(true)
  })

  it("leaves a name that fits", () => {
    expect(badgeName(" Tyler ")).toBe("Tyler")
  })
})

describe("the streak line", () => {
  it("reads the way the task asked", () => {
    expect(streakLine(23)).toBe("23-day focus streak")
    expect(streakLine(0)).toBe("0-day focus streak")
  })
})
