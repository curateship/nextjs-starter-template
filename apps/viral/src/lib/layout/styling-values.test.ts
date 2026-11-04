import { describe, expect, it } from "vitest"

import {
  createDefaultStyling,
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
