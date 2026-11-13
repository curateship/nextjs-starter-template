import { describe, expect, it } from "vitest"

import { projectReach } from "@/lib/anti-detect/project-reach"
import { antiDetectSearch, antiDetectSectionOf, antiDetectSectionSearch, readAntiDetectSearch } from "@/lib/anti-detect/search"

/** The Anti Detect dashboard's address and what a project picked narrows to (Tyler, 12 Nov 2026). */
describe("the Anti Detect dashboard's address", () => {
  it("lands on Profiles with no section, keeps a section named, and reads only what it knows", () => {
    expect(antiDetectSectionOf(readAntiDetectSearch({}))).toBe("profiles")
    expect(readAntiDetectSearch({ section: "profiles" })).toEqual({ section: "profiles" })
    expect(readAntiDetectSearch({ section: "voices", app: "myspace", kind: "gone", since: 12, test: "maybe", open: "x".repeat(40) })).toEqual({})
    expect(readAntiDetectSearch({ section: "bans", project: "p1", app: "instagram", kind: "suspended", since: "30", seller: "Seller A", open: "b1" })).toEqual({
      section: "bans",
      project: "p1",
      app: "instagram",
      kind: "suspended",
      since: 30,
      seller: "Seller A",
      open: "b1",
    })
    expect(readAntiDetectSearch({ section: "proxies", test: "failed", proxyKind: "residential" })).toEqual({ section: "proxies", test: "failed", proxyKind: "residential" })
    // Phones: one rack, or "none" for the phones on no rack, and the phone filters, the kind as phoneKind.
    expect(readAntiDetectSearch({ section: "phones", rack: "none", status: "offline", phoneKind: "iphone", list: "jobs", group: "kind" })).toEqual({
      section: "phones",
      rack: "none",
      status: "offline",
      phoneKind: "iphone",
      list: "jobs",
      group: "kind",
    })
    // The old Racks section is gone, so its name lands on the default.
    expect(readAntiDetectSearch({ section: "racks" })).toEqual({})
  })

  it("starts a section afresh, keeping only the project, and turns an old address into its section", () => {
    expect(antiDetectSectionSearch("profiles", { project: "p1" })).toEqual({ section: "profiles", project: "p1" })
    expect(antiDetectSectionSearch("bans")).toEqual({ section: "bans" })
    // The old /admin/bans?open=… and /admin/proxies?open=… a bell notice stored.
    expect(antiDetectSearch("bans", { open: "b1", app: "reddit" })).toEqual({ section: "bans", open: "b1", app: "reddit" })
    expect(antiDetectSearch("proxies", { open: "x1" })).toEqual({ section: "proxies", open: "x1" })
    // Profiles is named too, so the old /admin/profiles never lands wherever the dashboard was left.
    expect(antiDetectSearch("profiles", {})).toEqual({ section: "profiles" })
    expect(antiDetectSearch("profiles", { open: "f1" })).toEqual({ section: "profiles", open: "f1" })
  })
})

describe("what a project's accounts use", () => {
  it("is the profiles and phones its accounts run on, their racks, and the proxies those go out through", () => {
    const accounts = [
      { project: { id: "p1" }, profile: { id: "f1" }, phone: null },
      { project: { id: "p1" }, profile: null, phone: { id: "ph1" } },
      { project: { id: "p2" }, profile: { id: "f2" }, phone: null },
      { project: null, profile: { id: "f3" }, phone: null },
    ]
    const profiles = [
      { id: "f1", proxy: { id: "x1" } },
      { id: "f2", proxy: { id: "x2" } },
      { id: "f3", proxy: null },
    ]
    const phones = [
      { id: "ph1", rackId: "r1", proxy: { id: "x3" } },
      { id: "ph2", rackId: "r2", proxy: null },
    ]
    const reach = projectReach("p1", accounts, profiles, phones)
    expect([...reach.profiles]).toEqual(["f1"])
    expect([...reach.phones]).toEqual(["ph1"])
    expect([...reach.racks]).toEqual(["r1"])
    expect([...reach.proxies].sort()).toEqual(["x1", "x3"])
    expect(projectReach("nobody", accounts, profiles, phones).profiles.size).toBe(0)
  })
})
