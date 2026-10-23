import { StarHalfIcon, StarIcon } from "lucide-react"

import { cn } from "@/lib/utils"

const MAX_STARS = 5

/** The one star treatment used on listing cards and listing pages. */
export function ListingRating({
  rating,
  className,
}: {
  rating: number | null
  className?: string
}) {
  if (rating === null) return null

  const fullStars = Math.floor(rating)
  const hasHalfStar = rating % 1 >= 0.5
  const emptyStars = MAX_STARS - fullStars - (hasHalfStar ? 1 : 0)

  return (
    <span
      role="img"
      aria-label={`${rating} out of 5`}
      className={cn(
        "flex items-center gap-2 text-sm [&_svg]:size-4",
        className
      )}
    >
      <span aria-hidden="true" className="flex gap-0.5">
        {Array.from({ length: fullStars }, (_, index) => (
          <StarIcon
            key={`rating-star-full-${index}`}
            className="fill-foreground stroke-foreground"
          />
        ))}
        {hasHalfStar ? (
          <span className="relative size-4">
            <StarHalfIcon className="absolute top-0 right-0 fill-foreground stroke-foreground" />
            <StarHalfIcon className="absolute top-0 left-0 -scale-x-100 fill-foreground/15 stroke-foreground/15" />
          </span>
        ) : null}
        {Array.from({ length: emptyStars }, (_, index) => (
          <StarIcon
            key={`rating-star-empty-${index}`}
            className="fill-foreground/15 stroke-foreground/15"
          />
        ))}
      </span>
      <span aria-hidden="true" className="font-medium">
        {rating}
      </span>
    </span>
  )
}
