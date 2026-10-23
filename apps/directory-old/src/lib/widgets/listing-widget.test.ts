import { describe, it } from "node:test"
import assert from "node:assert/strict"

import {
  buildListingWidgetSnippet,
  getListingRatingFromContentBlocks,
  pagePathHasWidgetReferral,
  parseWidgetTheme,
  parseWidgetVariant,
  renderListingWidgetHtml,
} from "./listing-widget"

describe("parseWidgetVariant / parseWidgetTheme", () => {
  it("accepts known values and falls back to defaults", () => {
    assert.equal(parseWidgetVariant("card"), "card")
    assert.equal(parseWidgetVariant("badge"), "badge")
    assert.equal(parseWidgetVariant("nonsense"), "badge")
    assert.equal(parseWidgetVariant(null), "badge")
    assert.equal(parseWidgetTheme("dark"), "dark")
    assert.equal(parseWidgetTheme(undefined), "light")
    assert.equal(parseWidgetTheme("neon"), "light")
  })
})

describe("getListingRatingFromContentBlocks", () => {
  it("reads a numeric or string rating from the directory-core block", () => {
    const blocks = {
      a: { type: "directory-rich-text", content: { rating: 1 } },
      b: { type: "directory-core", content: { rating: "4.5" } },
    }
    assert.equal(getListingRatingFromContentBlocks(blocks), 4.5)
    assert.equal(getListingRatingFromContentBlocks({ b: { type: "directory-core", content: { rating: 3 } } }), 3)
  })

  it("returns null for missing, empty, zero, or invalid ratings and clamps above five", () => {
    assert.equal(getListingRatingFromContentBlocks(null), null)
    assert.equal(getListingRatingFromContentBlocks({}), null)
    assert.equal(getListingRatingFromContentBlocks({ b: { type: "directory-core", content: {} } }), null)
    assert.equal(getListingRatingFromContentBlocks({ b: { type: "directory-core", content: { rating: "" } } }), null)
    assert.equal(getListingRatingFromContentBlocks({ b: { type: "directory-core", content: { rating: 0 } } }), null)
    assert.equal(getListingRatingFromContentBlocks({ b: { type: "directory-core", content: { rating: "abc" } } }), null)
    assert.equal(getListingRatingFromContentBlocks({ b: { type: "directory-core", content: { rating: 9 } } }), 5)
  })
})

describe("pagePathHasWidgetReferral", () => {
  it("detects the widget ref tag in a page path", () => {
    assert.equal(pagePathHasWidgetReferral("/directory/cafe?ref=widget"), true)
    assert.equal(pagePathHasWidgetReferral("/?ref=widget"), true)
    assert.equal(pagePathHasWidgetReferral("/directory/cafe?utm=x&ref=widget"), true)
  })

  it("rejects other refs, missing refs, oversized and invalid paths", () => {
    assert.equal(pagePathHasWidgetReferral("/directory/cafe?ref=email"), false)
    assert.equal(pagePathHasWidgetReferral("/directory/cafe"), false)
    assert.equal(pagePathHasWidgetReferral(undefined), false)
    assert.equal(pagePathHasWidgetReferral(`/x?ref=widget${"a".repeat(3000)}`), false)
  })
})

describe("renderListingWidgetHtml", () => {
  const listing = { title: "Joe's Diner <script>", slug: "joes-diner", rating: 4.5 }

  it("renders a badge linking to the listing tagged with ref=widget", () => {
    const html = renderListingWidgetHtml({ siteName: "My Town", listing, variant: "badge", theme: "light" })
    assert.match(html, /href="\/directory\/joes-diner\?ref=widget"/)
    assert.match(html, /target="_blank" rel="noopener noreferrer"/)
    assert.match(html, /Find us on/)
    assert.match(html, /My Town/)
  })

  it("escapes interpolated listing and site values", () => {
    const html = renderListingWidgetHtml({ siteName: `Town "&" Co`, listing, variant: "card", theme: "light" })
    assert.ok(!html.includes("<script>"))
    assert.match(html, /Joe&#39;s Diner &lt;script&gt;/)
    assert.match(html, /Town &quot;&amp;&quot; Co/)
  })

  it("shows the rating on the card variant and omits it when null", () => {
    const withRating = renderListingWidgetHtml({ siteName: "My Town", listing, variant: "card", theme: "light" })
    assert.match(withRating, /4\.5/)

    const withoutRating = renderListingWidgetHtml({
      siteName: "My Town",
      listing: { ...listing, rating: null },
      variant: "card",
      theme: "light",
    })
    assert.ok(!withoutRating.includes('class="rating"'))
  })

  it("renders a neutral fallback linking to the site home when the listing is missing", () => {
    const html = renderListingWidgetHtml({ siteName: "My Town", listing: null, variant: "badge", theme: "light" })
    assert.match(html, /href="\/\?ref=widget"/)
    assert.match(html, /Discover businesses on/)
    assert.ok(!html.includes("joes-diner"))
  })

  it("applies the dark palette when requested", () => {
    const dark = renderListingWidgetHtml({ siteName: "My Town", listing, variant: "badge", theme: "dark" })
    const light = renderListingWidgetHtml({ siteName: "My Town", listing, variant: "badge", theme: "light" })
    assert.match(dark, /background:#111827/)
    assert.match(light, /background:#ffffff/)
  })
})

describe("buildListingWidgetSnippet", () => {
  it("builds an iframe snippet with variant-specific dimensions", () => {
    const snippet = buildListingWidgetSnippet({
      origin: "https://town.example.com",
      directoryId: "123e4567-e89b-12d3-a456-426614174000",
      listingTitle: "Joe's Diner",
      variant: "badge",
      theme: "dark",
    })
    assert.match(snippet, /^<iframe src="https:\/\/town\.example\.com\/embed\/listing\/123e4567-e89b-12d3-a456-426614174000\?variant=badge&amp;theme=dark"/)
    assert.match(snippet, /width="260" height="64"/)
    assert.match(snippet, /title="Joe&#39;s Diner listing widget"/)

    const card = buildListingWidgetSnippet({
      origin: "https://town.example.com",
      directoryId: "123e4567-e89b-12d3-a456-426614174000",
      listingTitle: "Joe's Diner",
      variant: "card",
      theme: "light",
    })
    assert.match(card, /width="320" height="160"/)
  })
})
