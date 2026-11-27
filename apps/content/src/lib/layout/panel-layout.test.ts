// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest"

import { forgetPanelWidths, inPixelsOf, panelLayoutKey, sidePanelWidthsKey } from "@/lib/layout/panel-layout"

describe("forgetPanelWidths", () => {
  afterEach(() => localStorage.clear())

  it("forgets every dragged panel width and keeps everything else", () => {
    const crm = sidePanelWidthsKey(panelLayoutKey.crmWorkspace, 14, 16)
    const admin = sidePanelWidthsKey(panelLayoutKey.admin, 14, 16)
    // An app's own dashboard, with a key the shell does not list.
    const project = sidePanelWidthsKey("project-page-horizontal-3", 20, 0)
    for (const key of [crm, admin, project, panelLayoutKey.frontPageEditor, panelLayoutKey.automations]) {
      localStorage.setItem(key, JSON.stringify({ left: 30, middle: 50, right: 20 }))
    }
    localStorage.setItem(panelLayoutKey.crmPlace, "{}")
    localStorage.setItem(panelLayoutKey.dashboardColumns("overview"), "{}")
    localStorage.setItem("theme", "dark")

    forgetPanelWidths()

    expect(Object.keys(localStorage).sort()).toEqual(
      [panelLayoutKey.crmPlace, panelLayoutKey.dashboardColumns("overview"), "theme"].sort()
    )
  })
})

describe("inPixelsOf", () => {
  // Tyler, 16 Nov 2026: "when i collapse the sidebar. The left panel changes
  // the width I set it as". A layout saved with the left menu folded comes
  // back at the same pixels with it open.
  it("keeps the side panels' pixels and gives the difference to the middle", () => {
    const layout = inPixelsOf({ layout: { left: 10, middle: 75, right: 15 }, width: 1500 }, 1250, ["left", "right"])
    expect(layout.left * 12.5).toBeCloseTo(150)
    expect(layout.right * 12.5).toBeCloseTo(225)
    expect(layout.left + layout.middle + layout.right).toBeCloseTo(100)
  })

  it("reads a layout saved before widths were kept as it is", () => {
    expect(inPixelsOf({ left: 10, middle: 90 }, 1250, ["left"])).toEqual({ left: 10, middle: 90 })
  })

  it("leaves a folded side panel folded", () => {
    expect(inPixelsOf({ layout: { left: 0, middle: 100 }, width: 1500 }, 1250, ["left"])).toEqual({ left: 0, middle: 100 })
  })
})
