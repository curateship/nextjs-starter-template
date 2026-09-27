import {
  FrontPageFaq,
  FrontPageHero,
  FrontPageLogos,
  FrontPageScreenshots,
  FrontPageTestimonials,
} from "@/components/marketing/front-page-content-blocks"
import { AppFrontPageRow } from "@/components/marketing/app-front-page-row"
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
            {row.kind === "hero" || (!showHeading && !showIntro) ? null : (
              <header className="grid gap-2">
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
