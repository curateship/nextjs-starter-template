import { describe, expect, it } from "vitest"

import { parseWorkspaceSettings } from "@/server/workspaces"

describe("workspace settings", () => {
  it("rejects settings that have not been migrated to a sidebar width", () => {
    expect(() =>
      parseWorkspaceSettings({
        icon: "briefcaseBusiness",
        favicon: "",
        topRightNavigation: [],
        sections: [],
      })
    ).toThrow("Saved workspace settings are missing sidebarWidth")
  })

  it("defaults missing Automation favorites and removes invalid duplicates", () => {
    const base = {
      icon: "briefcaseBusiness",
      sidebarWidth: 280,
      favicon: "",
      topRightNavigation: [],
      sections: [],
    }

    expect(parseWorkspaceSettings(base).automationFavoriteNodeKeys).toEqual([])
    expect(
      parseWorkspaceSettings({
        ...base,
        automationFavoriteNodeKeys: [
          "indicator-ema_cross",
          "action-buy",
          "action-buy",
          "unknown-node",
        ],
      }).automationFavoriteNodeKeys
    ).toEqual(["indicator-ema_cross", "action-buy"])
  })
})
