import { describe, expect, it } from "vitest"

import {
  canonicalUrlProblem,
  normalizeCanonicalUrl,
  resolveCanonicalUrl,
} from "@/lib/pages/page-indexing"

/**
 * A canonical tag tells a search engine which address to count. A wrong one is
 * worse than none, so anything the normalizer does not recognise becomes
 * empty and no tag is drawn.
 */

describe("tidying a canonical address", () => {
  it("keeps an address on this site as a path", () => {
    expect(normalizeCanonicalUrl("/about")).toBe("/about")
    expect(normalizeCanonicalUrl("  /about/  ")).toBe("/about")
    expect(normalizeCanonicalUrl("/blog//post")).toBe("/blog/post")
    expect(normalizeCanonicalUrl("/about?utm=1#top")).toBe("/about?utm=1")
  })

  it("keeps a full web address whole", () => {
    expect(normalizeCanonicalUrl("https://example.com/about")).toBe(
      "https://example.com/about"
    )
  })

  it("refuses anything that is not one of those two", () => {
    for (const typed of [
      "",
      "about",
      "//example.com/about",
      "javascript:alert(1)",
      "ftp://example.com/about",
      "https://user:secret@example.com/about",
    ]) {
      expect(normalizeCanonicalUrl(typed), typed).toBe("")
    }
  })

  it("refuses an address that encoding pushes past the column width", () => {
    // Each "<" becomes "%3C", so a thousand of them is three thousand
    // characters and the column is 2048 wide. It has to come back as a
    // refusal, not as a database error.
    const long = `/${"<".repeat(1000)}`
    expect(normalizeCanonicalUrl(long)).toBe("")
    expect(normalizeCanonicalUrl(`https://example.com${long}`)).toBe("")
  })

  it("says why in a sentence, and says nothing when the field is empty", () => {
    expect(canonicalUrlProblem("")).toBeNull()
    expect(canonicalUrlProblem("/about")).toBeNull()
    expect(canonicalUrlProblem("about")).toContain("/about")
  })
})

describe("the address the tag carries", () => {
  it("puts a path on the domain the visitor used", () => {
    expect(resolveCanonicalUrl("https://alpha.example.com", "/about")).toBe(
      "https://alpha.example.com/about"
    )
    expect(resolveCanonicalUrl("https://beta.example.com", "/about")).toBe(
      "https://beta.example.com/about"
    )
  })

  it("leaves a full address alone", () => {
    expect(
      resolveCanonicalUrl("https://alpha.example.com", "https://example.com/x")
    ).toBe("https://example.com/x")
  })

  it("draws no tag when there is nothing to point at", () => {
    expect(resolveCanonicalUrl("https://alpha.example.com", "")).toBe("")
    expect(resolveCanonicalUrl("https://alpha.example.com", "about")).toBe("")
    expect(resolveCanonicalUrl("", "/about")).toBe("")
  })
})
