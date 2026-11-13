import { describe, expect, it } from "vitest"

import { readProjectsSearch, sectionOf, sectionSearch } from "@/lib/social/projects-dashboard-search"

/** The Projects dashboard's address (Tyler, 12 Nov 2026: one cohesive 3 panel design). */
describe("the Projects dashboard's address", () => {
  it("lands on Projects with no section, and reads only what it knows", () => {
    expect(sectionOf(readProjectsSearch({}))).toBe("projects")
    expect(readProjectsSearch({ section: "projects" })).toEqual({})
    expect(readProjectsSearch({ section: "nonsense", platform: "myspace", status: "fine", bin: "yes", open: "x".repeat(40) })).toEqual({})
    expect(readProjectsSearch({ section: "archive", project: "p1", kind: "video", bin: 1, posted: "no", open: "i1" })).toEqual({
      section: "archive",
      project: "p1",
      kind: "video",
      bin: "1",
      posted: "no",
      open: "i1",
    })
  })

  it("starts a picked section afresh, keeping only the project picked", () => {
    expect(sectionSearch("accounts", { project: "p1" })).toEqual({ section: "accounts", project: "p1" })
    expect(sectionSearch("projects")).toEqual({})
  })
})
