import { describe, expect, it } from "vitest"

import { ORDER_GONE_AFTER_MS, judgeOrder } from "@/lib/trade/order-presence"

/**
 * The rule that decides whether a placed order still stands.
 *
 * Every case here is taken from what a real exchange did on 20 Aug 2026,
 * because the expensive mistake was believing one absent read.
 */

const NOW = 1_787_251_000_000

describe("judging whether an order is still out there", () => {
  it("calls it resting while the exchange lists it", () => {
    expect(
      judgeOrder({
        seenOnTheBook: true,
        accountShowsItDone: false,
        missingSince: 0,
        now: NOW,
      })
    ).toEqual({ presence: "resting", missingSince: 0 })
  })

  it("does not call an order gone the first time it is missing", () => {
    // This is the whole bug. KuCoin listed a freshly placed order a second or
    // two late; the watch read that gap as "my order is gone" and placed
    // another, six times in eighteen seconds.
    const seen = judgeOrder({
      seenOnTheBook: false,
      accountShowsItDone: false,
      missingSince: 0,
      now: NOW,
    })
    expect(seen.presence).toBe("unproven")
    expect(seen.missingSince).toBe(NOW)
  })

  it("remembers when it first went missing rather than restarting the clock", () => {
    const first = judgeOrder({
      seenOnTheBook: false,
      accountShowsItDone: false,
      missingSince: 0,
      now: NOW,
    })
    const later = judgeOrder({
      seenOnTheBook: false,
      accountShowsItDone: false,
      missingSince: first.missingSince,
      now: NOW + 5_000,
    })
    expect(later.presence).toBe("unproven")
    expect(later.missingSince).toBe(NOW)
  })

  it("gives up on it once the list cannot still be catching up", () => {
    expect(
      judgeOrder({
        seenOnTheBook: false,
        accountShowsItDone: false,
        missingSince: NOW,
        now: NOW + ORDER_GONE_AFTER_MS,
      })
    ).toEqual({ presence: "gone", missingSince: 0 })
  })

  it("never treats absence alone as proof when another order could sell twice", () => {
    expect(
      judgeOrder({
        seenOnTheBook: false,
        accountShowsItDone: false,
        missingSince: NOW,
        now: NOW + ORDER_GONE_AFTER_MS,
        absenceCanProveGone: false,
      })
    ).toEqual({ presence: "unproven", missingSince: NOW })
  })

  it("takes the account's own answer as proof, without waiting", () => {
    // The position appearing after a buy, or going after a sell. Waiting past
    // that would only delay the stop and target the order was placed to earn.
    expect(
      judgeOrder({
        seenOnTheBook: false,
        accountShowsItDone: true,
        missingSince: 0,
        now: NOW,
      })
    ).toEqual({ presence: "gone", missingSince: 0 })
  })

  it("forgets the absence as soon as the order is listed again", () => {
    expect(
      judgeOrder({
        seenOnTheBook: true,
        accountShowsItDone: false,
        missingSince: NOW - 9_000,
        now: NOW,
      })
    ).toEqual({ presence: "resting", missingSince: 0 })
  })
})
