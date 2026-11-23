// @vitest-environment jsdom
import * as React from "react"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/api/directory/public", () => ({
  loadRecentlyViewed: vi.fn(),
}))
// The cards themselves are proved in listing-grid.test.tsx. Here only which
// ones arrive matters, so a card is its title.
vi.mock("@/components/directory/public/listing-grid", () => ({
  ListingGrid: ({ listings }: { listings: { id: string; title: string }[] }) => (
    <ul>
      {listings.map((listing) => (
        <li key={listing.id}>{listing.title}</li>
      ))}
    </ul>
  ),
}))

import { loadRecentlyViewed } from "@/lib/api/directory/public"
import type { PublicListingCard } from "@/lib/api/directory/public"
import { RecentlyViewedListings } from "@/components/directory/public/recently-viewed-listings"
import {
  readRecentlyViewed,
  rememberViewed,
} from "@/lib/directory/recently-viewed"

const STORAGE_KEY = "directory-recently-viewed"

function card(id: string): PublicListingCard {
  return {
    id,
    title: `Listing ${id}`,
    slug: id,
    metaDescription: "",
    rating: null,
    featuredImage: "",
    address: "",
    category: null,
    neighbourhood: null,
    claimed: false,
    featured: false,
  }
}

let host: HTMLDivElement
let root: ReturnType<typeof createRoot>

async function draw(element: React.ReactElement) {
  await act(async () => {
    root.render(element)
  })
  // Lets the fresh-cards promise settle and its state land.
  await act(async () => {})
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  window.localStorage.clear()
  vi.mocked(loadRecentlyViewed).mockReset()
  // The server answers with whatever it was asked for, in order, unless a
  // test says otherwise.
  vi.mocked(loadRecentlyViewed).mockImplementation(async (ids) =>
    ids.map(card)
  )
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.restoreAllMocks()
})

describe("the stored list", () => {
  it("keeps eight ids, newest first, with no repeats", () => {
    for (const id of ["a", "b", "c", "d", "e", "f", "g", "h", "i"]) {
      rememberViewed(id)
    }
    rememberViewed("c")
    expect(readRecentlyViewed()).toEqual([
      "c",
      "i",
      "h",
      "g",
      "f",
      "e",
      "d",
      "b",
    ])
  })

  it("reads a broken or hand-edited value as empty", () => {
    window.localStorage.setItem(STORAGE_KEY, "{not json")
    expect(readRecentlyViewed()).toEqual([])
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(["ok", 5, "<script>", "ok"])
    )
    expect(readRecentlyViewed()).toEqual(["ok"])
  })
})

describe("RecentlyViewedListings", () => {
  it("draws nothing and asks nothing with no history", async () => {
    await draw(<RecentlyViewedListings />)
    expect(host.textContent).toBe("")
    expect(loadRecentlyViewed).not.toHaveBeenCalled()
  })

  it("records the listing and leaves it out of its own row", async () => {
    rememberViewed("a")
    rememberViewed("b")
    await draw(<RecentlyViewedListings currentListingId="a" />)

    expect(loadRecentlyViewed).toHaveBeenCalledWith(["b"])
    expect(host.textContent).toContain("Listing b")
    expect(host.textContent).not.toContain("Listing a")
    expect(readRecentlyViewed()).toEqual(["a", "b"])
  })

  it("shows four, and only what the server still calls published", async () => {
    for (const id of ["a", "b", "c", "d", "e", "f"]) rememberViewed(id)
    // "e" went back to draft, so the server leaves it out.
    vi.mocked(loadRecentlyViewed).mockImplementation(async (ids) =>
      ids.filter((id) => id !== "e").map(card)
    )
    await draw(<RecentlyViewedListings />)

    const shown = [...host.querySelectorAll("li")].map((li) => li.textContent)
    expect(shown).toEqual(["Listing f", "Listing d", "Listing c", "Listing b"])
  })

  it("Clear empties the row and the stored list at once", async () => {
    rememberViewed("a")
    await draw(<RecentlyViewedListings />)
    const clear = [...host.querySelectorAll("button")].find(
      (button) => button.textContent === "Clear"
    )
    await act(async () => clear?.click())

    expect(host.textContent).toBe("")
    expect(readRecentlyViewed()).toEqual([])
  })

  it("draws nothing when storage is blocked", async () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError")
    })
    await draw(<RecentlyViewedListings currentListingId="a" />)

    expect(host.textContent).toBe("")
    expect(loadRecentlyViewed).not.toHaveBeenCalled()
  })

  it("draws nothing when the fresh read fails", async () => {
    rememberViewed("a")
    vi.mocked(loadRecentlyViewed).mockRejectedValue(new Error("offline"))
    await draw(<RecentlyViewedListings />)

    expect(host.textContent).toBe("")
  })
})
