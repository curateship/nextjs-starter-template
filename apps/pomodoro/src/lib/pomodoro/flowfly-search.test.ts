import { describe, expect, it } from "vitest"

import {
  flowflyLink,
  flowflySearchFor,
  flowflySectionOf,
  flowflyTabOf,
  oldPageSearch,
  OLD_ADMIN_PAGES,
  readFlowflySearch,
  sectionOfTab,
  FLOWFLY_TABS,
} from "@/lib/pomodoro/flowfly-search"

/**
 * The Flowfly dashboard's address (Tyler, 13 Nov 2026): seven sections, each
 * with its lists as tabs. A pasted link has to open the same list with the
 * same filters, and an old /admin/pomodoro-* link has to land on its tab.
 */
describe("readFlowflySearch", () => {
  it("keeps a tab's own filters, checked the way its old page checked them", () => {
    expect(
      readFlowflySearch({ section: "rooms", phase: "focus", visibility: "nope", sort: "members", direction: "asc", page: "2" })
    ).toEqual({ section: "rooms", phase: "focus", sort: "members", direction: "asc", page: 2 })
  })

  it("drops another tab's filters", () => {
    // `mode` belongs to Sessions, not Rooms.
    expect(readFlowflySearch({ section: "rooms", mode: "focus" })).toEqual({ section: "rooms" })
    expect(readFlowflySearch({ section: "tasks", list: "sessions", mode: "focus" })).toMatchObject({ mode: "focus" })
  })

  it("ignores a tab that belongs to another section", () => {
    const search = readFlowflySearch({ section: "rooms", list: "reports" })
    expect(search.list).toBeUndefined()
    expect(flowflyTabOf(search)).toBe("rooms")
  })

  it("has no Chat tab under Rooms (Tyler: \"we dont need this tab\")", () => {
    expect(FLOWFLY_TABS.rooms).toEqual(["rooms", "weekly", "invites", "presets"])
  })

  it("keeps a member open on the right on any section", () => {
    expect(readFlowflySearch({ section: "overview", member: "user-1" })).toEqual({ section: "overview", member: "user-1" })
  })

  it("reads Backgrounds and Sounds with the catalogue's own reader", () => {
    expect(readFlowflySearch({ section: "library", status: "live", access: "pro", tag: "rain" })).toMatchObject({
      section: "library",
      status: "live",
      access: "pro",
      tag: "rain",
    })
  })

  it("lands on Rooms from a bare address until the remembered place loads", () => {
    expect(flowflySectionOf({})).toBe("rooms")
  })
})

describe("links into the dashboard", () => {
  it("names a tab only when it is not the section's first", () => {
    expect(flowflySearchFor("safety", "reports")).toEqual({ section: "safety" })
    expect(flowflySearchFor("safety", "bans")).toEqual({ section: "safety", list: "bans" })
    expect(flowflyLink("sessions", { user: "u1" })).toEqual({ section: "tasks", list: "sessions", user: "u1" })
  })

  it("puts every tab in exactly one section", () => {
    for (const [section, tabs] of Object.entries(FLOWFLY_TABS)) {
      for (const tab of tabs) expect(sectionOfTab(tab)).toBe(section)
    }
  })
})

describe("old /admin/pomodoro-* addresses", () => {
  it("forward to their tab, keeping their filters", () => {
    expect(oldPageSearch("pomodoro-uploads", { sharing: "waiting" })).toEqual({
      section: "library",
      list: "uploads",
      sharing: "waiting",
    })
    expect(oldPageSearch("pomodoro-reports", { status: "pending", open: "r1" })).toMatchObject({
      section: "safety",
      list: "reports",
      status: "pending",
      open: "r1",
    })
  })

  it("send Follows' Cheers tab to Cheers, and Chat to Rooms with nothing of its own", () => {
    expect(oldPageSearch("pomodoro-follows", { tab: "cheers" })).toEqual({ section: "social", list: "cheers" })
    expect(oldPageSearch("pomodoro-chat", { tab: "held", q: "spam" })).toEqual({ section: "rooms", list: "rooms" })
  })

  it("send Focus and Leaderboard to Profiles, which took their place", () => {
    expect(oldPageSearch("pomodoro-focus", { sort: "sessions", q: "sam" })).toEqual({ section: "members", list: "profiles" })
    expect(oldPageSearch("pomodoro-leaderboard", { tab: "hidden" })).toEqual({ section: "members", list: "profiles" })
    expect(readFlowflySearch({ section: "members", list: "focus" })).toEqual({ section: "members" })
    expect(readFlowflySearch({ section: "members", list: "profiles", sort: "focus" })).toMatchObject({ sort: "focus" })
  })

  it("cover every old page", () => {
    expect(Object.keys(OLD_ADMIN_PAGES)).toHaveLength(25)
  })
})
