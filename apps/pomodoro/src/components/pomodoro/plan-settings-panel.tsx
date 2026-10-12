import * as React from "react"
import { Link } from "@tanstack/react-router"
import { Loader2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ErrorRow } from "@/components/ui/error-row"
import { LoadingRow } from "@/components/ui/loading-row"
import { Meter } from "@/components/ui/meter"
import {
  getBillingErrorMessage,
  openBillingPortal,
} from "@/lib/api/billing/billing"
import { loadMyPlan, type MyPlan } from "@/lib/api/pomodoro/plan"
import { formatMoney } from "@/lib/format/money"
import { formatBytes } from "@/lib/pomodoro/media-limits"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

/**
 * Settings → Plan (payments task 04): the plan, the next payment, the month's
 * AI credits and the space used, and the way to Stripe's billing page. See
 * `workspace/docs/plan-tab.md`.
 *
 * Nothing here is worked out from a price. The next payment is Stripe's own
 * preview of the next bill, so a discount or a proration is already in it.
 */
export default function PlanSettingsPanel() {
  const [plan, setPlan] = React.useState<MyPlan | null>(null)
  const [failed, setFailed] = React.useState(false)
  // Bumped by Try again, which runs the same read once more.
  const [attempt, setAttempt] = React.useState(0)

  React.useEffect(() => {
    let cancelled = false
    void loadMyPlan()
      .then((result) => {
        if (!cancelled) setPlan(result)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [attempt])

  if (failed)
    return (
      <Card size="sm">
        <CardHeader>
          <CardTitle>Your plan</CardTitle>
        </CardHeader>
        <CardContent>
          <ErrorRow
            message="Your plan could not be loaded."
            onRetry={() => {
              dismissErrorToast()
              setFailed(false)
              setAttempt((count) => count + 1)
            }}
          />
        </CardContent>
      </Card>
    )
  if (!plan) return <LoadingRow label="Loading your plan…" />

  return (
    <div className="flex flex-col gap-4">
      <PlanCard plan={plan} />
      {plan.credits ? <CreditsCard credits={plan.credits} /> : null}
      {plan.space ? <SpaceCard space={plan.space} /> : null}
    </div>
  )
}

/** "12 November 2026". */
function day(iso: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(iso))
}

function PlanCard({ plan }: { plan: MyPlan }) {
  const title =
    plan.kind === "free"
      ? "Free plan"
      : plan.kind === "admin"
        ? "Pro, as an admin"
        : plan.kind === "paused"
          ? `${plan.planName}, paused`
          : plan.interval && !plan.granted
            ? `${plan.planName}, paid ${plan.interval}`
            : plan.planName

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-1 text-sm">
          {planLines(plan).map((line) => (
            <p
              key={line.text}
              className={
                line.alert ? "text-destructive" : "text-muted-foreground"
              }
            >
              {line.text}
            </p>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {plan.kind === "free" ? (
            <Button asChild>
              <Link to="/plans">Get Pro</Link>
            </Button>
          ) : null}
          {plan.canManageBilling && plan.kind !== "free" ? (
            <ManageBillingButton />
          ) : null}
          {plan.kind === "pro" && !plan.granted ? (
            <Button asChild variant="outline">
              <Link to="/plans">Change plan</Link>
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}

/** The sentences under the plan's name, most urgent first. */
function planLines(plan: MyPlan): { text: string; alert?: boolean }[] {
  if (plan.kind === "free")
    return [
      {
        text: "Pro adds every sound and background, AI backgrounds and soundscapes, hosting rooms, your own uploads and your full history.",
      },
    ]
  if (plan.kind === "admin")
    return [
      {
        text: "Your account reads as Pro because it is an admin account. Every Pro perk is on and nothing is billed.",
      },
    ]
  if (plan.kind === "paused")
    return [
      {
        text: "Nothing is billed while it is paused, and Pro perks are off until it resumes.",
      },
    ]

  const lines: { text: string; alert?: boolean }[] = []
  if (plan.cardDeclined)
    lines.push({
      text: "Your card was declined. Update it to keep Pro. Pro stays on while Stripe tries the card again.",
      alert: true,
    })
  if (plan.granted)
    lines.push({
      text: plan.periodEnd
        ? `Given to you by the Pomoder team until ${day(plan.periodEnd)}. Nothing is billed.`
        : "Given to you by the Pomoder team. Nothing is billed.",
    })
  if (plan.endsAt)
    lines.push({
      text: `Pro ends on ${day(plan.endsAt)}. You won't be charged again.`,
    })
  if (plan.trialEndsAt)
    lines.push({
      text: plan.nextPayment
        ? `Your free trial ends on ${day(plan.trialEndsAt)}. Then ${formatMoney(plan.nextPayment.amountCents, plan.nextPayment.currency)} is charged.`
        : `Your free trial ends on ${day(plan.trialEndsAt)}.`,
    })
  else if (plan.nextPayment)
    lines.push({
      text: `Next payment: ${formatMoney(plan.nextPayment.amountCents, plan.nextPayment.currency)} on ${day(plan.nextPayment.on)}.`,
    })
  if (plan.nextPaymentUnknown)
    lines.push({
      text: "Stripe could not tell us your next payment just now. Manage billing shows it.",
    })
  if (plan.canManageBilling)
    lines.push({
      text: "Manage billing opens Stripe's page, where you update your card, cancel, or find your receipts.",
    })
  return lines
}

function ManageBillingButton() {
  const [opening, setOpening] = React.useState(false)
  const open = async () => {
    if (opening) return
    setOpening(true)
    try {
      const { url } = await openBillingPortal()
      window.location.href = url
    } catch (cause) {
      showErrorToast(getBillingErrorMessage(cause))
      setOpening(false)
    }
  }
  return (
    <Button type="button" onClick={() => void open()}>
      {opening ? (
        <>
          <Loader2Icon className="animate-spin" />
          Opening…
        </>
      ) : (
        "Manage billing"
      )}
    </Button>
  )
}

type Allowance = NonNullable<MyPlan["credits"]>["backgrounds"]

function CreditsCard({ credits }: { credits: NonNullable<MyPlan["credits"]> }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>AI credits this month</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <CreditRow label="Backgrounds" allowance={credits.backgrounds} />
        <CreditRow label="Soundscapes" allowance={credits.soundscapes} />
        <p className="text-xs text-muted-foreground">
          The month&rsquo;s credits come back on {credits.returnDay}. Bought
          credits are used after them and never run out with the month.
        </p>
      </CardContent>
    </Card>
  )
}

function CreditRow({
  label,
  allowance,
}: {
  label: string
  allowance: Allowance
}) {
  const reading = `${allowance.left} of ${allowance.limit} left${
    allowance.packLeft ? `, plus ${allowance.packLeft} bought` : ""
  }`
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <span>{label}</span>
        <span className="text-muted-foreground">{reading}</span>
      </div>
      <Meter
        label={`${label} left this month`}
        value={allowance.left}
        max={allowance.limit}
        valueText={reading}
        size="sm"
      />
    </div>
  )
}

function SpaceCard({ space }: { space: NonNullable<MyPlan["space"]> }) {
  const reading = `${formatBytes(space.usedBytes)} of ${formatBytes(space.limitBytes)} used`
  const full = space.limitBytes > 0 && space.usedBytes >= space.limitBytes * 0.9
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Upload space</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2">
        <p className="text-sm text-muted-foreground">{reading}</p>
        <Meter
          label="Upload space used"
          value={space.usedBytes}
          max={space.limitBytes}
          valueText={reading}
          tone={full ? "warning" : "default"}
          size="sm"
        />
        {space.boughtUntil ? (
          <p className="text-xs text-muted-foreground">
            Includes 10 GB you bought, until {day(space.boughtUntil)}.
          </p>
        ) : null}
        <Link
          to="/uploads"
          className="text-xs text-muted-foreground underline underline-offset-4"
        >
          Open My uploads
        </Link>
      </CardContent>
    </Card>
  )
}
