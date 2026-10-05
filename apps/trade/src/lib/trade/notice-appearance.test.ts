import { describe, expect, it } from "vitest"

import {
  NO_SAVED_NOTICE_ROW,
  tradeNoticeCategory,
  tradeNoticeDetail,
} from "./notice-appearance"
import { MADE_MONEY_SURFACE, WARNING_SURFACE } from "./money-tone"

/** A notice saved with its pieces, the way every notice is saved now. */
const savedFill = {
  href: "/protocols/hyper-liquid?market=hyperliquid%3Amainnet%3AETH",
  headline: "Entered $49.91 of CHIP",
  meta: ["@ 0.04932", "HL1 Grid", "filled"],
  kind: "entered" as const,
  level: "info" as const,
}

const noWords = { message: null, detail: null }

describe("how a trade notice is drawn", () => {
  it("uses the saved pieces", () => {
    expect(tradeNoticeDetail(savedFill, noWords)).toMatchObject({
      href: savedFill.href,
      categoryId: "trades",
      title: "Entered $49.91 of CHIP",
      meta: ["@ 0.04932", "HL1 Grid", "filled"],
      toneClassName: MADE_MONEY_SURFACE,
    })
  })

  it("paints a close that lost money amber, not the green a winner wears", () => {
    expect(
      tradeNoticeDetail({ ...savedFill, level: "warning" }, noWords)
        .toneClassName
    ).toBe(WARNING_SURFACE)
  })

  it("reads an old notice's sentence back when nothing was saved for it", () => {
    const drawn = tradeNoticeDetail(NO_SAVED_NOTICE_ROW, {
      message: "Exited a trade: $250 of USELESS at $0.2402 (HL1 - GRID)",
      detail: "Lost $0.05 on this close.",
    })
    expect(drawn.title).toBe("Exited $250 of USELESS")
    expect(drawn.meta).toEqual(["@ $0.2402", "HL1 - GRID", "lost $0.05"])
    expect(drawn.categoryId).toBe("trades")
    // Amber, worked out from the same words, because the saved level is only
    // trusted when the saved kind is there beside it.
    expect(drawn.toneClassName).toBe(WARNING_SURFACE)
  })

  it("puts a sentence it cannot read under System and leaves it as prose", () => {
    const drawn = tradeNoticeDetail(NO_SAVED_NOTICE_ROW, {
      message: "Flow Morning buy stopped",
      detail: "The wallet was switched off.",
    })
    expect(drawn.title).toBeUndefined()
    expect(drawn.meta).toBeUndefined()
    expect(drawn.body).toBeUndefined()
    expect(drawn.categoryId).toBe("system")
  })

  it("files a notice with no kind at all under System", () => {
    expect(tradeNoticeCategory(null)).toBe("system")
    expect(tradeNoticeCategory("alert")).toBe("alerts")
    expect(tradeNoticeCategory("liquidated")).toBe("trades")
  })
})
