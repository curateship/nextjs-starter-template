import { describe, expect, it } from "vitest"

import { fitPercent } from "@/lib/trade/panel-fit"

/**
 * The panel is 280px of a 1000px workspace, so 28% of it, and every extra
 * pixel of rows is a tenth of a percent.
 */
const panel = { sizePx: 280, sizePercent: 28 }

describe("fitPercent", () => {
  it("grows by exactly the rows that are hidden", () => {
    // Six rows of 36px are out of sight: 216 more pixels, 21.6 more percent.
    expect(fitPercent({ ...panel, hidden: 216 })).toBeCloseTo(49.6, 5)
  })

  it("stops at half the workspace however many rows there are", () => {
    expect(fitPercent({ ...panel, hidden: 9000 })).toBe(50)
  })

  it("leaves the panel alone when every row already fits", () => {
    expect(fitPercent({ ...panel, hidden: 0 })).toBeNull()
    expect(fitPercent({ ...panel, hidden: -40 })).toBeNull()
  })

  it("leaves the panel alone when it is already at the cap", () => {
    expect(
      fitPercent({ sizePx: 500, sizePercent: 50, hidden: 400 })
    ).toBeNull()
  })

  it("grows a panel shut down to its tab row", () => {
    // 52.4px of a 1000px workspace, with 300px of rows behind the header.
    const wanted = fitPercent({ sizePx: 52.4, sizePercent: 5.24, hidden: 300 })
    expect(wanted).toBeCloseTo(35.24, 5)
  })

  it("says nothing rather than dividing by a height it has not got", () => {
    expect(fitPercent({ sizePx: 0, sizePercent: 0, hidden: 200 })).toBeNull()
  })
})
