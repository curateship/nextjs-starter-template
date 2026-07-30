import { CheckIcon } from "lucide-react"

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
import type { PlanFeatures } from "@/lib/plan-features"

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
  interval,
  onIntervalChange,
  onSelect,
  busyPlanSlug,
  actionLabel = "Upgrade",
  disabled,
}: {
  plans: PlanOption[]
  currentPlanSlug?: string
  interval: BillingInterval
  onIntervalChange: (interval: BillingInterval) => void
  onSelect: (plan: PlanOption, interval: BillingInterval) => void
  busyPlanSlug?: string | null
  actionLabel?: string
  disabled?: boolean
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
            current={plan.slug === currentPlanSlug}
            busy={busyPlanSlug === plan.slug}
            disabled={disabled}
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
  current,
  busy,
  disabled,
  actionLabel,
  onSelect,
}: {
  plan: PlanOption
  interval: BillingInterval
  current: boolean
  busy?: boolean
  disabled?: boolean
  actionLabel: string
  onSelect: (plan: PlanOption, interval: BillingInterval) => void
}) {
  const priceCents =
    interval === "yearly" ? plan.priceYearlyCents : plan.priceMonthlyCents
  const purchasable =
    interval === "yearly" ? plan.canCheckoutYearly : plan.canCheckoutMonthly
  const features = describeFeatures(plan.features)

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>{plan.name}</CardTitle>
          {current ? <Badge variant="secondary">Current plan</Badge> : null}
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
        {plan.isDefault || priceCents === 0 ? (
          <Button variant="outline" className="w-full" disabled>
            {current ? "Your plan" : "Included"}
          </Button>
        ) : (
          <Button
            className="w-full"
            disabled={Boolean(disabled) || current || !purchasable || busy}
            onClick={() => onSelect(plan, interval)}
          >
            {current
              ? "Your plan"
              : purchasable
                ? actionLabel
                : "Not available yet"}
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}

/** Turns the plan's free-form features JSON into readable bullet points. */
function describeFeatures(features: PlanFeatures) {
  return Object.entries(features)
    .filter(([, value]) => value !== false && value !== null && value !== "")
    .map(([key, value]) => {
      const label = key
        .replace(/[_-]/g, " ")
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .toLowerCase()

      if (value === true) return capitalize(label)
      if (typeof value === "number") return `${value} ${label}`
      return `${capitalize(label)}: ${String(value)}`
    })
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}
