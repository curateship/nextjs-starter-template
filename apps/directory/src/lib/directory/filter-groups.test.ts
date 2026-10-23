import { describe, expect, it } from "vitest"

import { directoryFilterGroups, groupCategorySlugs } from "./filter-groups"

const categories = [
  { id: "cuisine", name: "Cuisine", slug: "cuisine", parentId: null, listingCount: 0 },
  { id: "italian", name: "Italian", slug: "italian", parentId: "cuisine", listingCount: 86 },
  { id: "sushi", name: "Sushi", slug: "sushi", parentId: "cuisine", listingCount: 60 },
  { id: "empty", name: "Ethiopian", slug: "ethiopian", parentId: "cuisine", listingCount: 0 },
  { id: "area", name: "Neighbourhood", slug: "area", parentId: null, listingCount: 0 },
  { id: "annex", name: "Annex", slug: "annex", parentId: "area", listingCount: 72 },
  { id: "loose", name: "Loose", slug: "loose", parentId: null, listingCount: 4 },
]

describe("the groups the rail draws", () => {
  it("makes one group per parent and leaves out what nobody can reach", () => {
    expect(directoryFilterGroups(categories)).toEqual([
      {
        id: "cuisine",
        name: "Cuisine",
        options: [
          { slug: "italian", name: "Italian", count: 86 },
          { slug: "sushi", name: "Sushi", count: 60 },
        ],
      },
      {
        id: "area",
        name: "Neighbourhood",
        options: [{ slug: "annex", name: "Annex", count: 72 }],
      },
    ])
  })

  it("draws nothing at all for a flat list of categories", () => {
    expect(directoryFilterGroups([categories[6]!])).toEqual([])
  })
})

describe("grouping the ticked slugs", () => {
  it("puts one group's ticks together and keeps two groups apart", () => {
    // Italian or Sushi, and in the Annex.
    expect(groupCategorySlugs(categories, ["italian", "annex", "sushi"])).toEqual([
      ["italian", "sushi"],
      ["annex"],
    ])
  })

  it("drops a slug nobody has rather than emptying the page", () => {
    expect(groupCategorySlugs(categories, ["gone", "italian"])).toEqual([
      ["italian"],
    ])
    expect(groupCategorySlugs(categories, ["gone"])).toEqual([])
  })

  it("keeps two parentless categories in two groups", () => {
    // Two boxes that share no parent are two "and" conditions, which is what
    // two ticked boxes in two headings look like they promise.
    expect(groupCategorySlugs(categories, ["loose", "cuisine"])).toEqual([
      ["loose"],
      ["cuisine"],
    ])
  })
})
