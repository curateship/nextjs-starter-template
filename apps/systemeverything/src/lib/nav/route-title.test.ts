import { describe, expect, it } from "vitest"

import { routePageTitle } from "@/lib/nav/route-title"

describe("routePageTitle", () => {
  it("names signed-in pages that are not in the saved navigation", () => {
    expect(routePageTitle("/_authenticated/admin/pages", "Workspaces")).toBe(
      "Pages"
    )
    expect(
      routePageTitle(
        "/_authenticated/account/billing_/success",
        "Workspaces"
      )
    ).toBe("Billing success")
  })

  it("uses the app's word for its workspace list", () => {
    expect(routePageTitle("/_authenticated/workspaces", "Teams")).toBe(
      "Teams"
    )
  })
})
