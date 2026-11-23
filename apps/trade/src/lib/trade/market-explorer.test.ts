import { describe, expect, it } from "vitest"
import { defaultExplorerPrefs, explorerPrefsSchema } from "./market-explorer"

describe("explorer preferences", () => {
  it("ships three editable views and leaves open interest off", () => {
    const prefs = explorerPrefsSchema.parse(defaultExplorerPrefs())
    expect(prefs.views.map((view) => view.name)).toEqual([
      "Just moved",
      "Big and cheap to hold",
      "Test only",
    ])
    expect(prefs.current.columns).not.toContain("openInterestUsd")
  })
  it("refuses unbounded input and sorting by a hidden column", () => {
    const prefs = defaultExplorerPrefs()
    expect(
      explorerPrefsSchema.safeParse({
        ...prefs,
        current: { ...prefs.current, minimumVolume: Infinity },
      }).success
    ).toBe(false)
    expect(
      explorerPrefsSchema.safeParse({
        ...prefs,
        current: { ...prefs.current, columns: ["price"] },
      }).success
    ).toBe(false)
    expect(
      explorerPrefsSchema.safeParse({
        ...prefs,
        current: { ...prefs.current, columns: ["price", "price"] },
      }).success
    ).toBe(false)
  })
})

it("clears filters without throwing away the chosen columns or grouping", async () => {
  const { clearExplorerFilters } = await import("./market-explorer")
  const view = {
    ...defaultExplorerPrefs().current,
    search: "BTC",
    columns: ["price" as const],
    sort: "price" as const,
    groupByCoin: true,
  }
  expect(clearExplorerFilters(view)).toMatchObject({
    search: "",
    columns: ["price"],
    sort: "price",
    groupByCoin: true,
  })
})
