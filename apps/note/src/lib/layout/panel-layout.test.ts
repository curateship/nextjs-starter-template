// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest"

import { forgetPanelWidths, panelLayoutKey, sidePanelWidthsKey } from "@/lib/layout/panel-layout"

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
