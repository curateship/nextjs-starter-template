import * as React from "react"
import { Loader2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  confirmPlanChange,
  getBillingErrorMessage,
  loadBillingOverview,
  type PlanChangePreview,
} from "@/lib/api/billing/billing"
import { PLAN_PREVIEW_SECONDS } from "@/lib/billing/plan-change-window"
import { formatStripeMoney } from "@/lib/format/money"
import { formatDate } from "@/lib/format/format-time"
import { showErrorToast } from "@/lib/toast/error-toast"

/** Inline because Billing already lives inside the account dialog. */
export function PlanChangeConfirmation({
  preview,
  onClose,
}: {
  preview: PlanChangePreview
  /** Cancel, Close, and an out-of-date preview all hand the page back. */
  onClose: () => void
}) {
  const [saving, setSaving] = React.useState(false)
  const [submitted, setSubmitted] = React.useState(false)
  const [waiting, setWaiting] = React.useState(false)
  const [checks, setChecks] = React.useState(0)
  const busy = React.useRef(false)
  const expired = React.useRef(false)
  const heading = React.useRef<HTMLHeadingElement>(null)

  React.useEffect(() => {
    heading.current?.focus()
    heading.current?.scrollIntoView({ block: "nearest" })
  }, [])

  React.useEffect(() => {
    if (!submitted) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let attempts = 0
    async function check() {
      try {
        const overview = await loadBillingOverview()
        if (cancelled) return
        if (
          overview.planSlug === preview.planSlug &&
          overview.interval === preview.interval
        ) {
          window.location.reload()
          return
        }
        if (++attempts < 15) {
          timer = setTimeout(() => void check(), 1000)
        } else {
          setWaiting(false)
        }
      } catch (error) {
        if (!cancelled) {
          setWaiting(false)
          showErrorToast(getBillingErrorMessage(error))
        }
      }
    }
    void check()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [submitted, checks, preview.planSlug, preview.interval])

  // A request already in flight gets the server's own answer first.
  const expire = React.useEffectEvent(() => {
    expired.current = true
    if (submitted || busy.current) return
    showErrorToast(getBillingErrorMessage("PLAN_PREVIEW_EXPIRED"))
    onClose()
  })

  React.useEffect(() => {
    const timer = setTimeout(expire, PLAN_PREVIEW_SECONDS * 1000)
    return () => clearTimeout(timer)
  }, [])

  async function confirm() {
    if (busy.current) return
    busy.current = true
    setSaving(true)
    try {
      await confirmPlanChange(preview.token)
      setWaiting(true)
      setSubmitted(true)
    } catch (error) {
      showErrorToast(getBillingErrorMessage(error))
      // The figures on this card are no longer what Stripe would charge.
      if (
        expired.current ||
        (error instanceof Error &&
          error.message.includes("PLAN_PREVIEW_EXPIRED"))
      ) {
        onClose()
      }
    } finally {
      busy.current = false
      setSaving(false)
    }
  }

  // Named from what Stripe takes today, so the button never promises a free
  // switch that charges the card, or a charge that waits for the next bill.
  const chargesNow = preview.billsNow && preview.amountDue > 0

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle as="h3" ref={heading} tabIndex={-1}>
          {submitted
            ? "Plan change submitted"
            : `Change to ${preview.planName}?`}
        </CardTitle>
        <CardDescription>
          {submitted
            ? "Stripe accepted your change. While this stays open, the page refreshes with your new plan once Stripe confirms it."
            : "The new plan takes effect when you confirm. Review the billing change below."}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <dl className="grid gap-2 text-sm">
          <div className="flex flex-wrap justify-between gap-2">
            <dt>New price before tax and discounts</dt>
            <dd>
              {formatStripeMoney(preview.recurringAmount, preview.currency)}{" "}
              {preview.interval === "yearly" ? "per year" : "per month"}
            </dd>
          </div>
          {preview.prorationAmount !== 0 ? (
            <div className="flex flex-wrap justify-between gap-2">
              <dt>
                {preview.prorationAmount < 0
                  ? "Unused-time credit before tax"
                  : "Proration before tax"}
              </dt>
              <dd>
                {formatStripeMoney(
                  Math.abs(preview.prorationAmount),
                  preview.currency
                )}
              </dd>
            </div>
          ) : null}
          <div className="flex flex-wrap justify-between gap-2">
            <dt>
              {preview.billsNow
                ? "Estimated payment today"
                : "Next invoice estimate"}
            </dt>
            <dd>{formatStripeMoney(preview.amountDue, preview.currency)}</dd>
          </div>
        </dl>
        <p className="text-sm text-muted-foreground">
          {preview.trialEndsAt
            ? `Your existing trial ends on ${formatDate(preview.trialEndsAt)}. Changing plans does not start another trial.`
            : preview.billsNow
              ? "Stripe starts a new paid billing period today and applies any unused-time credit to the invoice."
              : "Your renewal date stays the same. Stripe applies the charge or credit for the remaining time to your next invoice."}{" "}
          Credits reduce future bills and are not cash refunds. Taxes, discounts
          and any existing balance are included in the invoice estimate. Future
          usage or billing changes can change that estimate.
        </p>
        {submitted ? (
          <p role="status" className="flex items-center gap-2 text-sm">
            {waiting ? <Loader2Icon className="size-4 animate-spin" /> : null}
            {waiting
              ? "Waiting for billing confirmation..."
              : "Confirmation is taking longer than usual. You can check again without submitting another change."}
          </p>
        ) : null}
      </CardContent>
      <CardFooter className="justify-end gap-2">
        {submitted ? (
          <>
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
            <Button
              variant="outline"
              disabled={waiting}
              onClick={() => {
                setWaiting(true)
                setChecks((value) => value + 1)
              }}
            >
              Check status
            </Button>
          </>
        ) : (
          <>
            <Button variant="outline" disabled={saving} onClick={onClose}>
              Cancel
            </Button>
            <Button disabled={saving} onClick={() => void confirm()}>
              {saving ? <Loader2Icon className="size-4 animate-spin" /> : null}
              {chargesNow
                ? `Pay ${formatStripeMoney(preview.amountDue, preview.currency)} and switch`
                : `Switch to ${preview.planName}`}
            </Button>
          </>
        )}
      </CardFooter>
    </Card>
  )
}
