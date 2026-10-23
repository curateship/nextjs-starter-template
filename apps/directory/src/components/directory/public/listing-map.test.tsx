import * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

/*
 * No local site has a Google Maps key, so the drawn map and its markers cannot
 * be opened in a browser here. What this file proves is the part of the map
 * that is not Google's: the wording when there is nothing to draw, and that a
 * deal's headline reaches the pin rather than only the card behind it.
 *
 * The markers themselves are drawn in an effect, which never runs on the
 * server, so nothing here touches Google at all.
 */

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    params,
    search: _search,
    preload: _preload,
    ...rest
  }: {
    to: string
    params?: { slug: string }
    search?: unknown
    preload?: unknown
  } & React.ComponentProps<"a">) => (
    <a href={params ? to.replace("$slug", params.slug) : to} {...rest} />
  ),
}))
vi.mock("@/components/directory/public/save-dropdown", () => ({
  SaveDropdown: () => null,
}))

import { ListingMap } from "@/components/directory/public/listing-map"
import type { PublicMapPin } from "@/lib/api/directory/public"

const pin: PublicMapPin = {
  id: "listing-1",
  title: "43 Down",
  slug: "43-down",
  metaDescription: "43 Down is a bar in Dovercourt Village.",
  rating: null,
  featuredImage: "",
  address: "1216 Dufferin St, Toronto, ON",
  category: null,
  neighbourhood: null,
  claimed: false,
  featured: false,
  latitude: 43.65,
  longitude: -79.38,
}

const render = (props: Partial<React.ComponentProps<typeof ListingMap>>) =>
  renderToStaticMarkup(
    <ListingMap apiKey="not-a-real-key" pins={[]} total={0} {...props} />
  )

describe("a map with nothing to draw", () => {
  it("says the listings have no location when that is the reason", () => {
    expect(render({})).toContain("None of these listings have a location yet")
  })

  it("says the deals switch is the reason when it is", () => {
    const html = render({ dealsOnly: true })
    expect(html).toContain("No place with a deal on is on this map")
    expect(html).toContain("Switch Deals only off")
    expect(html).not.toContain("have a location yet")
  })
})

describe("a pin with a deal on", () => {
  it("says the headline as well as the name, so the colour is not the only clue", () => {
    const html = render({
      pins: [{ ...pin, dealHeadline: "20% off" }],
      total: 1,
    })
    expect(html).toContain("43 Down, 20% off")
  })

  it("says the name alone when the listing has no deal on", () => {
    const html = render({ pins: [pin], total: 1 })
    expect(html).toContain("43 Down")
    expect(html).not.toContain("43 Down,")
  })
})
