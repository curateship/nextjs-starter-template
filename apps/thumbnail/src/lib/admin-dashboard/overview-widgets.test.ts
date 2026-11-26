import { SparklesIcon } from "lucide-react"
import { describe, expect, it } from "vitest"

import {
  appWidgetId,
  cleanWidgetLayout,
  noWidgetsText,
  offeredWidgets,
  DEFAULT_CRM_WIDGET_LAYOUT,
  DEFAULT_WIDGET_LAYOUT,
  placeWidget,
  setRowColumns,
  SHELL_WIDGET_IDS,
  widgetsShown,
  widgetChoices,
} from "@/lib/admin-dashboard/overview-widgets"

const known = SHELL_WIDGET_IDS

/** Overview's widget layout: up to two rows, each with its own columns. */
describe("Overview's widget layout", () => {
  it("offers the shell's nine widgets when the app adds none", () => {
    expect(widgetChoices("admin").map((choice) => choice.id)).toEqual([
      "views",
      "ai-spend",
      "by-person",
      "top-pages",
      "devices",
      "referrers",
      "ai-features",
      "ai-models",
      "meters",
    ])
  })

  it("offers the CRM the shell's four Inbox widgets when the app adds none", () => {
    expect(widgetChoices("crm").map((widget) => widget.id)).toEqual([
      "unread",
      "waiting",
      "mail-per-day",
      "first-answer",
    ])
  })

  it("starts the CRM with the Inbox widgets, two on top and two under them", () => {
    const crmKnown = widgetChoices("crm").map((widget) => widget.id)
    expect(cleanWidgetLayout(undefined, crmKnown, DEFAULT_CRM_WIDGET_LAYOUT)).toEqual({
      top: { columns: 2, spots: ["unread", "waiting"] },
      bottom: { columns: 2, spots: ["mail-per-day", "first-answer"] },
    })
  })

  it("keeps a CRM layout saved with empty spots as it was", () => {
    const crmKnown = widgetChoices("crm").map((widget) => widget.id)
    const saved = { top: { columns: 2, spots: [null, null] }, bottom: { columns: 0, spots: [] } }
    expect(cleanWidgetLayout(saved, crmKnown, DEFAULT_CRM_WIDGET_LAYOUT)).toEqual(saved)
  })

  it("starts with two charts on top and three lists under them", () => {
    expect(cleanWidgetLayout(undefined, known)).toEqual(DEFAULT_WIDGET_LAYOUT)
    expect(DEFAULT_WIDGET_LAYOUT).toEqual({
      top: { columns: 2, spots: ["views", "ai-spend"] },
      bottom: { columns: 3, spots: ["top-pages", "ai-features", "by-person"] },
    })
  })

  it("keeps one spot per column, empties unknown widgets, and shows a widget once", () => {
    const cleaned = cleanWidgetLayout(
      {
        top: { columns: 3, spots: ["views", "views", "gone-widget", "devices"] },
        bottom: { columns: 1, spots: [] },
      },
      known
    )
    expect(cleaned).toEqual({
      top: { columns: 3, spots: ["views", null, null] },
      bottom: { columns: 1, spots: [null] },
    })
  })

  it("lets only the bottom row be None, and keeps columns between 1 and 4", () => {
    expect(cleanWidgetLayout({ top: { columns: 0, spots: [] }, bottom: { columns: 0, spots: [] } }, known)).toEqual({
      top: { columns: 2, spots: [null, null] },
      bottom: { columns: 0, spots: [] },
    })
    expect(cleanWidgetLayout({ top: { columns: 5, spots: [] }, bottom: { columns: 4, spots: [] } }, known).top.columns).toBe(2)
  })

  it("keeps an app's widget only while the app still offers it", () => {
    const layout = { top: { columns: 1, spots: [appWidgetId("bookings")] }, bottom: { columns: 0, spots: [] } }
    expect(cleanWidgetLayout(layout, [...known, appWidgetId("bookings")]).top.spots).toEqual(["app:bookings"])
    expect(cleanWidgetLayout(layout, known).top.spots).toEqual([null])
  })

  it("keeps the spots that stay when a row's columns change, and adds new ones empty", () => {
    expect(setRowColumns(DEFAULT_WIDGET_LAYOUT, "bottom", 2).bottom).toEqual({
      columns: 2,
      spots: ["top-pages", "ai-features"],
    })
    expect(setRowColumns(DEFAULT_WIDGET_LAYOUT, "top", 4).top).toEqual({
      columns: 4,
      spots: ["views", "ai-spend", null, null],
    })
  })

  it("moves a widget out of its old spot when it is placed in another", () => {
    const moved = placeWidget(DEFAULT_WIDGET_LAYOUT, "top", 0, "by-person")
    expect(moved.top.spots).toEqual(["by-person", "ai-spend"])
    expect(moved.bottom.spots).toEqual(["top-pages", "ai-features", null])
    expect(placeWidget(DEFAULT_WIDGET_LAYOUT, "top", 1, null).top.spots).toEqual(["views", null])
  })

  it("counts the widgets shown, leaving out empty spots and a bottom row set to None", () => {
    expect(widgetsShown(DEFAULT_WIDGET_LAYOUT)).toBe(5)
    expect(widgetsShown(placeWidget(DEFAULT_WIDGET_LAYOUT, "top", 0, null))).toBe(4)
    expect(widgetsShown(setRowColumns(DEFAULT_WIDGET_LAYOUT, "bottom", 0))).toBe(2)
  })

  it("offers an app's own list in place of a board's, with its own empty words", () => {
    const own = [{ id: "pnl", label: "PnL Graph", icon: SparklesIcon }]
    expect(offeredWidgets({ offer: { choices: own } })).toBe(own)
    expect(offeredWidgets({ board: "crm" }).map((widget) => widget.id)).toContain("unread")
    expect(noWidgetsText({ offer: { choices: [], none: "No trading widgets." } })).toBe("No trading widgets.")
    expect(noWidgetsText({ offer: { choices: [] } })).toBe("No widgets yet.")
    expect(noWidgetsText({ board: "crm" })).toBe("No widgets yet.")
  })
})
