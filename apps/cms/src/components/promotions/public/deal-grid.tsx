import { Link } from "@tanstack/react-router"

import { Card, CardContent } from "@/components/ui/card"
import type { PublicDealCard } from "@/lib/api/promotions/public"
import { dealCardDaysText } from "@/lib/promotions/deal-days"
import { focusRing } from "@/lib/layout/focus-ring"

/**
 * One group of cards on the Deals page. Each card shows the deal's cover, or
 * the listing's own photo when the deal has none, then the listing's name, the
 * deal's title and where it stands today, like "Until Sun, Oct 12".
 *
 * `today` is the site's, from the server, so the server and the browser print
 * the same words and the page never redraws itself after loading.
 */
export function DealGrid({
  deals,
  today,
}: {
  deals: PublicDealCard[]
  today: string
}) {
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
                <p className="truncate text-xs text-muted-foreground">
                  {deal.listingTitle}
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
                <p className="text-sm text-muted-foreground">
                  {dealCardDaysText(deal, today)}
                </p>
              </CardContent>
            </Card>
          </li>
        )
      })}
    </ul>
  )
}
