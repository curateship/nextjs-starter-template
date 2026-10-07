import { describe, expect, it } from "vitest"

import {
  formatClockIn,
  formatLongDay,
  formatShortDay,
  localDateIn,
} from "./calendar-day"

describe("calendar-day", () => {
  it("writes a local date the same way wherever the browser is", () => {
    expect(formatLongDay("2026-10-06")).toBe("Tue, Oct 6, 2026")
    expect(formatShortDay("2026-10-06")).toBe("Oct 6")
  })

  it("files a moment under the day the account's timezone calls it", () => {
    // 11:30am UTC on 6 Oct is 12:30am on 7 Oct in Auckland.
    const moment = "2026-10-06T11:30:00Z"
    expect(localDateIn("UTC", moment)).toBe("2026-10-06")
    expect(localDateIn("Pacific/Auckland", moment)).toBe("2026-10-07")
    expect(formatClockIn("Pacific/Auckland", moment)).toBe("12:30 AM")
  })
})
