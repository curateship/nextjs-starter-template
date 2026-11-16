// @vitest-environment jsdom
import { isRedirect } from "@tanstack/react-router"
import { beforeEach, describe, expect, it } from "vitest"

import { restoreDashboardPlace, ssrUnlessBare } from "./dashboard-place"

const matches = [
  {
    routeId: "/_authenticated",
    loaderData: {
      user: { id: "user-1" },
      workspaces: { workspaces: [{ id: "site-1", active: true }] },
    },
  },
]
const location = { pathname: "/admin/dashboard" }

function thrown(run: () => void) {
  try {
    run()
  } catch (error) {
    return error
  }
  return undefined
}

describe("restoreDashboardPlace", () => {
  beforeEach(() => localStorage.clear())

  // Tyler, 16 Nov 2026: "it loads the overview first and it takes 1 sec to
  // redirect me". The way back is taken before anything loads.
  it("sends a bare address to the remembered place before the dashboard loads", () => {
    localStorage.setItem("admin-place:user-1:site-1", JSON.stringify({ tab: "users", open: "u-9" }))
    const error = thrown(() =>
      restoreDashboardPlace("admin-place", { search: { account: undefined }, location, matches, cause: "enter" })
    ) as { options: { to: string; search: Record<string, unknown>; replace: boolean } }
    expect(isRedirect(error)).toBe(true)
    expect(error.options.to).toBe("/admin/dashboard")
    expect(error.options.search).toMatchObject({ tab: "users", open: "u-9" })
    expect(error.options.replace).toBe(true)
  })

  it("leaves an address that already says something", () => {
    localStorage.setItem("admin-place:user-1:site-1", JSON.stringify({ tab: "users" }))
    expect(
      thrown(() => restoreDashboardPlace("admin-place", { search: { tab: "media" }, location, matches, cause: "enter" }))
    ).toBeUndefined()
  })

  it("never moves anything on a hover's preload", () => {
    localStorage.setItem("admin-place:user-1:site-1", JSON.stringify({ tab: "users" }))
    expect(
      thrown(() => restoreDashboardPlace("admin-place", { search: {}, location, matches, cause: "preload" }))
    ).toBeUndefined()
  })

  it("treats the browser's first load as an arrival", () => {
    localStorage.setItem("admin-place:user-1:site-1", JSON.stringify({ tab: "users" }))
    expect(
      isRedirect(thrown(() => restoreDashboardPlace("admin-place", { search: {}, location, matches, cause: "stay" })))
    ).toBe(true)
  })

  it("reads only this person's place on this site", () => {
    localStorage.setItem("admin-place:user-2:site-1", JSON.stringify({ tab: "users" }))
    expect(
      thrown(() => restoreDashboardPlace("admin-place", { search: {}, location, matches, cause: "enter" }))
    ).toBeUndefined()
  })
})

describe("ssrUnlessBare", () => {
  it("leaves a bare address to the browser and draws any other on the server", () => {
    expect(ssrUnlessBare({ search: { status: "success", value: { account: "profile" } } })).toBe(false)
    expect(ssrUnlessBare({ search: { status: "success", value: { tab: "users" } } })).toBe(true)
  })
})
