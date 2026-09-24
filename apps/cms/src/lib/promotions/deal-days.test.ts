import { describe, expect, it } from "vitest"

import {
  dealAdminDaysText,
  dealCardDaysText,
  dealDaysText,
  dealStage,
  siteToday,
} from "@/lib/promotions/deal-days"

describe("dealStage", () => {
  const runs = { startDate: "2026-10-03", endDate: "2026-10-12" }

  it("is on from the first day through the whole of the last", () => {
    expect(dealStage(runs, "2026-10-02")).toBe("soon")
    expect(dealStage(runs, "2026-10-03")).toBe("on")
    expect(dealStage(runs, "2026-10-12")).toBe("on")
    expect(dealStage(runs, "2026-10-13")).toBe("ended")
  })

  it("never ends with no end day", () => {
    expect(
      dealStage({ startDate: "2026-10-03", endDate: null }, "2030-01-01")
    ).toBe("on")
  })
})

describe("siteToday", () => {
  it("is the site's day, not the server's", () => {
    // 1:30am on 13 Oct in London is still 12 Oct in Toronto.
    const at = new Date("2026-10-13T00:30:00Z")
    expect(siteToday("America/Toronto", at)).toBe("2026-10-12")
    expect(siteToday("Europe/London", at)).toBe("2026-10-13")
  })
})

describe("the words for a deal's days", () => {
  it("say every shape on the deal page", () => {
    expect(dealDaysText({ startDate: "2026-10-03", endDate: null })).toBe(
      "From Oct 3, 2026. No end date"
    )
    expect(
      dealDaysText({ startDate: "2026-10-03", endDate: "2026-10-03" })
    ).toBe("Saturday, October 3, 2026 only")
    expect(
      dealDaysText({ startDate: "2026-10-03", endDate: "2026-10-12" })
    ).toBe("Oct 3, 2026 to Oct 12, 2026")
  })

  it("say where a card stands today", () => {
    const today = "2026-10-05"
    expect(
      dealCardDaysText({ startDate: "2026-10-01", endDate: "2026-10-12" }, today)
    ).toBe("Until Mon, Oct 12")
    expect(
      dealCardDaysText({ startDate: "2026-10-01", endDate: today }, today)
    ).toBe("Today only")
    expect(
      dealCardDaysText({ startDate: "2026-10-01", endDate: null }, today)
    ).toBe("No end date")
    expect(
      dealCardDaysText({ startDate: "2026-10-09", endDate: "2026-10-12" }, today)
    ).toBe("Starts Fri, Oct 9 · until Mon, Oct 12")
    expect(
      dealCardDaysText({ startDate: "2026-10-09", endDate: null }, today)
    ).toBe("Starts Fri, Oct 9")
    expect(
      dealCardDaysText({ startDate: "2026-10-01", endDate: "2026-10-04" }, today)
    ).toBe("Ended Sun, Oct 4")
  })

  it("say the admin's row", () => {
    expect(
      dealAdminDaysText({ startDate: "2026-10-03", endDate: "2026-10-12" })
    ).toBe("Oct 3, 2026 to Oct 12, 2026")
    expect(dealAdminDaysText({ startDate: "2026-10-03", endDate: null })).toBe(
      "From Oct 3, 2026"
    )
  })
})
