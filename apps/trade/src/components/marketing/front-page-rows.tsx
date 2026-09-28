import {
  FrontPageFaq,
  FrontPageHero,
  FrontPageLogos,
  FrontPageScreenshots,
  FrontPageTestimonials,
} from "@/components/marketing/front-page-content-blocks"
import { AppFrontPageRow } from "@/components/marketing/app-front-page-row"
import { SavedLink } from "@/components/shell/public-navigation"
import { Button } from "@/components/ui/button"
import {
  publicContentAlignmentGridClassName,
  publicContentAlignmentJustifyClassNames,
  publicContentAlignmentRowClassName,
  publicContentAlignmentSelfClassNames,
} from "@/components/shell/public-content-alignment"
import { PricingTable } from "@/components/shared/pricing-table"
import type { PlanOption } from "@/lib/api/billing/billing"
import type { BillingInterval } from "@/lib/billing/pricing-choice"
import {
  APP_FRONT_PAGE_ROW_KIND,
  type FrontPageRow,
} from "@/lib/pages/front-page"
import { publicDeviceRowClassName } from "@/lib/pages/public-device"
import { cn } from "@/lib/utils"

/**
 * The button an app's row puts beside its heading, when it named one.
 *
 * What an app fills its row with is opaque to the shell — it hands it to the
 * app's own component and never opens it — with this one exception, so the
 * button sits in the shell's header beside the heading rather than each app
 * drawing a heading of its own to hang it on. An app that names none gets a
 * plain heading, which is every row that is not a handful of a longer list.
 */
function frontPageRowAction(
  data: unknown
): { label: string; href: string } | null {
  if (!data || typeof data !== "object") return null
  const action = (data as { action?: unknown }).action
  if (!action || typeof action !== "object") return null
  const { label, href } = action as { label?: unknown; href?: unknown }
  return typeof label === "string" &&
    label.trim() &&
    typeof href === "string" &&
    href.trim()
    ? { label, href }
    : null
}

export function FrontPageRows({
  rows,
  plans,
  trialUsed,
  interval,
  onIntervalChange,
  onSelectPlan,
  appRowData,
}: {
  rows: FrontPageRow[]
  plans: PlanOption[]
  trialUsed: boolean
  interval: BillingInterval
  onIntervalChange: (interval: BillingInterval) => void
  onSelectPlan: (plan: PlanOption, interval: BillingInterval) => void
  /**
   * What the app's own reader filled for each of its rows, by row id. A page
   * drawn without asking the app — a preview, or an app with no such rows —
   * passes none, and every app row is handed `null`.
   */
  appRowData?: Record<string, unknown>
}) {
  return (
    <div
      // The gap between rows is set in theme.css, so flat mode can collapse it
      // and a phone and a desktop can have different ones.
      className={cn("grid w-full", publicContentAlignmentGridClassName)}
      data-front-page-rows=""
    >
      {rows.map((row, index) => {
        const Heading = index === 0 ? "h1" : "h2"
        // The first row is what a visitor sees before scrolling, so its
        // pictures load with the page. Every row after it waits to be reached.
        const eager = index === 0
        // A row either follows the site's content alignment, in which case its
        // children read it off the public content column, or it sets its own,
        // in which case it places itself in that column too.
        const alignment = row.alignment === "inherit" ? null : row.alignment
        const alignClassName = alignment
          ? publicContentAlignmentJustifyClassNames[alignment]
          : publicContentAlignmentRowClassName
        const showHeading = row.showHeading
        const showIntro = Boolean(row.intro) && row.showIntro
        // The way to everything this row shows a handful of, drawn beside the
        // heading. An app names it in what it fills the row with, because only
        // the app knows where its own list lives and what it is called.
        const rowAction =
          row.kind === APP_FRONT_PAGE_ROW_KIND
            ? frontPageRowAction(appRowData?.[row.id])
            : null

        return (
          <section
            key={row.id}
            className={cn(
              // The row's words and the row's content are two things, not
              // one, so they sit further apart than the lines inside either.
              "flex w-full flex-col gap-6 md:gap-8",
              row.layout === "narrow" && "max-w-3xl",
              alignment ? publicContentAlignmentSelfClassNames[alignment] : null,
              publicDeviceRowClassName(row.device)
            )}
            data-front-page-row={row.kind}
            data-front-page-layout={row.layout}
            data-front-page-device={row.device}
            data-front-page-alignment={row.alignment}
          >
            {/* A hero draws its own heading, at its own size and beside the
                picture. Every other row puts the heading above its content. */}
            {row.kind === "hero" ||
            (!showHeading && !showIntro && !rowAction) ? null : (
              <header
                className={cn(
                  "flex w-full flex-wrap items-end justify-between gap-4",
                  // The button sits at the end of the heading's line, so the
                  // row reads as one band: what it is on the left, the way to
                  // all of it on the right.
                  rowAction ? null : "block"
                )}
              >
                <div className="grid gap-2">
                  {showHeading ? (
                    <Heading
                      className={cn(
                        "font-semibold tracking-tight text-balance",
                        index === 0
                          ? "text-3xl md:text-4xl"
                          : "text-2xl md:text-3xl"
                      )}
                    >
                      {row.heading}
                    </Heading>
                  ) : null}
                  {showIntro ? (
                    <p className="text-base text-muted-foreground md:text-lg">
                      {row.intro}
                    </p>
                  ) : null}
                </div>
                {rowAction ? (
                  <Button asChild className="shrink-0">
                    <SavedLink href={rowAction.href}>
                      {rowAction.label}
                    </SavedLink>
                  </Button>
                ) : null}
              </header>
            )}

            {row.kind === APP_FRONT_PAGE_ROW_KIND ? (
              // The heading above it is the shell's, like every other kind but
              // a hero, so an app row answers to the same Visibility switches
              // and the same alignment as the rows around it.
              <AppFrontPageRow
                appKind={row.appKind}
                heading={row.heading}
                intro={row.intro}
                settings={row.settings}
                data={appRowData?.[row.id] ?? null}
              />
            ) : row.kind === "hero" ? (
              <FrontPageHero
                heading={row.heading}
                intro={row.intro}
                action={row.action}
                image={row.showImage ? row.image : ""}
                alt={row.alt}
                buttonLabel={row.buttonLabel}
                buttonHref={row.buttonHref}
                note={row.note}
                stars={row.stars}
                headingLevel={index === 0 ? "h1" : "h2"}
                eager={eager}
                alignClassName={alignClassName}
                showHeading={showHeading}
                showIntro={showIntro}
                showAction={row.showAction}
                showStars={row.showStars}
                showNote={row.showNote}
              />
            ) : row.kind === "plans" ? (
              <PricingTable
                plans={plans}
                interval={interval}
                onIntervalChange={onIntervalChange}
                onSelect={onSelectPlan}
                trialUsed={trialUsed}
                actionLabel="Get started"
              />
            ) : row.kind === "testimonials" ? (
              <FrontPageTestimonials
                items={row.items}
                alignClassName={alignClassName}
                showPictures={row.showPictures}
                showRoles={row.showRoles}
              />
            ) : row.kind === "faq" ? (
              <FrontPageFaq items={row.items} showNumbers={row.showNumbers} />
            ) : row.kind === "logos" ? (
              <FrontPageLogos
                items={row.items}
                eager={eager}
                alignClassName={alignClassName}
              />
            ) : row.kind === "screenshots" ? (
              <FrontPageScreenshots
                items={row.items}
                eager={eager}
                alignClassName={alignClassName}
                showCaptions={row.showCaptions}
              />
            ) : null}
          </section>
        )
      })}
    </div>
  )
}
