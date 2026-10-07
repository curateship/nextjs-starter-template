import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { CheckIcon, Loader2Icon } from "lucide-react"

import { PaymentsOffCard } from "@/components/shared/payments-off-card"
import { PlanChangeConfirmation } from "@/components/shared/plan-change-confirmation"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  getBillingErrorMessage,
  openPlanChange,
  type PlanChangePreview,
  type PlanOption,
} from "@/lib/api/billing/billing"
import { describePlanFeatures } from "@/lib/billing/plan-features"
import type { BillingInterval } from "@/lib/billing/pricing-choice"
import { describeCode } from "@/lib/format/code-label"
import { formatMoney } from "@/lib/format/money"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

/**
 * The plans screen, inside the product shell.
 *
 * The look is the old app's pricing page by value (`apps/pomoder`'s
 * `.reference-price-card`): a 960px column, a centred heading, cards with a
 * 24px corner and a 360px floor, the chosen plan outlined in the accent with
 * a glow under it and a pill badge over its top edge, a big price, a ticked
 * feature list and one pill button per card.
 *
 * What fills it is the shell's own billing: the plan rows an admin edits in
 * Settings → Plans, their Stripe prices and the same checkout call the shell's
 * `/pricing` page makes. No price is written here, which is why the old app's
 * $9 and $78 are nowhere in this file.
 */
export function PricingPage({
  plans,
  signedIn,
  currentPlanSlug,
  currentInterval,
  billingEnabled,
  trialUsed,
  changingPlan,
}: {
  plans: PlanOption[]
  signedIn: boolean
  currentPlanSlug: string | null
  currentInterval: BillingInterval | null
  billingEnabled: boolean
  trialUsed: boolean
  changingPlan: boolean
}) {
  const navigate = useNavigate()
  // Opens on the period they already pay, so a yearly subscriber is not shown
  // monthly prices for the plan they are on.
  const [interval, setInterval] = React.useState<BillingInterval>(
    currentInterval ?? "monthly"
  )
  const [busySlug, setBusySlug] = React.useState<string | null>(null)
  const [preview, setPreview] = React.useState<PlanChangePreview | null>(null)
  // A second click while the first checkout is opening would start two of them.
  const opening = React.useRef(false)

  const select = React.useCallback(
    async (plan: PlanOption) => {
      // The free plan is not bought, so it never reaches billing: a visitor is
      // sent to the sign-up and a member to the timer, the way the old app's
      // free card behaved.
      if (planPrice(plan, interval).free) {
        await navigate({ to: signedIn ? "/" : "/register" })
        return
      }
      if (!signedIn) {
        await navigate({
          to: "/register",
          search: { plan: plan.slug, interval },
        })
        return
      }
      if (opening.current) return
      opening.current = true
      setBusySlug(plan.slug)
      try {
        const result = await openPlanChange(plan.slug, interval)
        if ("preview" in result) setPreview(result.preview)
        else window.location.href = result.url
      } catch (cause) {
        showErrorToast(getBillingErrorMessage(cause))
      } finally {
        opening.current = false
        setBusySlug(null)
      }
    },
    [interval, navigate, signedIn]
  )

  // Offered only when some plan actually has a yearly price. A shop selling by
  // the month alone has nothing to switch between.
  const sellsYearly = plans.some((plan) => plan.priceYearlyCents > 0)

  return (
    <div className="mx-auto flex w-full max-w-[960px] flex-col gap-8 py-8">
      <header className="flex flex-col items-center gap-2 text-center">
        <h2 className="text-[34px] font-bold tracking-tight">
          Simple pricing
        </h2>
        <p className="text-[15.5px] text-muted-foreground">
          Focus alone for free. Go premium to focus together.
        </p>
      </header>

      {preview ? (
        <PlanChangeConfirmation
          preview={preview}
          onClose={() => setPreview(null)}
        />
      ) : !billingEnabled ? (
        <PaymentsOffCard />
      ) : plans.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground">
          No plans are on sale yet.
        </p>
      ) : (
        <>
          {sellsYearly ? (
            <div className="flex justify-center">
              {/* One period for the whole grid. Two cards priced on different
                  periods would not be comparable. */}
              <Tabs
                value={interval}
                onValueChange={(value) =>
                  setInterval(value as BillingInterval)
                }
              >
                <TabsList aria-label="Billing period">
                  <TabsTrigger value="monthly">Monthly</TabsTrigger>
                  <TabsTrigger value="yearly">Yearly</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          ) : null}

          <div className="grid items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {plans.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                interval={interval}
                signedIn={signedIn}
                currentPlanSlug={currentPlanSlug}
                currentInterval={currentInterval}
                busy={busySlug === plan.slug}
                trialUsed={trialUsed}
                changingPlan={changingPlan}
                onSelect={select}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/**
 * What one plan costs on the period being shown, and whether that makes it the
 * free card.
 *
 * Zero on the period on show means "not sold on this period" whenever the
 * other period carries a price: printing "$0 forever" there would advertise a
 * paid plan as free. The card and the button both read this, so a plan can
 * never be drawn as free and then sent to the checkout.
 */
function planPrice(plan: PlanOption, interval: BillingInterval) {
  const priceCents =
    interval === "yearly" ? plan.priceYearlyCents : plan.priceMonthlyCents
  const otherPriceCents =
    interval === "yearly" ? plan.priceMonthlyCents : plan.priceYearlyCents
  const notSoldThisPeriod = priceCents === 0 && otherPriceCents > 0
  return {
    priceCents,
    notSoldThisPeriod,
    free: plan.isDefault || (priceCents === 0 && !notSoldThisPeriod),
  }
}

function PlanCard({
  plan,
  interval,
  signedIn,
  currentPlanSlug,
  currentInterval,
  busy,
  trialUsed,
  changingPlan,
  onSelect,
}: {
  plan: PlanOption
  interval: BillingInterval
  signedIn: boolean
  currentPlanSlug: string | null
  currentInterval: BillingInterval | null
  busy: boolean
  trialUsed: boolean
  changingPlan: boolean
  onSelect: (plan: PlanOption) => void
}) {
  const { priceCents, notSoldThisPeriod, free } = planPrice(plan, interval)
  const purchasable =
    interval === "yearly" ? plan.canCheckoutYearly : plan.canCheckoutMonthly
  const soldOnOtherPeriod =
    interval === "yearly" ? plan.canCheckoutMonthly : plan.canCheckoutYearly

  // A paid card is only "yours" on the period actually being paid, or a
  // monthly subscriber's yearly card would be dead with no way to buy it. The
  // free plan is not billed, so it has no period to match.
  const onThisPlan = plan.slug === currentPlanSlug
  const current =
    onThisPlan && (free || currentInterval == null || interval === currentInterval)
  const featured = Boolean(plan.highlightBadgeText)
  const features = describePlanFeatures(plan.features)

  // The old app's small print under a yearly price, computed from the real
  // prices rather than written down: what the year works out at per month, and
  // what the year saves against twelve monthly payments.
  const perMonth =
    interval === "yearly" && priceCents > 0
      ? formatMoney(Math.round(priceCents / 12), plan.currency)
      : null
  const yearlySavingCents =
    interval === "yearly" && priceCents > 0 && plan.priceMonthlyCents > 0
      ? plan.priceMonthlyCents * 12 - priceCents
      : 0

  return (
    <article
      className={cn(
        "relative flex min-h-[360px] flex-col gap-[22px] rounded-3xl border bg-[var(--p-surface)] p-7",
        featured &&
          "border-[color-mix(in_srgb,var(--p-accent)_50%,transparent)] shadow-[0_24px_70px_color-mix(in_srgb,var(--p-accent)_12%,transparent)]"
      )}
    >
      {plan.highlightBadgeText ? (
        <b className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[var(--p-accent)] px-3.5 py-[5px] text-[11.5px] uppercase tracking-[0.06em] text-[var(--p-on-accent)]">
          {plan.highlightBadgeText}
        </b>
      ) : null}

      <div className="flex flex-col gap-2.5">
        <p
          className={cn(
            "text-[15px] font-bold",
            featured ? "text-[var(--p-accent-2)]" : "text-foreground/85"
          )}
        >
          {plan.name}
        </p>
        <h3 className="flex items-baseline gap-1.5 text-[42px] font-semibold leading-none tracking-[-0.03em]">
          {notSoldThisPeriod ? "—" : formatMoney(priceCents, plan.currency)}
          <span className="font-mono text-xs font-normal tracking-normal text-[var(--p-text-subtle)]">
            {notSoldThisPeriod
              ? interval === "yearly"
                ? "not sold yearly"
                : "not sold monthly"
              : priceCents === 0
                ? "forever"
                : plan.usageMeter
                  ? `per ${describeCode(plan.usageMeter).toLowerCase()}, billed ${interval}`
                  : interval === "yearly"
                    ? "/ year"
                    : "/ month"}
          </span>
        </h3>
        {perMonth ? (
          <small className="font-mono text-xs text-[var(--p-text-subtle)]">
            {perMonth} / month, billed once
            {yearlySavingCents > 0
              ? ` · saves ${formatMoney(yearlySavingCents, plan.currency)} a year`
              : ""}
          </small>
        ) : null}
        {plan.description ? (
          <small className="text-[13px] text-muted-foreground">
            {plan.description}
          </small>
        ) : null}
        {/* Said here rather than left to Stripe's page. A trial already spent
            is going to be missing at the checkout either way; the only choice
            is whether they find out before the click or after. */}
        {!changingPlan && plan.trialDays > 0 && priceCents > 0 ? (
          <small className="text-[13px] text-muted-foreground">
            {trialUsed
              ? "You've used your free trial, so billing starts today."
              : `Starts with a ${plan.trialDays}-day free trial.`}
          </small>
        ) : null}
      </div>

      {features.length ? (
        <ul className="flex flex-1 flex-col gap-3">
          {features.map((feature) => (
            <li
              key={feature}
              className="flex items-start gap-2.5 text-sm text-foreground/75"
            >
              <CheckIcon
                className="mt-0.5 size-3.5 shrink-0 text-[var(--p-success)] [stroke-width:3]"
                aria-hidden="true"
              />
              {feature}
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex-1" />
      )}

      {/* The shared Button, so the height, the focus ring and the disabled
          state are the rulebook's 32px ones. Only the pill shape and the
          outline card's colours are the app's, the same deal the Register
          button in the product header takes. */}
      <Button
        variant={featured ? "default" : "ghost"}
        className={cn(
          "w-full",
          !featured && "border border-foreground/15 hover:bg-foreground/[0.07]"
        )}
        disabled={current || busy || (!free && !purchasable)}
        onClick={() => onSelect(plan)}
      >
        {busy ? (
          <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          cardActionLabel({
            free,
            current,
            onThisPlan,
            purchasable,
            soldOnOtherPeriod,
            interval,
            signedIn,
            changingPlan,
            checkoutButtonText: plan.checkoutButtonText,
          })
        )}
      </Button>
    </article>
  )
}

/**
 * What the card's button is allowed to promise.
 *
 * A plan with no Stripe price for the period on show cannot be bought however
 * the button looks, so it names the period that does work instead of a
 * dead-end "not available".
 */
function cardActionLabel({
  free,
  current,
  onThisPlan,
  purchasable,
  soldOnOtherPeriod,
  interval,
  signedIn,
  changingPlan,
  checkoutButtonText,
}: {
  free: boolean
  current: boolean
  onThisPlan: boolean
  purchasable: boolean
  soldOnOtherPeriod: boolean
  interval: BillingInterval
  signedIn: boolean
  changingPlan: boolean
  checkoutButtonText: string | null
}) {
  if (current) return "Your plan"
  if (free) return signedIn ? "Start focusing" : "Start free"
  if (purchasable) {
    if (!changingPlan && checkoutButtonText) return checkoutButtonText
    if (onThisPlan) {
      return interval === "yearly" ? "Switch to yearly" : "Switch to monthly"
    }
    return changingPlan ? "Change plan" : "Go premium"
  }
  if (soldOnOtherPeriod) {
    return interval === "yearly" ? "Sold monthly only" : "Sold yearly only"
  }
  return "Not on sale yet"
}
