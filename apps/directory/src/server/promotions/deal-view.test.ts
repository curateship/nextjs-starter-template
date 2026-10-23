import { describe, expect, it } from "vitest"

import { blankListingHours } from "@/lib/directory/listing-details"
import { listedDealsAt } from "@/server/promotions/deal-view"
import type { PublicDealCard } from "@/server/promotions/public"

/**
 * The tag over a card's photo. "Today" is Tuesday 6 October 2026, so a deal
 * ending on the 8th is inside the three days "Ending soon" covers and one
 * ending on the 9th is not.
 */

function card(fields: Partial<PublicDealCard>): PublicDealCard {
  return {
    id: "1",
    title: "Lunch",
    headline: "20% off",
    slug: "lunch",
    coverImage: "",
    listingTitle: "12 Tables",
    listingImage: "",
    startDate: "2026-10-01",
    endDate: null,
    times: blankListingHours(),
    ...fields,
  }
}

const now = "2026-10-06T12:00"

describe("the tag over a deal card's photo", () => {
  it("says Ending soon on its last day and for the two days before it", () => {
    expect(listedDealsAt([card({ endDate: "2026-10-08" })], now)[0]?.badge).toEqual({
      tone: "ending",
      text: "Ending soon",
    })
  })

  it("says On now for a deal running this minute that is not ending", () => {
    expect(listedDealsAt([card({ endDate: "2026-10-09" })], now)[0]?.badge).toEqual({
      tone: "now",
      text: "On now",
    })
  })

  it("says Starting soon before the first day, even when it ends that same day", () => {
    expect(
      listedDealsAt([card({ startDate: "2026-10-20" })], now)[0]?.badge
    ).toEqual({ tone: "soon", text: "Starting soon" })
    expect(
      listedDealsAt(
        [card({ startDate: "2026-10-07", endDate: "2026-10-07" })],
        now
      )[0]?.badge
    ).toEqual({ tone: "soon", text: "Starting soon" })
  })

  it("is left off a deal that is on today but shut at this hour", () => {
    const evening = blankListingHours()
    evening.tuesday = { open: "18:00", close: "22:00" }
    const listed = listedDealsAt(
      [card({ endDate: "2026-10-20", times: evening })],
      now
    )[0]
    expect(listed?.badge).toBeNull()
    expect(listed?.nextLine).toEqual({ label: "Next", text: "Today, 6 PM" })
  })
})
