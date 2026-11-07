import { describe, expect, it } from "vitest"

import {
  createDefaultStyling,
  getPageShadeVars,
  getSidebarShadeVars,
  normalizeStyling,
} from "@/lib/layout/styling-values"

describe("sidebarShade", () => {
  it("leaves a row saved before the setting existed without one", () => {
    const styling = normalizeStyling(createDefaultStyling())
    expect(styling.sidebarShade).toBeUndefined()
    expect(getSidebarShadeVars(styling)).toEqual({
      "--shell-rail-card-share": "50%",
    })
  })

  it("keeps a saved value and clamps one out of range", () => {
    const base = createDefaultStyling()
    expect(normalizeStyling({ ...base, sidebarShade: 20 }).sidebarShade).toBe(20)
    expect(normalizeStyling({ ...base, sidebarShade: 140 }).sidebarShade).toBe(100)
    expect(normalizeStyling({ ...base, sidebarShade: -5 }).sidebarShade).toBe(0)
    expect(normalizeStyling({ ...base, sidebarShade: "x" }).sidebarShade).toBe(50)
  })

  it("writes the share as a percentage", () => {
    const styling = { ...createDefaultStyling(), sidebarShade: 0 }
    expect(getSidebarShadeVars(styling)).toEqual({
      "--shell-rail-card-share": "0%",
    })
  })
})

describe("pageShade", () => {
  it("reads a row saved before the setting existed as halfway", () => {
    const styling = normalizeStyling(createDefaultStyling())
    expect(styling.pageShade).toBeUndefined()
    expect(getPageShadeVars(styling)).toEqual({ "--shell-page-depth": "50%" })
  })

  it("keeps a saved value and clamps one out of range", () => {
    const base = createDefaultStyling()
    expect(normalizeStyling({ ...base, pageShade: 80 }).pageShade).toBe(80)
    expect(normalizeStyling({ ...base, pageShade: 140 }).pageShade).toBe(100)
    expect(normalizeStyling({ ...base, pageShade: -5 }).pageShade).toBe(0)
    expect(getPageShadeVars({ ...base, pageShade: 0 })).toEqual({
      "--shell-page-depth": "0%",
    })
  })
})
