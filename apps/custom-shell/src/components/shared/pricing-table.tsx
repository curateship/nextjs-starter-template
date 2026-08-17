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
import { formatMoney } from "@/lib/format/money"
import type { PlanOption } from "@/lib/api/billing/billing"
import { describePlanFeatures } from "@/lib/billing/plan-features"
import type { BillingInterval } from "@/lib/billing/pricing-choice"
import { cn } from "@/lib/utils"

/**
 * Plan cards shared by the public pricing page and the billing page.
 *
 * Feature bullets come from each plan's `features` JSON, so a new product only
 * edits plan rows to change what the cards say.
 */
export function PricingTable({
  plans,
  currentPlanSlug,
  selectedPlanSlug,
  currentInterval,
  interval,
  onIntervalChange,
  onSelect,
  busyPlanSlug,
  actionLabel = "Upgrade",
  trialUsed = false,
}: {
  plans: PlanOption[]
  currentPlanSlug?: string
  /** The card chosen on the previous page, distinct from the plan they own. */
  selectedPlanSlug?: string | null
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
  /**
   * True once this person has already had their one free trial, so every card
   * that advertises a trial says "billing starts today" instead. Defaults to
   * false, which is what a signed-out visitor sees: nobody is told they have
   * spent a trial before we know who they are.
   */
  trialUsed?: boolean
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
            selected={plan.slug === selectedPlanSlug}
            currentInterval={currentInterval}
            busy={busyPlanSlug === plan.slug}
            actionLabel={actionLabel}
            trialUsed={trialUsed}
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
  selected,
  currentInterval,
  busy,
  actionLabel,
  trialUsed,
  onSelect,
}: {
  plan: PlanOption
  interval: BillingInterval
  currentPlanSlug?: string
  selected: boolean
  currentInterval?: BillingInterval | null
  busy?: boolean
  actionLabel: string
  trialUsed: boolean
  onSelect: (plan: PlanOption, interval: BillingInterval) => void
}) {
  const priceCents =
    interval === "yearly" ? plan.priceYearlyCents : plan.priceMonthlyCents
  const purchasable =
    interval === "yearly" ? plan.canCheckoutYearly : plan.canCheckoutMonthly
  const soldOnOtherPeriod =
    interval === "yearly" ? plan.canCheckoutMonthly : plan.canCheckoutYearly
  const features = describePlanFeatures(plan.features)

  // Zero means "not sold on this period" whenever the other period carries a
  // price — printing "$0 forever" there would advertise a paid plan as free.
  const notSoldThisPeriod =
    priceCents === 0 &&
    (interval === "yearly" ? plan.priceMonthlyCents : plan.priceYearlyCents) > 0

  // A paid card is only "yours" on the period you actually pay — otherwise a
  // monthly subscriber's yearly card is greyed out with no way to buy it. Two
  // cases sit outside that rule: the free plan is not billed, so it has no
  // period to match; and a caller that gives no period is telling us it does
  // not know, where claiming the other period is buyable is the worse guess.
  const free = plan.isDefault || (priceCents === 0 && !notSoldThisPeriod)
  const onThisPlan = plan.slug === currentPlanSlug
  const current =
    onThisPlan && (free || currentInterval == null || interval === currentInterval)
  const highlighted = Boolean(plan.highlightBadgeText)

  return (
    <Card
      className={cn(
        "flex flex-col",
        (selected || highlighted) && "ring-2 ring-primary shadow-sm"
      )}
    >
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>{plan.name}</CardTitle>
          <div className="flex flex-wrap justify-end gap-1.5">
            {highlighted ? <Badge>{plan.highlightBadgeText}</Badge> : null}
            {selected ? (
              <Badge variant="secondary">Selected</Badge>
            ) : current ? (
              <Badge variant="secondary">Current plan</Badge>
            ) : onThisPlan ? (
              // Same plan, other period: say which period they are on so the
              // live button below reads as a switch rather than a second buy.
              <Badge variant="outline">
                {currentInterval === "yearly" ? "Yours, yearly" : "Yours, monthly"}
              </Badge>
            ) : null}
          </div>
        </div>
        {plan.description ? (
          <CardDescription>{plan.description}</CardDescription>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <p className="flex items-baseline gap-1">
          <span className="text-2xl font-semibold">
            {notSoldThisPeriod ? "—" : formatMoney(priceCents, plan.currency)}
          </span>
          <span className="text-sm text-muted-foreground">
            {notSoldThisPeriod
              ? interval === "yearly"
                ? "not sold yearly"
                : "not sold monthly"
              : priceCents === 0
                ? "forever"
                : interval === "yearly"
                  ? "per year"
                  : "per month"}
          </span>
        </p>
        {/* Said here rather than left to Stripe's page. A trial that has
            already been used is going to be missing at the checkout either
            way; the only choice is whether the person finds out before they
            click or after. */}
        {plan.trialDays > 0 && priceCents > 0 ? (
          <p className="text-sm text-muted-foreground">
            {trialUsed
              ? "You've used your free trial, so billing starts today."
              : `Starts with a ${plan.trialDays}-day free trial.`}
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
              checkoutButtonText: plan.checkoutButtonText,
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
  checkoutButtonText,
}: {
  current: boolean
  purchasable: boolean
  soldOnOtherPeriod: boolean
  interval: BillingInterval
  actionLabel: string
  checkoutButtonText: string | null
}) {
  if (current) return "Your plan"
  if (purchasable) return checkoutButtonText || actionLabel
  if (soldOnOtherPeriod) {
    return interval === "yearly" ? "Sold monthly only" : "Sold yearly only"
  }
  return "Not on sale yet"
}
