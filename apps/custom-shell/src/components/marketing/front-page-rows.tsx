import {
  FrontPageFaq,
  FrontPageHero,
  FrontPageLogos,
  FrontPageScreenshots,
  FrontPageTestimonials,
} from "@/components/marketing/front-page-content-blocks"
import { publicContentAlignmentGridClassName } from "@/components/shell/public-content-alignment"
import { PricingTable } from "@/components/shared/pricing-table"
import type { PlanOption } from "@/lib/api/billing/billing"
import type { BillingInterval } from "@/lib/billing/pricing-choice"
import type { FrontPageRow } from "@/lib/pages/front-page"
import { pageGutter } from "@/lib/layout/shell-gutter"
import { publicDeviceRowClassName } from "@/lib/pages/public-device"
import { cn } from "@/lib/utils"

export function FrontPageRows({
  rows,
  plans,
  trialUsed,
  interval,
  onIntervalChange,
  onSelectPlan,
}: {
  rows: FrontPageRow[]
  plans: PlanOption[]
  trialUsed: boolean
  interval: BillingInterval
  onIntervalChange: (interval: BillingInterval) => void
  onSelectPlan: (plan: PlanOption, interval: BillingInterval) => void
}) {
  return (
    <div
      className={cn("grid w-full", publicContentAlignmentGridClassName)}
      style={{ gap: pageGutter }}
      data-front-page-rows=""
    >
      {rows.map((row, index) => {
        const Heading = index === 0 ? "h1" : "h2"
        // The first row is what a visitor sees before scrolling, so its
        // pictures load with the page. Every row after it waits to be reached.
        const eager = index === 0

        return (
          <section
            key={row.id}
            className={cn(
              // The row's words and the row's content are two things, not
              // one, so they sit further apart than the lines inside either.
              "flex w-full flex-col gap-6 md:gap-8",
              row.layout === "narrow" && "max-w-3xl",
              publicDeviceRowClassName(row.device)
            )}
            data-front-page-row={row.kind}
            data-front-page-layout={row.layout}
            data-front-page-device={row.device}
          >
            {/* A hero draws its own heading, at its own size and beside the
                picture. Every other row puts the heading above its content. */}
            {row.kind === "hero" ? null : (
              <header className="grid gap-2">
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
                {row.intro ? (
                  <p className="text-base text-muted-foreground md:text-lg">
                    {row.intro}
                  </p>
                ) : null}
              </header>
            )}

            {row.kind === "hero" ? (
              <FrontPageHero
                heading={row.heading}
                intro={row.intro}
                image={row.image}
                alt={row.alt}
                buttonLabel={row.buttonLabel}
                buttonHref={row.buttonHref}
                note={row.note}
                stars={row.stars}
                headingLevel={index === 0 ? "h1" : "h2"}
                eager={eager}
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
              <FrontPageTestimonials items={row.items} />
            ) : row.kind === "faq" ? (
              <FrontPageFaq items={row.items} />
            ) : row.kind === "logos" ? (
              <FrontPageLogos items={row.items} eager={eager} />
            ) : row.kind === "screenshots" ? (
              <FrontPageScreenshots items={row.items} eager={eager} />
            ) : null}
          </section>
        )
      })}
    </div>
  )
}
