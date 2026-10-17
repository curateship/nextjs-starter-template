import { describe, expect, it } from "vitest"

import {
  PANEL_FRAME_NAME,
  addressAsksForPanelView,
  panelViewInBrowser,
} from "@/lib/layout/panel-view"

/** A window inside a frame (its top is another window) or a tab of its own. */
function fakeWindow({ framed, name = "" }: { framed: boolean; name?: string }) {
  const top = {}
  return { top, self: framed ? {} : top, name } as unknown as Window
}

describe("panel view", () => {
  it("is asked for by panel=1 and nothing else", () => {
    expect(addressAsksForPanelView("?panel=1")).toBe(true)
    expect(addressAsksForPanelView("?account=profile&panel=1")).toBe(true)
    expect(addressAsksForPanelView("?panel=0")).toBe(false)
    expect(addressAsksForPanelView("?panel")).toBe(false)
    expect(addressAsksForPanelView("")).toBe(false)
  })

  it("draws a panel only inside a frame", () => {
    expect(panelViewInBrowser("?panel=1", fakeWindow({ framed: true }))).toBe(true)
    expect(panelViewInBrowser("?panel=1", fakeWindow({ framed: false }))).toBe(
      false
    )
    expect(
      panelViewInBrowser(
        "",
        fakeWindow({ framed: false, name: PANEL_FRAME_NAME })
      )
    ).toBe(false)
  })

  it("keeps panel view in a frame named for it after panel=1 falls off", () => {
    const win = fakeWindow({ framed: true, name: PANEL_FRAME_NAME })
    expect(panelViewInBrowser("", win)).toBe(true)
    expect(panelViewInBrowser("?account=profile", win)).toBe(true)
  })

  it("leaves any other frame alone, as the IDE's preview is", () => {
    expect(panelViewInBrowser("", fakeWindow({ framed: true }))).toBe(false)
    expect(
      panelViewInBrowser("", fakeWindow({ framed: true, name: "preview" }))
    ).toBe(false)
  })
})
