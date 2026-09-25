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
