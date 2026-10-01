import { Link } from "@tanstack/react-router"

import { CategoryPill } from "@/components/shared/card-chips"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import type { DealCardView } from "@/lib/promotions/deal-content"
import { formatDirectoryDistance } from "@/lib/directory/public-search"
import { shownHeadline } from "@/lib/promotions/deal-headline"
import { focusRing } from "@/lib/layout/focus-ring"
import { publicCardHover } from "@/lib/layout/card-hover"
import { publicGridColumnsClassName } from "@/lib/layout/grid-columns"
import { mediaImageSrcSet } from "@/lib/media/image-sizes"
import { pageGutter } from "@/lib/layout/shell-gutter"
import { cn } from "@/lib/utils"

/**
 * One group of cards on the Deals page.
 *
 * A card is read in three passes, which is the order it is built in. **The
 * photo** carries what the deal is worth and where it stands: the place's
 * category, a tag saying "Ending soon", "On now" or "Starting soon", and the
 * headline in a dark pill. **The middle** is the deal's own name and the place
 * running it. **The foot** is two cells, the days on the left and the next
 * time it opens on the right, each under a small grey label, so a visitor can
 * read down a row of cards and compare the same thing in the same place.
 *
 * Every line comes worked out from the server, by the site's clock, so the
 * server and the browser print the same words and the page never redraws
 * itself after loading.
 *
 * The same card draws a home page row and a category page's deals. Those ask
 * for less, so the category, the neighbourhood and the tag are missing rather
 * than empty, and the card leaves out whatever it was not given.
 */
export function DealGrid({
  deals,
  columns,
}: {
  deals: DealCardView[]
  /** A home page row's own column count. The Deals page names none. */
  columns?: number
}) {
  return (
    <ul
      // `w-full` because a home page row lines its children up from the left,
      // so a grid that did not ask for it stopped short of its own heading.
      className={cn(
        "grid w-full",
        publicGridColumnsClassName(columns, "sm:grid-cols-2 lg:grid-cols-3")
      )}
      style={{ gap: pageGutter }}
    >
      {deals.map((deal) => (
        // `flex` and `h-full` so a row of cards shares one bottom edge: the
        // feet hold the same two labels, and a ragged row of them reads as a
        // mistake rather than as a design.
        <li key={deal.id} className="flex">
          <DealCard deal={deal} />
        </li>
      ))}
    </ul>
  )
}

function DealCard({ deal }: { deal: DealCardView }) {
  const photo = deal.coverImage || deal.listingImage
  const headline = shownHeadline(deal.headline)
  // The place, the part of town it is in, and how far away it is, as one line
  // of middle dots. Each part is left out when the page did not ask for it.
  const place = [
    deal.listingTitle,
    deal.neighbourhood?.name,
    deal.distanceKm === undefined
      ? undefined
      : formatDirectoryDistance(deal.distanceKm),
  ].filter(Boolean)
  // With no photo there is nowhere to hang the pills, so they move into a row
  // above the title rather than vanishing.
  const chipsOnPhoto = Boolean(photo)

  return (
    <Card
      className={cn(
        `relative w-full ${publicCardHover}`,
        // The card only drops its top padding for a bare `<img>` first child,
        // and the overlays need a box to sit in, so the photo says so itself.
        photo && "pt-0"
      )}
    >
      {photo ? (
        <div className="relative overflow-hidden">
          <img
            src={photo}
            srcSet={mediaImageSrcSet(photo)}
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            alt=""
            loading="lazy"
            className="aspect-[3/2] w-full object-cover"
          />
          {/* Inset by the card's own content padding, so the pill's left edge
              lines up with the title under it and the tag's right edge with
              the end of the foot. */}
          <div className="absolute inset-x-4 top-4 flex items-start justify-between gap-2">
            {deal.category ? <CategoryPill name={deal.category.name} /> : <span />}
            {deal.badge ? <DealBadge badge={deal.badge} /> : null}
          </div>
          <HeadlinePill
            headline={headline}
            className="absolute bottom-4 left-4 max-w-[calc(100%-2rem)]"
          />
        </div>
      ) : null}

      <CardContent className="grid gap-1">
        {chipsOnPhoto ? null : (
          <div className="flex flex-wrap items-center gap-2 pb-1">
            <HeadlinePill headline={headline} />
            {deal.category ? (
              <CategoryPill name={deal.category.name} tone="plain" />
            ) : null}
            {deal.badge ? <DealBadge badge={deal.badge} tone="plain" /> : null}
          </div>
        )}
        <h3 className="text-xl leading-snug font-semibold wrap-anywhere">
          {/* The whole card is the link, the same as a post card. */}
          <Link
            to="/deals/$slug"
            params={{ slug: deal.slug }}
            className={`after:absolute after:inset-0 ${focusRing}`}
          >
            {deal.title}
          </Link>
        </h3>
        {place.length ? (
          <p className="text-sm text-muted-foreground">{place.join(" · ")}</p>
        ) : null}
      </CardContent>

      {/* The foot is pushed to the bottom, so two cards side by side put their
          days on one line whatever the titles above them did. */}
      <CardFooter className="mt-auto items-stretch bg-transparent p-0">
        <FootCell label="Valid" value={deal.daysText} />
        {deal.nextLine ? (
          <FootCell
            label={deal.nextLine.label}
            value={deal.nextLine.text}
            className="border-l"
          />
        ) : null}
      </CardFooter>
    </Card>
  )
}

/** The deal's worth, in the one place a visitor's eye lands first. */
function HeadlinePill({
  headline,
  className,
}: {
  headline: string
  className?: string
}) {
  return (
    <span
      className={cn(
        "block truncate rounded-lg bg-foreground px-3 py-1.5 text-lg font-semibold text-background",
        className
      )}
    >
      {headline}
    </span>
  )
}

/**
 * Where the deal stands, in two words and a dot. The dot is decoration and the
 * words carry the meaning, so nothing here is said in colour alone.
 */
function DealBadge({
  badge,
  tone = "overlay",
  className,
}: {
  badge: NonNullable<DealCardView["badge"]>
  tone?: "overlay" | "plain"
  className?: string
}) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-foreground",
        // `background` rather than white, so a tag over a photo keeps its
        // contrast in dark mode instead of staying a white blob.
        tone === "overlay" ? "bg-background" : "bg-muted",
        className
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          badge.tone === "ending"
            ? "bg-amber-500 dark:bg-amber-400"
            : badge.tone === "now"
              ? "bg-emerald-500 dark:bg-emerald-400"
              : "bg-muted-foreground"
        )}
      />
      {badge.text}
    </span>
  )
}

/** One half of the foot: a small grey label with the words under it. */
function FootCell({
  label,
  value,
  className,
}: {
  label: string
  value: string
  className?: string
}) {
  return (
    <div className={cn("min-w-0 flex-1 px-4 py-3", className)}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium wrap-anywhere">{value}</p>
    </div>
  )
}
