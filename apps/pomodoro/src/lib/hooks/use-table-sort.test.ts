import { describe, expect, it } from "vitest"

import { sortRows } from "@/lib/hooks/use-table-sort"

const rows = [
  { name: "beta", count: 2 },
  { name: "Alpha", count: 10 },
  { name: "gamma", count: 2 },
]
const keys = {
  name: (row: (typeof rows)[number]) => row.name,
  count: (row: (typeof rows)[number]) => row.count,
}

describe("sortRows", () => {
  it("sorts text alphabetically and numbers by size, either way", () => {
    expect(sortRows(rows, { sort: "name", direction: "asc" }, keys).map((row) => row.name)).toEqual(["Alpha", "beta", "gamma"])
    expect(sortRows(rows, { sort: "count", direction: "desc" }, keys).map((row) => row.count)).toEqual([10, 2, 2])
  })

  it("keeps ties in their order and leaves the input alone", () => {
    const sorted = sortRows(rows, { sort: "count", direction: "asc" }, keys)
    expect(sorted.map((row) => row.name)).toEqual(["beta", "gamma", "Alpha"])
    expect(rows.map((row) => row.name)).toEqual(["beta", "Alpha", "gamma"])
  })
})
