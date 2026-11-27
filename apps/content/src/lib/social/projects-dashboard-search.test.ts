import { describe, expect, it } from "vitest"

import { readProjectsSearch, sectionOf, sectionSearch } from "@/lib/social/projects-dashboard-search"

/** The Projects dashboard's address (Tyler, 12 Nov 2026: one cohesive 3 panel design). */
describe("the Projects dashboard's address", () => {
  it("lands on Projects with no section, and reads only what it knows", () => {
    expect(sectionOf(readProjectsSearch({}))).toBe("projects")
    expect(readProjectsSearch({ section: "projects" })).toEqual({})
    expect(readProjectsSearch({ section: "nonsense", platform: "myspace", status: "fine", bin: "yes", open: "x".repeat(40) })).toEqual({})
    // The Projects block that narrowed a section to one project is gone (Tyler, 27 Nov 2026).
    expect(readProjectsSearch({ section: "accounts", project: "p1", platform: "reddit", show: "retired", open: "a1" })).toEqual({
      section: "accounts",
      platform: "reddit",
      show: "retired",
      open: "a1",
    })
  })

  it("lands an old Voices or Archive address on Projects, with what it still knows", () => {
    // Each project's now (Tyler, 27 Nov 2026): a network's Voices tab and the project's Content tab.
    expect(readProjectsSearch({ section: "voices", open: "v1" })).toEqual({ open: "v1" })
    expect(sectionOf(readProjectsSearch({ section: "archive", project: "p1", kind: "video", bin: 1 }))).toBe("projects")
  })

  it("starts a picked section afresh", () => {
    expect(sectionSearch("accounts")).toEqual({ section: "accounts" })
    expect(sectionSearch("projects")).toEqual({})
  })

  it("keeps a project on Vault, Hooks and Formats, from a saved view", () => {
    expect(readProjectsSearch({ section: "vault", project: "p1" })).toEqual({ section: "vault", project: "p1" })
  })
})
