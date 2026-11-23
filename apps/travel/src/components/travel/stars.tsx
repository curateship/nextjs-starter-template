import { StarIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * The one star colour, filled, for every rating in Travel: the pickers in Rate
 * the trip and How was it, and every rating shown (Travel polish part 18).
 * A pinned note's pin is the same yellow, on the trip page and on the Trips
 * dashboard (part 23; Tyler, 12 Nov 2026, picked the trip page's yellow). The
 * theme has no star shade of its own, so it is named once, here.
 */
export const STAR_ON = "fill-amber-400 text-amber-500"

/** What a rating with no stars says, everywhere. */
export const NOT_RATED = "Not rated"

/** "★ 4.5" for a rating, or "Not rated", as one line a screen reader reads as "Rated 4.5 out of 5". */
export function RatingValue({ rating, className }: { rating: number | null; className?: string }) {
  if (rating === null) return <span className={cn("text-muted-foreground", className)}>{NOT_RATED}</span>
  const shown = rating.toLocaleString(undefined, { maximumFractionDigits: 1 })
  return (
    <span className={cn("inline-flex items-center gap-1 tabular-nums", className)} aria-label={`Rated ${shown} out of 5`}>
      <StarIcon className={cn("size-3.5", STAR_ON)} aria-hidden />
      <span aria-hidden>{shown}</span>
    </span>
  )
}

/** A whole number of stars in a row, as a card and a map pin show them. */
export function StarRow({ rating, className }: { rating: number; className?: string }) {
  return (
    <span className={cn("flex items-center gap-0.5", className)} aria-label={`Rated ${rating} out of 5`}>
      {Array.from({ length: rating }, (_, index) => (
        <StarIcon key={index} className={cn("size-3", STAR_ON)} aria-hidden />
      ))}
    </span>
  )
}
