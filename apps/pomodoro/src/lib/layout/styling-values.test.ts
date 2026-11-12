import { describe, expect, it } from "vitest"

import {
  createDefaultStyling,
  getPanelCardStyleVars,
  getPageShadeVars,
  panelCardBorderShade,
  panelCardShade,
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

describe("panel cards", () => {
  const grey = (strength: number) => ({ mode: "muted" as const, strength, color: "#ffffff" })

  it("keeps the look they always had when nothing is saved", () => {
    const styling = normalizeStyling(createDefaultStyling())
    expect(getPanelCardStyleVars(styling)).toEqual({
      "--shell-panel-card-border-width": "1",
      "--shell-panel-card-radius": "10px",
      "--shell-panel-card-shadow": "none",
      "--shell-panel-card-inset": "0px",
      "--shell-panel-card-body": "transparent",
      "--shell-panel-card-tile-top": "0px",
      "--shell-panel-card-bleed": "0",
      "--shell-panel-first-opacity": "100%",
      "--shell-panel-first-blur": "12px",
    })
    expect(panelCardShade(styling)).toEqual({ value: 40, isDefault: true, custom: false })
    expect(panelCardBorderShade(styling)).toEqual({ value: 18, isDefault: true, custom: false })
  })

  it("makes the first side panel card wholly clear with no blur at 0%", () => {
    const styling = normalizeStyling({ ...createDefaultStyling(), panelCardOpacity: 140 })
    expect(styling.panelCardOpacity).toBe(100)
    const clear = getPanelCardStyleVars({ ...styling, panelCardOpacity: 0 })
    expect(clear["--shell-panel-first-opacity"]).toBe("0%")
    expect(clear["--shell-panel-first-blur"]).toBe("0px")
    expect(getPanelCardStyleVars({ ...styling, panelCardOpacity: 50 })["--shell-panel-first-blur"]).toBe("6px")
  })

  it("shows a grey saved before the sliders at its own strength", () => {
    const styling = normalizeStyling({
      ...createDefaultStyling(),
      panelCardBackground: grey(50),
      panelCardBorderColor: grey(4),
    })
    expect(panelCardShade(styling)).toEqual({ value: 50, isDefault: false, custom: false })
    expect(panelCardBorderShade(styling)).toEqual({ value: 4, isDefault: false, custom: false })
    expect(getPanelCardStyleVars(styling)["--shell-panel-card-bg"]).toBe(
      "color-mix(in oklab, var(--muted) 50%, var(--background))"
    )
  })

  it("names a fixed colour saved before the sliders as custom", () => {
    const styling = normalizeStyling({
      ...createDefaultStyling(),
      panelCardBackground: { mode: "custom", strength: 40, color: "#eeeeff" },
    })
    expect(panelCardShade(styling)).toEqual({ value: 40, isDefault: false, custom: true })
  })

  it("keeps corners and shadow, clamped to the blocks' ranges", () => {
    const styling = normalizeStyling({ ...createDefaultStyling(), panelCardRadius: 99, panelCardShadow: 50 })
    expect(styling.panelCardRadius).toBe(32)
    expect(getPanelCardStyleVars(styling)).toMatchObject({
      "--shell-panel-card-radius": "32px",
      "--shell-panel-card-shadow": "0 2px 12px rgb(0 0 0 / 0.100)",
    })
  })

  it("draws the tile, its edge and edge to edge once they are set", () => {
    const styling = normalizeStyling({
      ...createDefaultStyling(),
      panelCardInset: 40,
      panelCardBodyShade: 0,
      panelCardEdgeToEdge: true,
    })
    expect(styling.panelCardInset).toBe(16)
    expect(getPanelCardStyleVars(styling)).toMatchObject({
      "--shell-panel-card-inset": "16px",
      "--shell-panel-card-body": "color-mix(in oklab, var(--muted) 0%, var(--card))",
      "--shell-panel-card-tile-top": "12px",
      "--shell-panel-card-bleed": "1",
    })
  })
})

describe("the Sidebar & Top navigation border shade", () => {
  it("follows Divider lines until it is set, then is its own shade of the text colour", async () => {
    const { sidebarBorderColor, getBorderStyleVars } = await import("@/lib/layout/styling-values")
    expect(sidebarBorderColor({}, "rgb(1 2 3)")).toBe("rgb(1 2 3)")
    expect(sidebarBorderColor({}, null)).toBeNull()
    expect(sidebarBorderColor({ sidebarBorderShade: 30 }, "rgb(1 2 3)")).toBe(
      "color-mix(in oklab, var(--foreground) 30%, transparent)"
    )
    // The lines inside cards keep the Divider lines colour either way.
    const vars = getBorderStyleVars({
      ...createDefaultStyling(),
      dividerColor: { mode: "custom", strength: 100, color: "#123456" },
      sidebarBorderShade: 40,
    })
    expect(vars["--sidebar-border"]).toBe("color-mix(in oklab, var(--foreground) 40%, transparent)")
    expect(vars["--border"]).not.toBe(vars["--sidebar-border"])
  })
})

describe("the Automations Dashboards block's ⋮", () => {
  it("keeps its hidden sections and order, cleaned, and leaves them unset when never saved", () => {
    const base = createDefaultStyling()
    expect(normalizeStyling(base).automationSectionOrder).toBeUndefined()
    const styling = normalizeStyling({
      ...base,
      hiddenAutomationSections: ["waiting", "waiting", 3],
      automationSectionOrder: ["waiting", "automations"],
    })
    expect(styling.hiddenAutomationSections).toEqual(["waiting"])
    expect(styling.automationSectionOrder).toEqual(["waiting", "automations"])
  })
})
