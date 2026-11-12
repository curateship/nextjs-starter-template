import { describe, expect, it } from "vitest"

import { movedSettingsTab } from "@/lib/admin-dashboard/moved-settings"
import { orderSections } from "@/lib/layout/styling-values"

describe("movedSettingsTab", () => {
  it("sends each moved Settings row to its Admin section and tab", () => {
    expect(movedSettingsTab("navigation")).toEqual({ tab: "navigation" })
    expect(movedSettingsTab("sidebar")).toEqual({ tab: "navigation" })
    expect(movedSettingsTab("member-navigation")).toEqual({ tab: "navigation", nav: "members" })
    expect(movedSettingsTab("public-navigation")).toEqual({ tab: "navigation", nav: "public" })
    expect(movedSettingsTab("role-navigation-coach")).toEqual({ tab: "navigation", nav: "role-coach" })
    expect(movedSettingsTab("styling")).toEqual({ tab: "styling" })
    expect(movedSettingsTab("public-styling")).toEqual({ tab: "styling", side: "public" })
  })

  it("leaves the rows still in Settings alone", () => {
    for (const tab of ["general", "email", "payments", "ai", "public-seo", "public-social"]) {
      expect(movedSettingsTab(tab)).toBeNull()
    }
  })
})

describe("orderSections", () => {
  const all = ["overview", "pages", "styling", "users", "media"] as const

  it("keeps the shell's order when nothing is saved", () => {
    expect(orderSections(all, undefined)).toEqual(all)
  })

  it("puts the saved ones first in their order, Overview always first", () => {
    expect(orderSections(all, ["users", "overview", "pages"])).toEqual(["overview", "users", "pages", "styling", "media"])
  })

  it("drops a saved name the dashboard no longer has", () => {
    expect(orderSections(all, ["gone", "media"])).toEqual(["overview", "media", "pages", "styling", "users"])
  })
})
