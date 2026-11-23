import { describe, expect, it } from "vitest"

import { DEFAULT_BOTS_WIDGET_LAYOUT, readBotsWidgetLayout } from "@/lib/bots/bots-widgets"
import { withBotsSectionsBlock, BOTS_SECTIONS_NODE } from "@/lib/bots/bots-page"

describe("the Bots Overview's layout", () => {
  it("starts with Running bots alone, and reads nothing saved as that start", () => {
    expect(readBotsWidgetLayout(null)).toEqual(DEFAULT_BOTS_WIDGET_LAYOUT)
    expect(DEFAULT_BOTS_WIDGET_LAYOUT.top.spots).toEqual(["running-bots"])
  })

  it("empties a spot holding a widget the Bots Overview does not offer", () => {
    const read = readBotsWidgetLayout({
      top: { columns: 2, spots: ["running-bots", "equity"] },
      bottom: { columns: 0, spots: [] },
    })
    expect(read.top.spots).toEqual(["running-bots", null])
  })
})

describe("the Bots page", () => {
  it("always holds one Dashboards block, put back at the top when it went missing", () => {
    const lost = withBotsSectionsBlock({ type: "doc", content: [{ type: "paragraph" }] })
    expect(lost.content?.[0]?.type).toBe(BOTS_SECTIONS_NODE)
    const twice = withBotsSectionsBlock({
      type: "doc",
      content: [{ type: "paragraph" }, { type: BOTS_SECTIONS_NODE }, { type: BOTS_SECTIONS_NODE }],
    })
    expect(twice.content?.filter((node) => node.type === BOTS_SECTIONS_NODE)).toHaveLength(1)
    expect(twice.content?.[1]?.type).toBe(BOTS_SECTIONS_NODE)
  })
})
