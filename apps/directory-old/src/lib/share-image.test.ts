import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  buildShareCardSvg,
  buildShareImagePath,
  formatShareEventDate,
  isShareImageType,
  resolveShareImageTheme,
  shareImageObjectKey,
  shareImageVersion,
} from "./share-image"

function titleLines(svg: string): string[] {
  return [...svg.matchAll(/<text[^>]*font-size="(?:76|60)"[^>]*>([^<]*)<\/text>/g)].map((m) => m[1])
}

describe("shareImageVersion", () => {
  it("derives the same version from a Date and its ISO string", () => {
    const updatedAt = new Date("2026-07-31T12:00:00.000Z")
    assert.equal(shareImageVersion(updatedAt), shareImageVersion(updatedAt.toISOString()))
  })

  it("changes when the timestamp changes", () => {
    assert.notEqual(
      shareImageVersion(new Date("2026-07-31T12:00:00.000Z")),
      shareImageVersion(new Date("2026-07-31T12:00:01.000Z")),
    )
  })

  it("returns null for missing or unparseable values", () => {
    assert.equal(shareImageVersion(null), null)
    assert.equal(shareImageVersion(undefined), null)
    assert.equal(shareImageVersion("not a date"), null)
  })
})

describe("share image paths", () => {
  it("builds the route path and storage key from the same parts", () => {
    assert.equal(buildShareImagePath("listing", "abc", "v1"), "/share-image/listing/abc?v=v1")
    assert.equal(shareImageObjectKey("site1", "event", "abc", "v1"), "share-images/site1/event/abc-v1.png")
  })

  it("accepts only the two supported types", () => {
    assert.equal(isShareImageType("listing"), true)
    assert.equal(isShareImageType("event"), true)
    assert.equal(isShareImageType("post"), false)
  })
})

describe("formatShareEventDate", () => {
  it("formats a stored floating date without timezone drift", () => {
    assert.equal(formatShareEventDate("2026-08-15"), "August 15, 2026")
    assert.equal(formatShareEventDate("2026-01-01"), "January 1, 2026")
  })

  it("rejects malformed dates", () => {
    assert.equal(formatShareEventDate("2026-13-01"), null)
    assert.equal(formatShareEventDate("soon"), null)
    assert.equal(formatShareEventDate(undefined), null)
  })
})

describe("resolveShareImageTheme", () => {
  it("uses dark only when the site explicitly defaults to dark", () => {
    assert.equal(resolveShareImageTheme("dark"), "dark")
    assert.equal(resolveShareImageTheme("light"), "light")
    assert.equal(resolveShareImageTheme("system"), "light")
    assert.equal(resolveShareImageTheme(undefined), "light")
  })
})

describe("buildShareCardSvg", () => {
  it("renders title, kicker and site name", () => {
    const svg = buildShareCardSvg({
      title: "Blue Bottle Coffee",
      kicker: "Cafes",
      siteName: "Springfield Directory",
      theme: "light",
    })
    assert.match(svg, />Blue Bottle Coffee</)
    assert.match(svg, />CAFES</)
    assert.match(svg, />Springfield Directory</)
  })

  it("wraps a long title across lines instead of overflowing one line", () => {
    const svg = buildShareCardSvg({
      title: "The Extremely Long Named Family Restaurant and Bakery of Greater Springfield",
      kicker: "Restaurants",
      siteName: "Springfield Directory",
      theme: "light",
    })
    const lines = titleLines(svg)
    assert.ok(lines.length >= 2, `expected multiple lines, got ${JSON.stringify(lines)}`)
    for (const line of lines) {
      assert.ok(line.length <= 30, `line too long for the card: ${line}`)
    }
  })

  it("cuts an absurdly long title short with an ellipsis instead of running off the card", () => {
    const svg = buildShareCardSvg({
      title: "Word ".repeat(60).trim(),
      kicker: null,
      siteName: "Springfield Directory",
      theme: "light",
    })
    const lines = titleLines(svg)
    assert.ok(lines.length <= 3)
    assert.match(lines[lines.length - 1], /…/)
  })

  it("hard-breaks a single unbroken word so it cannot escape the card", () => {
    const svg = buildShareCardSvg({
      title: "A".repeat(120),
      siteName: "Springfield Directory",
      theme: "light",
    })
    for (const line of titleLines(svg)) {
      assert.ok(line.length <= 30, `line too long for the card: ${line}`)
    }
  })

  it("leaves no gap or empty element when the kicker is missing", () => {
    const svg = buildShareCardSvg({
      title: "Blue Bottle Coffee",
      kicker: null,
      siteName: "Springfield Directory",
      theme: "light",
    })
    assert.doesNotMatch(svg, /<text[^>]*><\/text>/)
    assert.doesNotMatch(svg, /font-size="28"/)
  })

  it("escapes markup in user-entered text", () => {
    const svg = buildShareCardSvg({
      title: `Bob's "Deli" <& Grill>`,
      kicker: "Food & Drink",
      siteName: "A & B",
      theme: "dark",
    })
    assert.doesNotMatch(svg, /<& Grill>/)
    assert.match(svg, /Bob&#39;s &quot;Deli&quot; &lt;&amp; Grill&gt;/)
    assert.match(svg, /FOOD &amp; DRINK/)
  })

  it("uses the dark palette when the site defaults to dark", () => {
    const svg = buildShareCardSvg({
      title: "Night Market",
      siteName: "Springfield Directory",
      theme: "dark",
    })
    assert.match(svg, /fill="#111827"\/>/)
    assert.match(svg, /fill="#f9fafb"/)
  })
})
