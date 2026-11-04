import type { Place } from "@/lib/travel/rules"

/**
 * "Google 4.6 (2,300) · $$" on a card whose place came from Google (More
 * Travel features part 1; Tyler: "Rating, reviews, price"). The price is
 * Google's own scale of one to four $, whatever the trip's money, or Free.
 * Null when Google sent none of the three, as on every place saved before
 * 4 Nov 2026 ("New fills only").
 */
export function googleRatingLine(place: Pick<Place, "rating" | "ratingCount" | "priceLevel"> | null) {
  if (!place) return null
  const parts: string[] = []
  if (typeof place.rating === "number") {
    const count = typeof place.ratingCount === "number" ? ` (${place.ratingCount.toLocaleString("en-US")})` : ""
    parts.push(`Google ${place.rating.toFixed(1)}${count}`)
  }
  if (typeof place.priceLevel === "number") parts.push(place.priceLevel === 0 ? "Free" : "$".repeat(place.priceLevel))
  return parts.length ? parts.join(" · ") : null
}
