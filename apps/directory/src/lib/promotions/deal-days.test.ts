import { describe, expect, it } from "vitest"

import {
  dealAdminDaysText,
  dealCardDaysText,
  dealDaysText,
} from "@/lib/promotions/deal-days"

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
      dealCardDaysText({ startDate: "2026-10-01", endDate: "2026-10-12" }, "on", today)
    ).toBe("Until Mon, Oct 12")
    expect(
      dealCardDaysText({ startDate: "2026-10-01", endDate: today }, "on", today)
    ).toBe("Today only")
    expect(
      dealCardDaysText({ startDate: "2026-10-01", endDate: null }, "on", today)
    ).toBe("No end date")
    expect(
      dealCardDaysText({ startDate: "2026-10-09", endDate: "2026-10-12" }, "soon", today)
    ).toBe("Starts Fri, Oct 9 · until Mon, Oct 12")
    expect(
      dealCardDaysText({ startDate: "2026-10-09", endDate: null }, "soon", today)
    ).toBe("Starts Fri, Oct 9")
    expect(
      dealCardDaysText({ startDate: "2026-10-01", endDate: "2026-10-04" }, "ended", today)
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
