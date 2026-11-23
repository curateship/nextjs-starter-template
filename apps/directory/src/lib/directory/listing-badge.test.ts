import { describe, expect, it } from "vitest"

import {
  buildListingBadgeSnippet,
  parseListingBadgeSize,
  parseListingBadgeTheme,
  renderListingBadgeHtml,
} from "@/lib/directory/listing-badge"

const listing = {
  title: `Joe's Diner <script>`,
  slug: "joes-diner",
  featuredImage: `https://images.example.test/joe's.jpg`,
}

describe("listing badge choices", () => {
  it("accepts only the fixed size and theme choices", () => {
    expect(parseListingBadgeSize("card")).toBe("card")
    expect(parseListingBadgeSize("badge")).toBe("badge")
    expect(parseListingBadgeSize("giant")).toBe("badge")
    expect(parseListingBadgeTheme("dark")).toBe("dark")
    expect(parseListingBadgeTheme("neon")).toBe("light")
  })

  it("builds one-line snippets with the promised dimensions", () => {
    const badge = buildListingBadgeSnippet({
      origin: "https://town.example.test/",
      listingId: "listing-1",
      listingTitle: "Joe's Diner",
      siteName: "My Town",
      size: "badge",
      theme: "dark",
    })
    const card = buildListingBadgeSnippet({
      origin: "https://town.example.test",
      listingId: "listing-1",
      listingTitle: "Joe's Diner",
      siteName: "My Town",
      size: "card",
      theme: "light",
    })

    expect(badge).toContain("?size=badge&amp;theme=dark")
    expect(badge).toContain('width="260" height="64"')
    expect(card).toContain('width="320" height="160"')
    expect(badge).not.toContain("\n")
  })
})

describe("listing badge document", () => {
  it("draws and escapes only public listing details", () => {
    const html = renderListingBadgeHtml({
      siteName: `Town "&" Co`,
      listing,
      size: "card",
      theme: "light",
    })

    expect(html).toContain('href="/directory/joes-diner"')
    expect(html).toContain("Joe&#39;s Diner &lt;script&gt;")
    expect(html).toContain("Town &quot;&amp;&quot; Co")
    expect(html).toContain("joe&#39;s.jpg")
    expect(html).not.toContain("<script>")
    expect(html).not.toContain("?ref=")
  })

  it("uses a quiet initial when a listing has no photo", () => {
    const html = renderListingBadgeHtml({
      siteName: "Town",
      listing: { ...listing, title: "Bakery", featuredImage: "" },
      size: "badge",
      theme: "dark",
    })

    expect(html).toContain('class="photo placeholder"')
    expect(html).toContain(">B</span>")
    expect(html).toContain("background:#18181b")
  })
})
