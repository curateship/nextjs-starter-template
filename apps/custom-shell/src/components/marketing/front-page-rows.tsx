import {
  FrontPageFaq,
  FrontPageHero,
  FrontPageLogos,
  FrontPageScreenshots,
  FrontPageTestimonials,
} from "@/components/marketing/front-page-content-blocks"
import { publicContentAlignmentGridClassName } from "@/components/shell/public-content-alignment"
import { PaymentsOffCard } from "@/components/shared/payments-off-card"
import { PricingTable } from "@/components/shared/pricing-table"
import type { PlanOption } from "@/lib/api/billing/billing"
import type { BillingInterval } from "@/lib/billing/pricing-choice"
import type { FrontPageRow } from "@/lib/pages/front-page"
import { publicDeviceRowClassName } from "@/lib/pages/public-device"
import { cn } from "@/lib/utils"

export function FrontPageRows({
  rows,
  plans,
  billingEnabled,
  trialUsed,
  interval,
  onIntervalChange,
  onSelectPlan,
}: {
  rows: FrontPageRow[]
  plans: PlanOption[]
  billingEnabled: boolean
  trialUsed: boolean
  interval: BillingInterval
  onIntervalChange: (interval: BillingInterval) => void
  onSelectPlan: (plan: PlanOption, interval: BillingInterval) => void
}) {
  return (
    <div
      className={cn(
        "grid w-full gap-2 md:gap-3",
        publicContentAlignmentGridClassName
      )}
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
              "flex w-full flex-col gap-2",
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
              <header className="grid gap-1">
                <Heading
                  className={cn(
                    "font-semibold",
                    index === 0 ? "text-2xl" : "text-xl"
                  )}
                >
                  {row.heading}
                </Heading>
                {row.intro ? (
                  <p className="text-sm text-muted-foreground">{row.intro}</p>
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
              billingEnabled ? (
                <PricingTable
                  plans={plans}
                  interval={interval}
                  onIntervalChange={onIntervalChange}
                  onSelect={onSelectPlan}
                  trialUsed={trialUsed}
                  actionLabel="Get started"
                />
              ) : (
                <PaymentsOffCard />
              )
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
