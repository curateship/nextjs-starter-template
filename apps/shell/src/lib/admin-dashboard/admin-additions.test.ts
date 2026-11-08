import { describe, expect, it } from "vitest"
import { BarChartIcon } from "lucide-react"

import { appBlockNodeName, type AdminAddition } from "@/lib/admin-dashboard/admin-additions"
import { SHELL_ADMIN_BLOCK_KEYS } from "@/lib/admin-dashboard/admin-page"
import { SHELL_WIDGET_IDS } from "@/lib/admin-dashboard/overview-widgets"
import { appAdminBlocks, appAdminWidgets } from "@/lib/app-options"

const addition = (key: string): AdminAddition => ({
  key,
  label: key,
  icon: BarChartIcon,
  load: async () => ({ default: () => null }),
})

/** An app's own Admin blocks and widgets, read from its `src/app/options.ts`. */
describe("an app's Admin blocks and widgets", () => {
  it("adds none when the app sets nothing, so the dashboard is the shell's alone", () => {
    expect(appAdminBlocks(SHELL_ADMIN_BLOCK_KEYS, {})).toEqual([])
    expect(appAdminWidgets(SHELL_WIDGET_IDS, {})).toEqual([])
  })

  it("hands back the app's own, in its order", () => {
    const options = { admin: { blocks: [addition("trip-count")], widgets: [addition("bookings"), addition("refunds")] } }
    expect(appAdminBlocks(SHELL_ADMIN_BLOCK_KEYS, options).map((block) => block.key)).toEqual(["trip-count"])
    expect(appAdminWidgets(SHELL_WIDGET_IDS, options).map((widget) => widget.key)).toEqual(["bookings", "refunds"])
  })

  it("refuses a key the shell uses, a key used twice, and a key that is not plain", () => {
    expect(() => appAdminBlocks(SHELL_ADMIN_BLOCK_KEYS, { admin: { blocks: [addition("plans")] } })).toThrow(
      /one of the shell's own Admin blocks/
    )
    expect(() => appAdminWidgets(SHELL_WIDGET_IDS, { admin: { widgets: [addition("views")] } })).toThrow(
      /one of the shell's own Admin widgets/
    )
    expect(() =>
      appAdminWidgets(SHELL_WIDGET_IDS, { admin: { widgets: [addition("bookings"), addition("bookings")] } })
    ).toThrow(/Two Admin widgets/)
    expect(() => appAdminBlocks(SHELL_ADMIN_BLOCK_KEYS, { admin: { blocks: [addition("Trip_Count")] } })).toThrow(
      /not allowed/
    )
  })

  it("names an app block's node from its key", () => {
    expect(appBlockNodeName("trip-count")).toBe("noteAdminAppTripCount")
    expect(appBlockNodeName("refunds")).toBe("noteAdminAppRefunds")
  })
})
