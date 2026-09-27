import { StarIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * The chips a public card draws over its photo.
 *
 * Here rather than in one of the card files because the listing card and the
 * event card both draw the category pill, and a second copy would drift from
 * the first the next time one of them is adjusted.
 *
 * The colours are `background` and `foreground` rather than white and black, so
 * a pill over a photo keeps its contrast in dark mode instead of staying a
 * white blob on a dark card.
 */
export function CategoryPill({
  name,
  tone = "overlay",
  className,
}: {
  name: string
  /**
   * `overlay` sits on a photo and needs the page's own background to stand out
   * against it. `plain` sits on the card itself, where that colour would be
   * the card's colour and the pill would read as loose text.
   */
  tone?: "overlay" | "plain"
  className?: string
}) {
  return (
    <span
      className={cn(
        "truncate rounded-full px-2.5 py-1 text-xs font-medium tracking-wide text-foreground uppercase",
        tone === "overlay" ? "bg-background" : "bg-muted",
        className
      )}
    >
      {name}
    </span>
  )
}

/**
 * The rating over a photo: a star and the number, in a dark pill.
 *
 * It is the only place a card with a photo prints the rating, so it is read out
 * rather than hidden — the star is decoration and the number is the rating, so
 * a screen reader is given the words the star stands for.
 */
export function RatingChip({
  rating,
  className,
}: {
  rating: number
  className?: string
}) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center gap-1 rounded-full bg-foreground px-2.5 py-1 text-xs font-medium text-background",
        className
      )}
    >
      <StarIcon aria-hidden="true" className="size-3 fill-current" />
      <span className="sr-only">Rated </span>
      {rating}
      <span className="sr-only"> out of 5</span>
    </span>
  )
}
