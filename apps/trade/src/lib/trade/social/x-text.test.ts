import { describe, expect, it } from "vitest"

import { unescapeXText } from "@/lib/trade/social/x-text"

/**
 * The words of a post arrive escaped twice over: as a JavaScript string
 * literal, and as HTML. Both have to come off, or a post reads with `&amp;`
 * in the middle of it.
 */
describe("undoing the HTML X escaped", () => {
  it("undoes the entities X writes into the page", () => {
    expect(unescapeXText("a &amp; b")).toBe("a & b")
    expect(unescapeXText("markets go slow -&gt; rip packs")).toBe(
      "markets go slow -> rip packs"
    )
    expect(unescapeXText("he said &quot;no&quot;")).toBe('he said "no"')
    expect(unescapeXText("it&apos;s fine")).toBe("it's fine")
  })

  it("undoes a numeric entity", () => {
    expect(unescapeXText("it&#39;s fine")).toBe("it's fine")
    expect(unescapeXText("&#8364;100")).toBe("€100")
  })

  it("leaves something that only looks like an entity alone", () => {
    expect(unescapeXText("up 30&#x; today")).toBe("up 30&#x; today")
    expect(unescapeXText("Q&A later")).toBe("Q&A later")
  })

  it("undoes &amp; last, so an escaped entity stays readable", () => {
    // Somebody writing about the entity itself, not writing a "<".
    expect(unescapeXText("type &amp;lt; for less-than")).toBe(
      "type &lt; for less-than"
    )
  })

  it("fixes the two posts that read wrong on 2 Oct 2026", () => {
    expect(
      unescapeXText("330k+ X followers &amp; copytraders'")
    ).toBe("330k+ X followers & copytraders'")
    expect(unescapeXText("markets go slow -&gt; rip packs")).toContain("->")
  })
})

describe("undoing the string literal the page carries", () => {
  it("still undoes the page's own escapes", () => {
    expect(unescapeXText("line one\\nline two")).toBe("line one\nline two")
    expect(unescapeXText('he said \\"no\\"')).toBe('he said "no"')
    expect(unescapeXText("\\u00e9t\\u00e9")).toBe("été")
    expect(unescapeXText("a\\\\b")).toBe("a\\b")
  })

  it("leaves ordinary words untouched", () => {
    expect(unescapeXText("buying more sol here")).toBe("buying more sol here")
  })
})
