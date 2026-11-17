import { describe, expect, it } from "vitest"

import { readProjectsFilter } from "@/lib/project/projects-filter"

describe("readProjectsFilter", () => {
  it("keeps the four filter values and drops the rest", () => {
    expect(
      readProjectsFilter({ team: "team-1", client: " Hart Dental ", category: "-", group: "client", settings: "p1" })
    ).toEqual({ team: "team-1", client: "Hart Dental", category: "-", group: "client" })
  })

  it("drops values that can't be filters", () => {
    expect(readProjectsFilter({ team: "not an id!", client: "", category: 3, group: "lead" })).toEqual({})
  })
})
