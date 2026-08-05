import { describe, expect, it } from "vitest"

import {
  createDefaultDashboardWidgets,
  findWidgetSlot,
  isDashboardBoardEmpty,
  normalizeDashboardWidgets,
  unplacedDashboardWidgets,
} from "@/lib/dashboard-widgets"

describe("saved dashboard arrangement", () => {
  it("gives a workspace saved before widgets existed the layout it had", () => {
    expect(normalizeDashboardWidgets(undefined)).toEqual(
      createDefaultDashboardWidgets()
    )
  })

  it.each([null, "top", 7, ["figures"], {}, { top: "figures" }])(
    "falls back to the default arrangement for %p",
    (value) => {
      expect(normalizeDashboardWidgets(value)).toEqual(
        createDefaultDashboardWidgets()
      )
    }
  )

  it("keeps a saved arrangement exactly as it was written", () => {
    const saved = {
      top: ["people"],
      left: ["automations", "figures"],
      right: ["traffic"],
    }

    expect(normalizeDashboardWidgets(saved)).toEqual(saved)
  })

  it("drops ids no widget answers to", () => {
    expect(
      normalizeDashboardWidgets({
        top: ["figures", "revenue", 4, null],
        left: [],
        right: [],
      })
    ).toEqual({ top: ["figures"], left: [], right: [] })
  })

  it("keeps only the first copy of a widget placed twice", () => {
    expect(
      normalizeDashboardWidgets({
        top: ["figures"],
        left: ["people", "people"],
        right: ["figures", "traffic"],
      })
    ).toEqual({
      top: ["figures"],
      left: ["people"],
      right: ["traffic"],
    })
  })

  it("leaves a slot empty when the row does not mention it", () => {
    expect(normalizeDashboardWidgets({ left: ["people"] })).toEqual({
      top: [],
      left: ["people"],
      right: [],
    })
  })

  it("keeps a board somebody cleared cleared", () => {
    const empty = { top: [], left: [], right: [] }

    expect(normalizeDashboardWidgets(empty)).toEqual(empty)
    expect(isDashboardBoardEmpty(normalizeDashboardWidgets(empty))).toBe(true)
  })
})

describe("where a widget sits", () => {
  it("finds the slot a widget is in, and reports one that is off", () => {
    const layout = normalizeDashboardWidgets({
      top: ["figures"],
      left: ["people"],
      right: [],
    })

    expect(findWidgetSlot(layout, "figures")).toBe("top")
    expect(findWidgetSlot(layout, "people")).toBe("left")
    expect(findWidgetSlot(layout, "traffic")).toBeNull()
  })

  it("lists what is not on the dashboard, in the catalogue's order", () => {
    const layout = normalizeDashboardWidgets({
      top: [],
      left: ["activity"],
      right: ["people"],
    })

    expect(unplacedDashboardWidgets(layout).map((widget) => widget.id)).toEqual([
      "figures",
      "needs-you",
      "traffic",
      "automations",
    ])
  })

  it("has nothing spare while the default arrangement is in place", () => {
    expect(unplacedDashboardWidgets(createDefaultDashboardWidgets())).toEqual([])
    expect(isDashboardBoardEmpty(createDefaultDashboardWidgets())).toBe(false)
  })
})
