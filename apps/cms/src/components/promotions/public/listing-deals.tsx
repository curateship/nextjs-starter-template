import { Link } from "@tanstack/react-router"

import { Card, CardContent } from "@/components/ui/card"
import type { ListedDeal } from "@/lib/api/promotions/public"
import { focusRing } from "@/lib/layout/focus-ring"
import { shownHeadline } from "@/lib/promotions/deal-headline"

/**
 * "Deals here": a listing's live deals, up to three, above its "What's on
 * here". Left out entirely when there are none, so a listing with no deal has
 * no empty box and no heading.
 *
 * Rows rather than cards, the same as the events box, with the headline in
 * bold where the events box has its date.
 */
export function ListingDealsBox({ deals }: { deals: ListedDeal[] | null }) {
  if (!deals?.length) return null
  return (
    <Card>
      <CardContent>
        <h2 className="text-lg font-semibold">Deals here</h2>
      </CardContent>
      <ul className="divide-y border-t">
        {deals.map((deal) => (
          <li
            key={deal.id}
            className="relative grid gap-0.5 px-4 py-3 transition-colors hover:bg-accent/40"
          >
            <p className="text-base leading-tight font-semibold wrap-anywhere">
              {shownHeadline(deal.headline)}
            </p>
            <h3 className="text-sm font-medium">
              {/* The whole row is the link, the same as an event row. */}
              <Link
                to="/deals/$slug"
                params={{ slug: deal.slug }}
                className={`after:absolute after:inset-0 ${focusRing}`}
              >
                {deal.title}
              </Link>
            </h3>
            <p className="text-sm text-muted-foreground">
              {deal.nowText ?? deal.daysText}
            </p>
          </li>
        ))}
      </ul>
    </Card>
  )
}
