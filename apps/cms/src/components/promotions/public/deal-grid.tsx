import { Link } from "@tanstack/react-router"

import { Card, CardContent } from "@/components/ui/card"
import type { DealCardView } from "@/lib/promotions/deal-content"
import { formatDirectoryDistance } from "@/lib/directory/public-search"
import { shownHeadline } from "@/lib/promotions/deal-headline"
import { focusRing } from "@/lib/layout/focus-ring"

/**
 * One group of cards on the Deals page. Each card shows the deal's cover, or
 * the listing's own photo when the deal has none, then the headline in big
 * type, the deal's title, the listing's name and where it stands today, like
 * "Until Sun, Oct 12", and "On now · until 6 PM" or "Next: today at 4 PM".
 * A long headline wraps inside the card rather than pushing it wider.
 *
 * Every line comes worked out from the server, by the site's clock, so the
 * server and the browser print the same words and the page never redraws
 * itself after loading.
 */
export function DealGrid({ deals }: { deals: DealCardView[] }) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2 md:gap-3 lg:grid-cols-3">
      {deals.map((deal) => {
        const photo = deal.coverImage || deal.listingImage
        return (
          <li key={deal.id} className="flex">
            <Card className="group/card relative w-full transition-colors hover:bg-accent/40">
              {photo ? (
                <img
                  src={photo}
                  alt=""
                  loading="lazy"
                  className="aspect-[3/2] w-full object-cover transition-opacity duration-200 group-hover/card:opacity-75"
                />
              ) : null}
              <CardContent className="grid gap-1">
                <p className="text-2xl leading-tight font-semibold wrap-anywhere">
                  {shownHeadline(deal.headline)}
                </p>
                <h3 className="text-base leading-snug font-medium">
                  {/* The whole card is the link, the same as a post card. */}
                  <Link
                    to="/deals/$slug"
                    params={{ slug: deal.slug }}
                    className={`after:absolute after:inset-0 ${focusRing}`}
                  >
                    {deal.title}
                  </Link>
                </h3>
                <p className="truncate text-xs text-muted-foreground">
                  {deal.listingTitle}
                </p>
                <p className="text-sm text-muted-foreground">
                  {deal.daysText}
                </p>
                {deal.nowText ? (
                  <p className="text-sm font-medium">{deal.nowText}</p>
                ) : null}
                {deal.distanceKm !== undefined ? (
                  <p className="text-xs text-muted-foreground">
                    {formatDirectoryDistance(deal.distanceKm)}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          </li>
        )
      })}
    </ul>
  )
}
