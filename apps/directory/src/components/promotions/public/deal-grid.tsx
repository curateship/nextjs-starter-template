import { Link } from "@tanstack/react-router"

import { ImageIcon } from "lucide-react"

import type { DealCardView } from "@/lib/promotions/deal-content"
import { formatDirectoryDistance } from "@/lib/directory/public-search"
import { shownHeadline } from "@/lib/promotions/deal-headline"
import { focusRing } from "@/lib/layout/focus-ring"
import { publicGridColumnsClassName } from "@/lib/layout/grid-columns"
import { mediaImageSrcSet } from "@/lib/media/image-sizes"
import { pageGutter } from "@/lib/layout/shell-gutter"
import { cn } from "@/lib/utils"

/**
 * One group of cards on the Deals page, as Tyler drew it on 25 Nov 2026: a
 * photo with no frame around the card, and the words under it.
 *
 * Top to bottom: **the photo**, with a tag saying "Ending soon", "On now" or
 * "Starting soon" at its corner; **the headline** in small grey capitals,
 * "2 FOR 1"; **the deal's name** in the heading font; **where**, the place,
 * its part of town and what it is filed under; and **when**, the next time
 * it opens and its days, "Next: Tue, 11 AM · No end date".
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
        publicGridColumnsClassName(columns, "sm:grid-cols-2 md:grid-cols-3")
      )}
      // The site's own gutter from Settings → Styling across, and a little
      // more down, because a card has no frame to end it and a row's last
      // line otherwise runs into the next row's photo.
      style={{ columnGap: pageGutter, rowGap: `calc(${pageGutter} + 1rem)` }}
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
  // The place, the part of town it is in, what it is filed under and how far
  // away it is, as one line of middle dots. Each part is left out when the
  // page did not ask for it.
  const place = [
    deal.listingTitle,
    deal.neighbourhood?.name,
    deal.category?.name,
    deal.distanceKm === undefined
      ? undefined
      : formatDirectoryDistance(deal.distanceKm),
  ].filter(Boolean)
  // When it next opens, then its days: "Next: Tue, 11 AM · No end date".
  const when = [
    deal.nextLine ? `${deal.nextLine.label}: ${deal.nextLine.text}` : null,
    deal.daysText,
  ].filter(Boolean)

  return (
    <article className="group relative flex w-full flex-col">
      {/* Every card has the same box, so a row lines its titles up. With no
          photo of the deal's or the place's own, the box stays empty grey
          with a faint picture sign rather than collapsing. */}
      <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-muted">
        {photo ? (
          <img
            src={photo}
            srcSet={mediaImageSrcSet(photo)}
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            // The listing's photo stands in when the deal has none of its own.
            alt={deal.coverImage ? deal.title : deal.listingTitle}
            loading="lazy"
            className="size-full object-cover"
          />
        ) : (
          <ImageIcon
            aria-hidden="true"
            className="absolute top-1/2 left-1/2 size-8 -translate-1/2 text-muted-foreground/50"
          />
        )}
        {deal.badge ? (
          <DealBadge badge={deal.badge} className="absolute top-3 left-3" />
        ) : null}
      </div>

      {headline ? (
        <p className="mt-4 text-xs font-semibold tracking-widest text-muted-foreground uppercase wrap-anywhere">
          {headline}
        </p>
      ) : null}
      <h3 className="mt-1 font-heading text-2xl leading-snug wrap-anywhere">
        {/* The whole card is the link, the same as a post card. */}
        <Link
          to="/deals/$slug"
          params={{ slug: deal.slug }}
          className={`rounded-sm after:absolute after:inset-0 group-hover:underline ${focusRing}`}
        >
          {deal.title}
        </Link>
      </h3>
      {place.length ? (
        <p className="mt-1 text-sm text-muted-foreground">{place.join(" · ")}</p>
      ) : null}
      {when.length ? <p className="mt-2 text-sm wrap-anywhere">{when.join(" · ")}</p> : null}
    </article>
  )
}

/**
 * Where the deal stands, in two words and a dot. The dot is decoration and the
 * words carry the meaning, so nothing here is said in colour alone.
 */
function DealBadge({
  badge,
  className,
}: {
  badge: NonNullable<DealCardView["badge"]>
  className?: string
}) {
  return (
    <span
      className={cn(
        // `background` rather than white, so a tag over a photo keeps its
        // contrast in dark mode instead of staying a white blob.
        "flex shrink-0 items-center gap-1.5 rounded-full bg-background px-2.5 py-1 text-xs font-medium text-foreground",
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
