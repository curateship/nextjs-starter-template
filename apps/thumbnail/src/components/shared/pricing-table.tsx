import { ArrowRightIcon, CheckIcon, Loader2Icon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { formatMoney } from "@/lib/format/money"
import type { PlanOption } from "@/lib/api/billing/billing"
import { describePlanFeatures } from "@/lib/billing/plan-features"
import { describeCode } from "@/lib/format/code-label"
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
  changingPlan = false,
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
  changingPlan?: boolean
}) {
  return (
    <div className="flex w-full flex-col gap-2 md:gap-3">
      <div className="grid gap-4 md:grid-cols-2 md:gap-6 xl:grid-cols-3">
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
            changingPlan={changingPlan}
            onIntervalChange={onIntervalChange}
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
  changingPlan,
  onIntervalChange,
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
  changingPlan: boolean
  onIntervalChange: (interval: BillingInterval) => void
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
    onThisPlan &&
    (free || currentInterval == null || interval === currentInterval)
  const highlighted = Boolean(plan.highlightBadgeText)

  const action = free ? (
    // There is nothing to buy here, so this is a label, not a button. The
    // header badge above already says whether it is the plan they are on.
    <span className="flex h-16 w-full items-center justify-center gap-2 text-sm font-medium opacity-70">
      Included
      <ArrowRightIcon className="size-4" />
    </span>
  ) : (
    <Button
      variant="ghost"
      className={cn(
        "group/action h-16 w-full rounded-none rounded-b-2xl text-sm font-medium",
        highlighted
          ? "text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
          : "hover:bg-foreground/5"
      )}
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
        checkoutButtonText: changingPlan ? null : plan.checkoutButtonText,
      })}
      {busy ? null : (
        <ArrowRightIcon className="size-4 transition-transform duration-150 group-hover/action:translate-x-1" />
      )}
    </Button>
  )

  return (
    // Two layers, not one box with a strip inside it: the coloured block is the
    // card's own shadow of an action, and the white body sits on top of it with
    // its own outline, so the body's bottom edge curves away and leaves the bar
    // showing beneath. That is the shape a plan card has.
    <div
      className={cn(
        "flex flex-col rounded-2xl",
        highlighted ? "bg-primary text-primary-foreground" : "bg-muted"
      )}
    >
      <Card
        className={cn(
          "flex flex-1 flex-col gap-8 rounded-2xl py-8",
          highlighted && "border border-foreground",
          selected && "ring-2 ring-primary shadow-sm"
        )}
      >
        <CardHeader className="px-8">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="font-sans text-base">{plan.name}</CardTitle>
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
                  {currentInterval === "yearly"
                    ? "Yours, yearly"
                    : "Yours, monthly"}
                </Badge>
              ) : null}
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-8 px-8">
          <div className="grid gap-3">
            <p className="flex items-baseline gap-0.5">
              <span className="text-4xl font-semibold tracking-tight md:text-5xl">
                {notSoldThisPeriod
                  ? "—"
                  : formatMoney(priceCents, plan.currency)}
              </span>
              <span className="text-sm font-medium text-muted-foreground">
                {notSoldThisPeriod
                  ? interval === "yearly"
                    ? "not sold yearly"
                    : "not sold monthly"
                  : priceCents === 0
                    ? "forever"
                    : plan.usageMeter
                      ? `per ${describeCode(plan.usageMeter).toLowerCase()}, billed ${interval}`
                      : interval === "yearly"
                        ? "per year"
                        : "per month"}
              </span>
            </p>
            {plan.priceYearlyCents > 0 ? (
              // One period for the whole grid, offered on each card that has a
              // yearly price. Flipping it here moves every card, because a
              // page cannot show one plan by the month beside another by the
              // year and still be comparing them.
              <div className="flex items-center gap-3 py-2">
                <Switch
                  id={`${plan.id}-billed-annually`}
                  checked={interval === "yearly"}
                  onCheckedChange={(yearly) =>
                    onIntervalChange(yearly ? "yearly" : "monthly")
                  }
                />
                <Label
                  htmlFor={`${plan.id}-billed-annually`}
                  className="cursor-pointer text-sm font-medium"
                >
                  Billed annually
                </Label>
              </div>
            ) : null}
            {plan.description ? (
              <CardDescription>{plan.description}</CardDescription>
            ) : null}
            {/* Said here rather than left to Stripe's page. A trial that has
                already been used is going to be missing at the checkout either
                way; the only choice is whether the person finds out before they
                click or after. */}
            {!changingPlan && plan.trialDays > 0 && priceCents > 0 ? (
              <p className="text-sm text-muted-foreground">
                {trialUsed
                  ? "You've used your free trial, so billing starts today."
                  : `Starts with a ${plan.trialDays}-day free trial.`}
              </p>
            ) : null}
          </div>
          {features.length ? (
            <ul className="flex flex-col gap-4 border-t pt-8 text-sm md:text-base">
              {features.map((feature) => (
                <li key={feature} className="flex items-start gap-2">
                  <CheckIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground md:size-5" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </CardContent>
      </Card>
      {action}
    </div>
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
