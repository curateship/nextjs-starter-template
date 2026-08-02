import * as React from "react"
import { createFileRoute, useRouter } from "@tanstack/react-router"
import { CheckCircle2Icon } from "lucide-react"

import { useOpenAccount } from "@/components/account/account-dialog"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { loadBillingOverview } from "@/lib/api/billing"

const POLL_INTERVAL_MS = 1_500
const POLL_ATTEMPTS = 8

export const Route = createFileRoute("/_authenticated/account/billing_/success")(
  {
    loader: async () => ({ overview: await loadBillingOverview() }),
    component: BillingSuccessRoute,
  }
)

/**
 * Stripe sends people back here the moment they pay, which can be a beat before
 * the webhook lands. Poll briefly rather than showing a stale free plan.
 */
function BillingSuccessRoute() {
  const { overview } = Route.useLoaderData()
  const router = useRouter()
  const openAccount = useOpenAccount()
  const [planName, setPlanName] = React.useState(overview.planName)
  const [confirmed, setConfirmed] = React.useState(overview.isPaid)
  const [waiting, setWaiting] = React.useState(!overview.isPaid)

  React.useEffect(() => {
    if (confirmed) return

    let cancelled = false
    let attempts = 0

    const poll = async () => {
      attempts += 1
      try {
        const latest = await loadBillingOverview()
        if (cancelled) return

        if (latest.isPaid) {
          setPlanName(latest.planName)
          setConfirmed(true)
          setWaiting(false)
          // Refresh the shell so the plan badge and the Upgrade link catch up
          // instead of waiting for the cached shell data to age out.
          void router.invalidate()
          return
        }
      } catch {
        // Keep polling; the next attempt reports the real state.
      }

      if (cancelled) return
      if (attempts >= POLL_ATTEMPTS) {
        setWaiting(false)
        return
      }

      timer = setTimeout(poll, POLL_INTERVAL_MS)
    }

    let timer = setTimeout(poll, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [confirmed, router])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {confirmed ? <CheckCircle2Icon className="h-5 w-5" /> : null}
          {confirmed ? `You are on ${planName}` : "Finishing your payment"}
        </CardTitle>
        <CardDescription>
          {confirmed
            ? "Thanks. Your plan is active and your receipt is in your inbox."
            : waiting
              ? "Stripe is confirming the payment. This usually takes a few seconds."
              : "Stripe has your payment, but we have not seen the confirmation yet. It should appear on your billing page shortly."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Opens Billing right here rather than asking home to open it. Home
            sends a member to Profile and an admin somewhere else entirely, so
            the trip through it is what used to lose the tab. */}
        <Button onClick={() => openAccount("billing")}>Go to billing</Button>
      </CardContent>
    </Card>
  )
}
