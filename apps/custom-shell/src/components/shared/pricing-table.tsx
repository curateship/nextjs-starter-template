import { CheckIcon, Loader2Icon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatMoney } from "@/lib/money"
import type { PlanOption } from "@/lib/api/billing"
import { describePlanFeatures } from "@/lib/plan-features"

export type BillingInterval = "monthly" | "yearly"

/**
 * Plan cards shared by the public pricing page and the billing page.
 *
 * Feature bullets come from each plan's `features` JSON, so a new product only
 * edits plan rows to change what the cards say.
 */
export function PricingTable({
  plans,
  currentPlanSlug,
  currentInterval,
  interval,
  onIntervalChange,
  onSelect,
  busyPlanSlug,
  actionLabel = "Upgrade",
}: {
  plans: PlanOption[]
  currentPlanSlug?: string
  /**
   * How the person already pays. A plan is only theirs on the period they are
   * actually on, so a monthly subscriber's yearly card stays buyable.
   */
  currentInterval?: BillingInterval | null
  interval: BillingInterval
  onIntervalChange: (interval: BillingInterval) => void
  onSelect: (plan: PlanOption, interval: BillingInterval) => void
  busyPlanSlug?: string | null
  actionLabel?: string
}) {
  const hasYearly = plans.some((plan) => plan.priceYearlyCents > 0)

  return (
    <div className="flex w-full flex-col gap-2 md:gap-3">
      {hasYearly ? (
        <div className="flex justify-center">
          <Tabs
            value={interval}
            onValueChange={(value) => onIntervalChange(value as BillingInterval)}
          >
            <TabsList>
              <TabsTrigger value="monthly">Monthly</TabsTrigger>
              <TabsTrigger value="yearly">Yearly</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      ) : null}

      <div className="grid gap-2 md:grid-cols-2 md:gap-3 xl:grid-cols-3">
        {plans.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            interval={interval}
            currentPlanSlug={currentPlanSlug}
            currentInterval={currentInterval}
            busy={busyPlanSlug === plan.slug}
            actionLabel={actionLabel}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  )
}

function PlanCard({
  plan,
  interval,
  currentPlanSlug,
  currentInterval,
  busy,
  actionLabel,
  onSelect,
}: {
  plan: PlanOption
  interval: BillingInterval
  currentPlanSlug?: string
  currentInterval?: BillingInterval | null
  busy?: boolean
  actionLabel: string
  onSelect: (plan: PlanOption, interval: BillingInterval) => void
}) {
  const priceCents =
    interval === "yearly" ? plan.priceYearlyCents : plan.priceMonthlyCents
  const purchasable =
    interval === "yearly" ? plan.canCheckoutYearly : plan.canCheckoutMonthly
  const soldOnOtherPeriod =
    interval === "yearly" ? plan.canCheckoutMonthly : plan.canCheckoutYearly
  const features = describePlanFeatures(plan.features)

  // A paid card is only "yours" on the period you actually pay — otherwise a
  // monthly subscriber's yearly card is greyed out with no way to buy it. Two
  // cases sit outside that rule: the free plan is not billed, so it has no
  // period to match; and a caller that gives no period is telling us it does
  // not know, where claiming the other period is buyable is the worse guess.
  const free = plan.isDefault || priceCents === 0
  const onThisPlan = plan.slug === currentPlanSlug
  const current =
    onThisPlan && (free || currentInterval == null || interval === currentInterval)

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>{plan.name}</CardTitle>
          {current ? (
            <Badge variant="secondary" className="shrink-0">
              Current plan
            </Badge>
          ) : onThisPlan ? (
            // Same plan, other period: say which period they are on so the
            // live button below reads as a switch rather than a second buy.
            <Badge variant="outline" className="shrink-0">
              {currentInterval === "yearly" ? "Yours, yearly" : "Yours, monthly"}
            </Badge>
          ) : null}
        </div>
        {plan.description ? (
          <CardDescription>{plan.description}</CardDescription>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <p className="flex items-baseline gap-1">
          <span className="text-2xl font-semibold">
            {formatMoney(priceCents, plan.currency)}
          </span>
          <span className="text-sm text-muted-foreground">
            {priceCents === 0
              ? "forever"
              : interval === "yearly"
                ? "per year"
                : "per month"}
          </span>
        </p>
        {plan.trialDays > 0 && priceCents > 0 ? (
          <p className="text-sm text-muted-foreground">
            Starts with a {plan.trialDays}-day free trial.
          </p>
        ) : null}
        {features.length ? (
          <ul className="flex flex-col gap-2 text-sm">
            {features.map((feature) => (
              <li key={feature} className="flex items-start gap-2">
                <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
      <CardFooter>
        {free ? (
          // There is nothing to buy here, so this is a label, not a button. The
          // header badge above already says whether it is the plan they are on.
          <Badge variant="secondary">Included</Badge>
        ) : (
          <Button
            className="w-full"
            disabled={current || !purchasable || busy}
            onClick={() => onSelect(plan, interval)}
          >
            {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
            {planActionLabel({
              current,
              purchasable,
              soldOnOtherPeriod,
              interval,
              actionLabel,
            })}
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}

/**
 * What the card's button is allowed to promise.
 *
 * A plan with no Stripe price for the period on show cannot be bought however
 * the button is styled, so it names the period that does work rather than the
 * old dead-end "Not available yet".
 */
function planActionLabel({
  current,
  purchasable,
  soldOnOtherPeriod,
  interval,
  actionLabel,
}: {
  current: boolean
  purchasable: boolean
  soldOnOtherPeriod: boolean
  interval: BillingInterval
  actionLabel: string
}) {
  if (current) return "Your plan"
  if (purchasable) return actionLabel
  if (soldOnOtherPeriod) {
    return interval === "yearly" ? "Sold monthly only" : "Sold yearly only"
  }
  return "Not on sale yet"
}
