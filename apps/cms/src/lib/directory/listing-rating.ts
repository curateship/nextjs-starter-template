export const LISTING_RATING_ERROR =
  "Rating must be a number from 0 to 5 with no more than one decimal place."

export function isListingRating(value: number): boolean {
  return (
    Number.isFinite(value) && value >= 0 && value <= 5 && (value * 10) % 1 === 0
  )
}

export function listingRatingFromText(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (!/^(?:\d+(?:\.\d)?|\.\d)$/.test(trimmed)) {
    throw new Error(LISTING_RATING_ERROR)
  }
  const rating = Number(trimmed)
  if (!isListingRating(rating)) throw new Error(LISTING_RATING_ERROR)
  return rating
}
