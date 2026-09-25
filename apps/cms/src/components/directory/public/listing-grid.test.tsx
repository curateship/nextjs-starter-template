import * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

// A real Link needs a router, and the Save button asks the server the moment it
// is opened. Neither is what these tests are about: the card's own layout is.
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    params,
    search: _search,
    preload: _preload,
    ...rest
  }: {
    to: string
    params: { slug: string }
    search?: unknown
    preload?: unknown
  } & React.ComponentProps<"a">) => (
    <a href={to.replace("$slug", params.slug)} {...rest} />
  ),
}))
vi.mock("@/components/directory/public/save-dropdown", () => ({
  SaveDropdown: () => null,
}))

import { ListingCard } from "@/components/directory/public/listing-grid"
import type { PublicListingCard } from "@/lib/api/directory/public"

const base: PublicListingCard = {
  id: "listing-1",
  title: "Stop BBQ",
  slug: "stop-bbq",
  metaDescription: "Stop BBQ is a barbecue spot in Dovercourt Village.",
  rating: 4.4,
  featuredImage: "https://media.test/stop-bbq.jpg",
  address: "1216 Dufferin St, Toronto, ON",
  category: { name: "Barbecue", slug: "barbecue" },
  neighbourhood: { name: "Dovercourt Village", slug: "dovercourt-village" },
  claimed: false,
  featured: false,
}

describe("listing card", () => {
  it("puts the category and the rating over the photo", () => {
    const markup = renderToStaticMarkup(<ListingCard listing={base} />)

    expect(markup).toContain("Barbecue")
    expect(markup).toContain("lucide-star")
    // The stars under the title carry the readable name, so the chip over the
    // photo is hidden rather than saying "4.4" a second time.
    expect(markup).toContain('aria-label="4.4 out of 5"')
    expect(markup).toContain("1216 Dufferin St, Toronto, ON")
    expect(markup).toContain("Dovercourt Village")
  })

  it("asks for smaller copies of the photo", () => {
    const markup = renderToStaticMarkup(<ListingCard listing={base} />)

    expect(markup).toContain("/api/v1/media/resized?src=")
    expect(markup).toContain("400w")
  })

  it("drops the rating chip when a listing has no rating", () => {
    const markup = renderToStaticMarkup(
      <ListingCard listing={{ ...base, rating: null }} />
    )

    expect(markup).not.toContain("out of 5")
    expect(markup).toContain("Barbecue")
  })

  it("keeps the category above the title when there is no photo", () => {
    const markup = renderToStaticMarkup(
      <ListingCard listing={{ ...base, featuredImage: "" }} />
    )

    expect(markup).not.toContain("<img")
    expect(markup).toContain("Barbecue")
  })

  it("leaves the footer out when there is no address or neighbourhood", () => {
    const markup = renderToStaticMarkup(
      <ListingCard listing={{ ...base, address: "", neighbourhood: null }} />
    )

    expect(markup).not.toContain('data-slot="card-footer"')
  })
})
