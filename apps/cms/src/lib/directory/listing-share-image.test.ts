import { describe, expect, it } from "vitest"

import {
  listingShareImagePath,
  listingShareImageUrl,
  listingShareImageVersion,
  renderListingShareImage,
} from "@/lib/directory/listing-share-image"

describe("listing share pictures", () => {
  it("escapes stored words and keeps long names inside three title lines", () => {
    const svg = renderListingShareImage({
      title:
        "L'Étoile <script>alert('no')</script> and the exceptionally long restaurant name that must not leave its card",
      category: "Cafés & bakeries",
      siteName: "Montréal's Guide",
      accentColor: "#c2410c",
    })

    expect(svg).toContain("L&#39;Étoile &lt;script&gt;")
    expect(svg).not.toContain("<script>")
    expect(svg).toContain("CAFÉS &amp; BAKERIES")
    expect(svg.match(/font-size="60"/g)?.length).toBeLessThanOrEqual(3)
    expect(svg).toContain("…")
    expect(svg).toContain('fill="#c2410c"')
  })

  it("uses one versioned address on the site being visited", () => {
    const input = {
      title: "Joe's Diner",
      category: "Cafés",
      siteName: "Alpha Guide",
      accentColor: "#2563eb",
      updatedAt: new Date("2026-08-15T12:00:00.000Z"),
    }
    const version = listingShareImageVersion(input)

    expect(listingShareImageVersion(input)).toBe(version)
    expect(
      listingShareImageVersion({ ...input, accentColor: "#dc2626" })
    ).not.toBe(version)
    expect(listingShareImagePath("joes-diner", version)).toBe(
      `/directory/share-image/joes-diner?v=${version}`
    )
    expect(
      listingShareImageUrl("https://alpha.example.com/", "joes-diner", version)
    ).toBe(
      `https://alpha.example.com/directory/share-image/joes-diner?v=${version}`
    )
  })

  it("shortens unbroken wide text in every row", () => {
    const wide = "W".repeat(200)
    const svg = renderListingShareImage({
      title: wide,
      category: wide,
      siteName: wide,
      accentColor: "",
    })

    const visibleText = [...svg.matchAll(/<text[^>]*>(.*?)<\/text>/g)].map(
      (match) => match[1]
    )
    expect(visibleText).not.toContain(wide)
    expect(visibleText.filter((text) => text?.endsWith("…"))).toHaveLength(3)
  })
})
