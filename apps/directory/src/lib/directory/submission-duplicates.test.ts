import { describe, expect, it } from "vitest"

import {
  describeDuplicateMatch,
  duplicateNameKey,
  duplicatePhoneKey,
  duplicateWebsiteKey,
  namesAreClose,
} from "@/lib/directory/submission-duplicates"

describe("the keys a submission is compared by", () => {
  it("reads two spellings of one name as the same", () => {
    expect(duplicateNameKey("The Luigi's Pizza & Pasta")).toBe(
      duplicateNameKey("luigis pizza and pasta")
    )
  })

  it("counts one name inside the other only when it is long enough", () => {
    expect(
      namesAreClose(
        duplicateNameKey("Luigi's Pizza"),
        duplicateNameKey("Luigi's Pizza & Pasta")
      )
    ).toBe(true)
    // "Pizza" sits inside half the city.
    expect(
      namesAreClose(duplicateNameKey("Pizza"), duplicateNameKey("Luigi's Pizza"))
    ).toBe(false)
  })

  it("compares the last ten digits of a phone number", () => {
    expect(duplicatePhoneKey("+1 (416) 555-0100")).toBe(
      duplicatePhoneKey("416.555.0100")
    )
    expect(duplicatePhoneKey("ext 12")).toBe("")
  })

  it("compares a website by its host", () => {
    expect(duplicateWebsiteKey("https://www.Luigis.com/menu?x=1")).toBe(
      "luigis.com"
    )
    expect(duplicateWebsiteKey("luigis.com")).toBe("luigis.com")
    expect(duplicateWebsiteKey("not a website")).toBe("")
  })

  it("keeps the page on a host many businesses share", () => {
    expect(duplicateWebsiteKey("https://facebook.com/LuigisPizza/")).toBe(
      "facebook.com/luigispizza"
    )
    // A bare Facebook link says nothing about which business it is.
    expect(duplicateWebsiteKey("facebook.com")).toBe("")
  })
})

describe("the sentence under a match", () => {
  it("names every exact match, and the name last", () => {
    expect(describeDuplicateMatch(["phone", "website"])).toBe(
      "Same phone number and website."
    )
    expect(describeDuplicateMatch(["website", "name"])).toBe(
      "Same website, and a very close name."
    )
    expect(describeDuplicateMatch(["name"])).toBe("Very close name.")
  })
})
