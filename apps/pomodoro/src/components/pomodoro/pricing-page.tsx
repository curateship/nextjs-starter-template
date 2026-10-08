import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { CheckIcon, Loader2Icon } from "lucide-react"

import { PlanChangeConfirmation } from "@/components/shared/plan-change-confirmation"
import { Button } from "@/components/ui/button"
import {
  getBillingErrorMessage,
  openPlanChange,
  type PlanChangePreview,
  type PlanOption,
} from "@/lib/api/billing/billing"
import type { BillingInterval } from "@/lib/billing/pricing-choice"
import { formatMoney } from "@/lib/format/money"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"
import { contentColumn } from "@/lib/pomodoro/content-column"
import { planCardFeatures } from "@/lib/pomodoro/plan-card-features"

/**
 * The plans screen, inside the product shell, drawn to Tyler's design of
 * 7 Oct 2026: a large headline, then three cards side by side. Free, then Pro
 * twice, once billed monthly and once billed yearly, the yearly one outlined
 * in orange with a Best value pill.
 *
 * Tyler chose on 7 Oct 2026 to show Free and Pro only. Pro is the paid plan
 * marked with a highlight badge in Settings → Plans, or the cheapest paid one
 * when none is. Any other paid plan stays on sale through the shell but is not
 * drawn here. A period Pro has no price for gets no card.
 *
 * What fills it is the shell's own billing: the plan rows an admin edits in
 * Settings → Plans, their Stripe prices and the same checkout call the shell's
 * `/pricing` page makes. No price is written here.
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
  const [busyKey, setBusyKey] = React.useState<string | null>(null)
  const [preview, setPreview] = React.useState<PlanChangePreview | null>(null)
  // A second click while the first checkout is opening would start two of them.
  const opening = React.useRef(false)

  const freePlan = plans.find(isFreePlan) ?? null
  const proPlan = pickProPlan(plans)

  const select = React.useCallback(
    async (plan: PlanOption, interval: BillingInterval | null) => {
      // The free plan is not bought, so it never reaches billing: a visitor is
      // sent to the sign-up and a member to the timer.
      if (!interval) {
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
      setBusyKey(`${plan.slug}:${interval}`)
      try {
        const result = await openPlanChange(plan.slug, interval)
        if ("preview" in result) setPreview(result.preview)
        else window.location.href = result.url
      } catch (cause) {
        showErrorToast(getBillingErrorMessage(cause))
      } finally {
        opening.current = false
        setBusyKey(null)
      }
    },
    [navigate, signedIn]
  )

  const shared = {
    signedIn,
    currentPlanSlug,
    currentInterval,
    billingEnabled,
    trialUsed,
    changingPlan,
    onSelect: select,
  }
  const sellsMonthly = proPlan ? proPlan.priceMonthlyCents > 0 : false
  const sellsYearly = proPlan ? proPlan.priceYearlyCents > 0 : false

  return (
    <div className={`${contentColumn} flex flex-col gap-10 py-8`}>
      {/* Left-aligned and the same size as every other page's title. Tyler,
          8 Oct 2026: "align the header and subheader left", then "the
          header font is a bit bigger than the other pages header. match it". */}
      <header className="flex flex-col items-start gap-2">
        <h2 className="text-4xl font-bold tracking-tight">
          Focus longer, together.
        </h2>
        <p className="max-w-xl text-muted-foreground">
          The timer, tasks and rooms are free. Pro unlocks every sound and
          scene, AI mixes, hosting and your full history.
        </p>
      </header>

      {preview ? (
        <PlanChangeConfirmation
          preview={preview}
          onClose={() => setPreview(null)}
        />
      ) : !freePlan && !proPlan ? (
        <p className="text-sm text-muted-foreground">
          No plans are on sale yet.
        </p>
      ) : (
        <>
          {/* The plans stay on show with payments off, so people can see what
              Pro holds. Tyler, 7 Oct 2026: "the pricing ui should be visible
              even if payment is turned off". Only the paid buttons change. */}
          {!billingEnabled ? (
            <p
              role="status"
              className="text-sm text-muted-foreground"
            >
              Paid plans can&rsquo;t be bought just yet. Everything on the free
              plan works today.
            </p>
          ) : null}
          <div className="grid items-stretch gap-5 md:grid-cols-3">
            {freePlan ? (
              <PriceCard {...shared} plan={freePlan} interval={null} busy={false} />
            ) : null}
            {proPlan && sellsMonthly ? (
              <PriceCard
                {...shared}
                plan={proPlan}
                interval="monthly"
                busy={busyKey === `${proPlan.slug}:monthly`}
              />
            ) : null}
            {proPlan && sellsYearly ? (
              <PriceCard
                {...shared}
                plan={proPlan}
                interval="yearly"
                featured
                busy={busyKey === `${proPlan.slug}:yearly`}
              />
            ) : null}
          </div>
        </>
      )}
    </div>
  )
}

/** The plan nobody pays for: the default one, or one with no price at all. */
function isFreePlan(plan: PlanOption) {
  return (
    plan.isDefault ||
    (plan.priceMonthlyCents === 0 && plan.priceYearlyCents === 0)
  )
}

/**
 * The one paid plan the page sells: the paid plan with a highlight badge in
 * Settings → Plans, or else the cheapest paid plan by its monthly price.
 */
function pickProPlan(plans: PlanOption[]) {
  const paid = plans.filter((plan) => !isFreePlan(plan))
  return (
    paid.find((plan) => plan.highlightBadgeText) ??
    [...paid].sort(
      (left, right) =>
        (left.priceMonthlyCents || left.priceYearlyCents / 12) -
        (right.priceMonthlyCents || right.priceYearlyCents / 12)
    )[0] ??
    null
  )
}

/**
 * One card. `interval` null is the free card; otherwise the card sells the
 * plan on that period alone, so the price, the line under it and the button
 * all speak about one period.
 */
function PriceCard({
  plan,
  interval,
  featured = false,
  signedIn,
  currentPlanSlug,
  currentInterval,
  billingEnabled,
  trialUsed,
  changingPlan,
  busy,
  onSelect,
}: {
  plan: PlanOption
  interval: BillingInterval | null
  featured?: boolean
  signedIn: boolean
  currentPlanSlug: string | null
  currentInterval: BillingInterval | null
  /** Off: a paid card is shown in full but says Coming soon. */
  billingEnabled: boolean
  trialUsed: boolean
  changingPlan: boolean
  busy: boolean
  onSelect: (plan: PlanOption, interval: BillingInterval | null) => void
}) {
  const free = interval === null
  const onThisPlan = plan.slug === currentPlanSlug
  // A paid card is only "yours" on the period actually being paid, or a
  // monthly subscriber's yearly card would be dead with no way to buy it.
  const current =
    onThisPlan && (free || currentInterval == null || interval === currentInterval)
  const purchasable =
    !free &&
    billingEnabled &&
    (interval === "yearly" ? plan.canCheckoutYearly : plan.canCheckoutMonthly)
  const features = planCardFeatures(plan.features, free)

  const yearlyCents = plan.priceYearlyCents
  const monthlyCents = plan.priceMonthlyCents
  // The yearly card leads with what the year works out at per month, the way
  // the design draws it, and says the yearly sum and the saving under it.
  const shownCents =
    interval === "yearly" ? Math.round(yearlyCents / 12) : free ? 0 : monthlyCents
  const savingShare =
    interval === "yearly" && monthlyCents > 0
      ? Math.round((1 - yearlyCents / (monthlyCents * 12)) * 100)
      : 0

  const label = free
    ? plan.name
    : `${plan.name} ${interval === "yearly" ? "yearly" : "monthly"}`
  const subLine = free
    ? "No card needed"
    : interval === "yearly"
      ? `${formatMoney(yearlyCents, plan.currency)} billed yearly${savingShare > 0 ? ` · save ${savingShare}%` : ""}`
      : "Billed monthly"

  const buttonLabel = current
    ? "Current plan"
    : free
      ? signedIn
        ? "Start focusing"
        : "Start free"
      : !billingEnabled
        ? "Coming soon"
        : !purchasable
          ? "Not on sale yet"
          : !changingPlan && plan.checkoutButtonText
            ? plan.checkoutButtonText
            : onThisPlan
              ? interval === "yearly"
                ? "Switch to yearly"
                : "Switch to monthly"
              : changingPlan
                ? "Change plan"
                : `Get ${plan.name}`

  return (
    <article
      aria-label={label}
      className={cn(
        "flex flex-col gap-6 rounded-[28px] border bg-[var(--p-surface)] p-7 sm:p-8",
        featured &&
          "border-2 border-[color:var(--p-accent)] bg-[radial-gradient(ellipse_at_top,color-mix(in_srgb,var(--p-accent)_14%,transparent),transparent_65%),var(--p-surface)]"
      )}
    >
      <header className="flex min-h-7 items-center justify-between gap-3">
        <h3 className="font-mono text-xs font-normal uppercase tracking-[0.25em] text-muted-foreground">
          {label}
        </h3>
        {featured && savingShare > 0 ? (
          <b className="rounded-full bg-[var(--p-accent)] px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-[var(--p-on-accent)]">
            Best value
          </b>
        ) : null}
      </header>

      <div className="flex flex-col gap-2">
        <p className="flex items-baseline gap-2">
          <span className="text-5xl font-bold tracking-tight">
            {formatMoney(shownCents, plan.currency)}
          </span>
          <span className="text-lg text-muted-foreground">
            {free ? "forever" : "/ month"}
          </span>
        </p>
        <p
          className={cn(
            "text-base",
            interval === "yearly"
              ? "text-[var(--p-accent)]"
              : "text-muted-foreground"
          )}
        >
          {subLine}
        </p>
        {/* Said here rather than left to Stripe's page, so a spent trial is
            found out before the click rather than after. */}
        {!free && !changingPlan && plan.trialDays > 0 && billingEnabled ? (
          <p className="text-sm text-muted-foreground">
            {trialUsed
              ? "You've used your free trial, so billing starts today."
              : `Starts with a ${plan.trialDays}-day free trial.`}
          </p>
        ) : null}
      </div>

      <Button
        size="lg"
        variant={featured ? "default" : free ? "outline" : "ghost"}
        className={cn(
          "h-12 w-full rounded-2xl text-base",
          !featured &&
            !free &&
            "bg-black text-white hover:bg-black/80 hover:text-white dark:hover:bg-black/80"
        )}
        disabled={current || busy || (!free && !purchasable)}
        onClick={() => onSelect(plan, interval)}
      >
        {busy ? (
          <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          buttonLabel
        )}
      </Button>

      {features.length ? (
        <div className="flex flex-col gap-4">
          <p className="font-semibold text-foreground/85">
            {free ? "Everything you need to start" : "Everything in Free, plus"}
          </p>
          <ul className="flex flex-col gap-3.5">
            {features.map((feature) => (
              <li key={feature} className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className={cn(
                    "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full",
                    free
                      ? "bg-[rgba(var(--p-fg-rgb),0.1)] text-muted-foreground"
                      : "bg-[color:var(--p-accent)]/20 text-[var(--p-accent)]"
                  )}
                >
                  <CheckIcon className="size-3 [stroke-width:3]" />
                </span>
                <span className="text-foreground/85">{feature}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </article>
  )
}
