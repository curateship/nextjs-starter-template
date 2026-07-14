import { describe, expect, it } from "vitest"

import {
  getMountedLocation,
  isFullBleedLocation,
} from "@/lib/full-bleed-location"

describe("isFullBleedLocation", () => {
  it("removes the outer gutter from a backtest run", () => {
    expect(
      isFullBleedLocation({
        pathname: "/backtest",
        search: { run: "run-id" },
      })
    ).toBe(true)
  })

  it("keeps the outer gutter on backtest lists", () => {
    expect(
      isFullBleedLocation({ pathname: "/backtest", search: {} })
    ).toBe(false)
    expect(
      isFullBleedLocation({ pathname: "/backtest/group-id", search: {} })
    ).toBe(false)
  })
})

describe("getMountedLocation", () => {
  it("keeps the mounted page location while the next route is loading", () => {
    const mountedLocation = { pathname: "/automations", search: {} }
    const destination = { pathname: "/trade", search: {} }

    expect(
      getMountedLocation({
        location: destination,
        matches: [mountedLocation],
      })
    ).toBe(mountedLocation)
  })

  it("changes spacing in the same commit as the mounted page", () => {
    const previousLocation = { pathname: "/automations", search: {} }
    const mountedLocation = { pathname: "/trade", search: {} }
    const routerState = {
      location: mountedLocation,
      resolvedLocation: previousLocation,
      matches: [mountedLocation],
    }

    expect(getMountedLocation(routerState)).toBe(mountedLocation)
  })
})
