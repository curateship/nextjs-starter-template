import { describe, expect, it } from "vitest"

import { noticeKindFromWords, teamMorningDetail, teamMorningHeading } from "@/lib/project/notices"

const kindOf = (message: string) => noticeKindFromWords({ type: "app_activity", message })

describe("the team's morning notice", () => {
  it("leaves out the blocked count when nobody is blocked", () => {
    expect(teamMorningHeading(5, 6, 0)).toBe("5 of 6 checked in")
    expect(teamMorningHeading(5, 6, 1)).toBe("5 of 6 checked in, 1 blocked")
  })

  it("names who hasn't checked in, three at most", () => {
    expect(teamMorningDetail([])).toBe("Everyone's in.")
    expect(teamMorningDetail(["Ben", "Carla"])).toBe("Not yet: Ben, Carla.")
    expect(teamMorningDetail(["Ben", "Carla", "Dev", "Eve", "Finn"])).toBe("Not yet: Ben, Carla, Dev and 2 more.")
  })

  it("is still recognised in the bell, in old and new words", () => {
    expect(kindOf("5 of 6 checked in")).toBe("team_morning")
    expect(kindOf("5 of 6 checked in, 1 blocked")).toBe("team_morning")
    expect(kindOf("5 of 6 checked in, 0 blocked")).toBe("team_morning")
    expect(kindOf("5 of 6 checked in, blocked")).toBeNull()
  })
})
