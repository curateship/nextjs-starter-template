import * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

/*
 * No local site has a Google Maps key, so a drawn map cannot be opened in a
 * browser here and the "Deals only" chip beside it cannot be clicked. These
 * tests render the real line above the results instead, and check the three
 * things the chip has to get right: that it is drawn only where it can do
 * something, that its address carries the switch, and that pressing it again
 * takes the switch back out.
 */

// A real Link needs a router. What matters here is the address each one writes,
// so it is drawn out as an attribute a test can read.
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    search,
    activeOptions: _activeOptions,
    ...rest
  }: {
    to: string
    search?: Record<string, unknown>
    activeOptions?: unknown
  } & React.ComponentProps<"a">) => (
    <a href={to} data-search={JSON.stringify(search ?? {})} {...rest} />
  ),
}))

import { DirectoryResultsHeader } from "@/components/directory/public/directory-results-header"
import type { DirectoryBrowseSearch } from "@/lib/directory/public-search"

function render(
  current: DirectoryBrowseSearch,
  extra: { mapAvailable?: boolean; dealsSwitch?: boolean } = {}
) {
  return renderToStaticMarkup(
    <DirectoryResultsHeader
      count="3 listings"
      filters={null}
      sort="order"
      current={current}
      mapAvailable={extra.mapAvailable ?? true}
      dealsSwitch={extra.dealsSwitch ?? false}
      onSortChange={() => {}}
    />
  )
}

/**
 * Every address the line's links would go to. Read back through JSON, so a key
 * the component set to undefined is simply absent here, which is also what the
 * router does with it.
 */
function addresses(html: string): Record<string, unknown>[] {
  return [...html.matchAll(/data-search="([^"]*)"/g)].map(([, value]) =>
    JSON.parse(
      value
        .replaceAll("&quot;", '"')
        .replaceAll("&amp;", "&")
        .replaceAll("&#x27;", "'")
    )
  )
}

describe("the Deals only chip", () => {
  it("is not drawn while the grid is showing", () => {
    expect(render({}, { dealsSwitch: false })).not.toContain("Deals only")
  })

  it("is drawn on the map once the site has deals this visitor may see", () => {
    expect(render({ view: "map" }, { dealsSwitch: true })).toContain(
      "Deals only"
    )
  })

  it("switches the map on at ?deals=only, keeping the rest of the search", () => {
    const html = render(
      { view: "map", q: "pasta", category: "italian" },
      { dealsSwitch: true }
    )
    const chip = addresses(html).find((search) => search.deals === "only")
    // No `page`: the map has no pages, and a stale number would hand the grid
    // a page that is nowhere in its list.
    expect(chip).toEqual({
      view: "map",
      q: "pasta",
      category: "italian",
      deals: "only",
    })
  })

  it("switches it back off, and stays on the map while doing it", () => {
    const html = render({ view: "map", deals: "only" }, { dealsSwitch: true })
    // The two view links both keep `deals`, so the chip is the only link here
    // without it.
    const chip = addresses(html).find((search) => search.deals === undefined)
    expect(chip).toEqual({ view: "map" })
  })

  it("is drawn whether or not this site offers a map", () => {
    // `dealsSwitch` is only ever true when a map came back, so the chip must
    // not also be waiting on the Grid/Map switch beside it.
    expect(
      render({ view: "map" }, { dealsSwitch: true, mapAvailable: false })
    ).toContain("Deals only")
  })
})
