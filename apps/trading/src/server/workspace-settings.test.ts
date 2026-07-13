import { describe, expect, it } from "vitest"

import { parseWorkspaceSettings } from "@/server/workspaces"

describe("workspace settings", () => {
  it("rejects settings that have not been migrated to a sidebar width", () => {
    expect(() =>
      parseWorkspaceSettings({
        icon: "briefcaseBusiness",
        favicon: "",
        topNavigation: [],
        topRightNavigation: [],
        sections: [],
      })
    ).toThrow("Saved workspace settings are missing sidebarWidth")
  })
})
