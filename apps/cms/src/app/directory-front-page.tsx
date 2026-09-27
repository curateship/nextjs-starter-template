import * as React from "react"
import { Link, useNavigate } from "@tanstack/react-router"

import { CategoryGrid } from "@/components/directory/public/category-grid"
import { DirectoryFrame } from "@/components/directory/public/directory-frame"
import { ListingGrid } from "@/components/directory/public/listing-grid"
import { ListingMap } from "@/components/directory/public/listing-map"
import { EventCardGrid } from "@/components/events/public/event-card"
import { PostGrid } from "@/components/posts/public/post-grid"
import { DealGrid } from "@/components/promotions/public/deal-grid"
import { FrontPageHero } from "@/components/marketing/front-page-content-blocks"
import { publicContentAlignmentRowClassName } from "@/components/shell/public-content-alignment"
import { PricingTable } from "@/components/shared/pricing-table"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { PlanOption } from "@/lib/api/billing/billing"
import type { BillingInterval } from "@/lib/billing/pricing-choice"
import type {
  DirectoryFrontPageRow,
  DirectoryFrontPageView,
} from "@/lib/directory/front-page"

/**
 * A site's home page: the rows it chose, and nothing above them.
 *
 * The page drew the Browse page's title and introduction over the rows until
 * 27 Sep 2026. It does not any more, on Tyler's call: the first row is the top
 * of the page, so a hero is the first thing a visitor reads. Those two settings
 * still title the browser tab and describe the page to search engines, because
 * a page needs both and the rows are not a description of themselves.
 *
 * Every row here has something in it — a row that matched nothing is dropped on
 * the server, so there is no heading over an empty space and no "there are no
 * listings yet" inside a row somebody deliberately configured.
 *
 * A page with no rows at all never reaches this component: the loader answers
 * "not mine" and the platform's own front page draws instead.
 */
export function DirectoryFrontPage({ data }: { data: DirectoryFrontPageView }) {
  const navigate = useNavigate()
  const [interval, setInterval] = React.useState<BillingInterval>("monthly")

  // Picking a plan never checks out from here, the same as on the platform's own
  // front page: a visitor has no account to bill yet, and a member's own plan
  // lives on /pricing.
  const selectPlan = React.useCallback(
    (plan: PlanOption, chosen: BillingInterval) => {
      void navigate({
        to: data.signedIn ? "/pricing" : "/register",
        search: { plan: plan.slug, interval: chosen },
      })
    },
    [data.signedIn, navigate]
  )

  return (
    <DirectoryFrame>
      <section className="grid gap-4 md:gap-6" aria-label={data.heading}>
        {data.rows.map((row, index) => (
          <FrontPageRow
            key={row.id}
            row={row}
            // The first row's heading is the page's one h1, the way the
            // platform's own front page does it. Nothing above it holds that
            // job any more.
            headingLevel={index === 0 ? "h1" : "h2"}
            mapApiKey={data.mapApiKey}
            plans={data.plans}
            trialUsed={data.trialUsed}
            interval={interval}
            onIntervalChange={setInterval}
            onSelectPlan={selectPlan}
          />
        ))}
      </section>
    </DirectoryFrame>
  )
}

function FrontPageRow({
  row,
  headingLevel,
  mapApiKey,
  plans,
  trialUsed,
  interval,
  onIntervalChange,
  onSelectPlan,
}: {
  row: DirectoryFrontPageRow
  headingLevel: "h1" | "h2"
  mapApiKey: string | null
  plans: PlanOption[]
  trialUsed: boolean
  interval: BillingInterval
  onIntervalChange: (interval: BillingInterval) => void
  onSelectPlan: (plan: PlanOption, interval: BillingInterval) => void
}) {
  const headingId = `front-page-row-${row.id}`
  const Heading = headingLevel

  // A hero draws its own heading, at its own size and beside the picture, so it
  // is the one row that is not a heading above some content.
  if (row.kind === "hero") {
    return (
      <section
        className={cn(
          "grid gap-2 md:gap-3",
          alignment(row.centred),
          // A hero's words cap themselves at 768px, so a centred one has to be
          // brought to the middle. Only a hero: an automatic side margin stops
          // a grid child stretching, which would shrink a row of cards around
          // its cards and re-column them.
          row.centred && "[&>*]:mx-auto"
        )}
      >
        <FrontPageHero
          heading={row.heading}
          intro={row.intro}
          action={row.hero.action}
          image={row.hero.image}
          alt={row.hero.alt}
          buttonLabel={row.hero.buttonLabel}
          buttonHref={row.hero.buttonHref}
          note={row.hero.note}
          stars={row.hero.stars}
          headingLevel={headingLevel}
        />
      </section>
    )
  }

  return (
    <section
      className={cn("grid gap-2 md:gap-3", alignment(row.centred))}
      aria-labelledby={headingId}
    >
      <div className="grid gap-1">
        <Heading
          id={headingId}
          className={
            headingLevel === "h1"
              ? "text-2xl font-semibold tracking-tight"
              : "text-lg font-semibold tracking-tight"
          }
        >
          {row.heading}
        </Heading>
        {row.intro ? (
          <p className="max-w-3xl text-sm text-muted-foreground">{row.intro}</p>
        ) : null}
        {row.kind === "events" ? (
          <p className="text-sm text-muted-foreground">
            All times are {row.zone}.
          </p>
        ) : null}
      </div>

      {row.kind === "plans" ? (
        <PricingTable
          plans={plans}
          interval={interval}
          onIntervalChange={onIntervalChange}
          onSelect={onSelectPlan}
          trialUsed={trialUsed}
          actionLabel="Get started"
        />
      ) : row.kind === "categories" ? (
        // No "see them all" under a row of categories: every card is already a
        // way in, and the one below a row of listings exists because a row shows
        // a handful of many.
        <CategoryGrid categories={row.cards} />
      ) : row.kind === "events" ? (
        <>
          <EventCardGrid
            // Only events still to come reach a row, so none is marked over.
            events={row.events.map((event) => ({ ...event, ended: false }))}
            // Never seen: a row with nothing coming up is dropped on the
            // server. Said anyway because the list asks for it.
            emptyMessage="Nothing is coming up yet."
          />
          <div className={cn("flex", publicContentAlignmentRowClassName)}>
            <Button asChild variant="outline">
              <Link
                to="/events"
                search={row.categorySlug ? { category: row.categorySlug } : {}}
                preload="intent"
              >
                See all events
              </Link>
            </Button>
          </div>
        </>
      ) : row.kind === "posts" ? (
        <>
          {/* Never empty: a row with no post is dropped on the server. */}
          <PostGrid
            posts={row.posts}
            siteName={row.siteName}
            emptyMessage="Nothing has been posted yet."
          />
          <div className={cn("flex", publicContentAlignmentRowClassName)}>
            <Button asChild variant="outline">
              <Link to="/posts" preload="intent">
                See all posts
              </Link>
            </Button>
          </div>
        </>
      ) : row.kind === "deals" ? (
        <>
          {/* Never empty: a row with no live deal is dropped on the server. */}
          <DealGrid deals={row.deals} />
          <div className={cn("flex", publicContentAlignmentRowClassName)}>
            <Button asChild variant="outline">
              <Link
                to="/deals"
                search={row.categorySlug ? { category: row.categorySlug } : {}}
                preload="intent"
              >
                See all deals
              </Link>
            </Button>
          </div>
        </>
      ) : (
        <ListingsRowBody row={row} mapApiKey={mapApiKey} />
      )}
    </section>
  )
}

/**
 * What a row's own alignment is.
 *
 * The text is straightforward. The rows that align themselves rather than their
 * text — a hero's button, its stars, a "See them all" — are not, and the last
 * line is why. They carry the shell's three
 * `group-data-[content-alignment=…]/public-content:justify-…` classes, and a
 * group class matches **any** ancestor rather than the nearest one. The page's
 * column says left and a centred row says centre, so both rules match and
 * `justify-start` wins on order, whatever the row asked for. Declaring a nearer
 * group does not fix that. So a centred row names those elements by the class
 * they carry and overrules them outright.
 */
function alignment(centred: boolean) {
  return centred
    ? "text-center [&_[class*='public-content:justify-start']]:justify-center!"
    : "text-left"
}

function ListingsRowBody({
  row,
  mapApiKey,
}: {
  row: Extract<DirectoryFrontPageRow, { kind: "listings" }>
  mapApiKey: string | null
}) {
  // A map row's listings always carry both numbers — the server refuses one
  // that does not — but the pins are counted rather than assumed. The map's
  // "showing 12 of 40" line compares these two, and on a home page row there is
  // nothing to narrow down, so the two must never differ.
  const pins =
    row.layout === "map"
      ? row.listings.flatMap((listing) =>
          listing.latitude === undefined || listing.longitude === undefined
            ? []
            : [
                {
                  ...listing,
                  latitude: listing.latitude,
                  longitude: listing.longitude,
                },
              ]
        )
      : []

  return (
    <>
      {row.layout === "map" && mapApiKey ? (
        // The row's own limit is the only cap here, and it is the number the
        // site chose, so `total` matching the pin count is what says "nothing
        // is missing" and keeps the map's cap line off a home page.
        <ListingMap apiKey={mapApiKey} pins={pins} total={pins.length} />
      ) : (
        <ListingGrid
          listings={row.listings}
          layout={row.layout === "list" ? "list" : "grid"}
          // Never seen: an empty row is dropped on the server. Said anyway
          // because the grid asks for it.
          emptyMessage="There are no listings to show yet."
        />
      )}

      <div className={cn("flex", publicContentAlignmentRowClassName)}>
        <Button asChild variant="outline">
          <Link to="/directory" search={row.browse} preload="intent">
            See them all
          </Link>
        </Button>
      </div>
    </>
  )
}
