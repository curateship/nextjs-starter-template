import {
  FrontPageFaq,
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

        return (
          <section
            key={row.id}
            className={cn(
              "flex w-full flex-col gap-2",
              row.layout === "narrow" && "max-w-3xl"
            )}
            data-front-page-row={row.kind}
            data-front-page-layout={row.layout}
          >
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

            {row.kind === "plans" ? (
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
              <FrontPageLogos items={row.items} />
            ) : row.kind === "screenshots" ? (
              <FrontPageScreenshots items={row.items} />
            ) : null}
          </section>
        )
      })}
    </div>
  )
}
