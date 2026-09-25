import { describe, expect, it } from "vitest"

import { audienceIsMostOfTheList } from "@/lib/automations/nodes/audience"

describe("the nudge when a choice is nearly everybody", () => {
  it("says so once a choice covers four in five of the list", () => {
    expect(audienceIsMostOfTheList("registered", 24, 26)).toBe(true)
    expect(audienceIsMostOfTheList("registered", 19, 26)).toBe(false)
  })

  it("stays quiet about the choice that means everyone", () => {
    expect(audienceIsMostOfTheList("everyone", 26, 26)).toBe(false)
  })

  // Nobody is not "most of" anything, and neither is a share of an empty list.
  it("stays quiet when there is nobody to talk about", () => {
    expect(audienceIsMostOfTheList("paying", 0, 26)).toBe(false)
    expect(audienceIsMostOfTheList("paying", 0, 0)).toBe(false)
  })
})
