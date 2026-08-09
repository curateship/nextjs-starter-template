import { describe, expect, it } from "vitest"

import { cardFoldsSchema, readCardFolds } from "./card-folds"

describe("remembered card folds", () => {
  it("keeps what it understands and drops the rest", () => {
    expect(
      readCardFolds({ "smart-ladder": false, "smart-tp-on": true, junk: "yes" })
    ).toEqual({ "smart-ladder": false, "smart-tp-on": true })
  })

  it("reads anything that is not a plain object as nothing remembered", () => {
    expect(readCardFolds(null)).toEqual({})
    expect(readCardFolds("folded")).toEqual({})
    expect(readCardFolds(["smart-ladder"])).toEqual({})
  })

  it("refuses a request that would fill the column up", () => {
    const many: Record<string, boolean> = {}
    for (let i = 0; i < 61; i += 1) many[`card-${i}`] = false
    expect(cardFoldsSchema.safeParse(many).success).toBe(false)
    expect(cardFoldsSchema.safeParse({ "smart-ladder": false }).success).toBe(true)
  })

  it("refuses an id long enough to be a payload", () => {
    expect(cardFoldsSchema.safeParse({ ["x".repeat(61)]: false }).success).toBe(
      false
    )
  })
})
