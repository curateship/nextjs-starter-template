import * as React from "react"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"

import { showErrorToast } from "@/lib/error-toast"

import { authLinkClassName } from "@/components/shell/auth-shell"
import { PublicPageFrame } from "@/components/shell/public-page-frame"
import { PaymentsOffCard } from "@/components/shared/payments-off-card"
import { PricingTable, type BillingInterval } from "@/components/shared/pricing-table"
import { Button } from "@/components/ui/button"
import { loadCurrentUser, type AuthUser } from "@/lib/api/auth"
import {
  getBillingErrorMessage,
  loadBillingOverview,
  loadPublicPricing,
  openPlanChange,
  type PlanOption,
} from "@/lib/api/billing"

export const Route = createFileRoute("/pricing")({
  loader: async () => {
    const user = await loadCurrentUser()
    // Plans are public; the overview needs the session, so only ask when signed
    // in, and run both together rather than one after the other.
    const [pricing, overview] = await Promise.all([
      loadPublicPricing(),
      user ? loadBillingOverview() : null,
    ])

    return {
      user,
      plans: pricing.plans,
      // The public answer, so a signed-out visitor is told the same thing a
      // member is rather than being shown a grid on the assumption it is on.
      billingEnabled: pricing.billingEnabled,
      currentPlanSlug: overview?.planSlug ?? null,
      // Kept, not thrown away: without it the page cannot tell a monthly
      // subscriber's own card from the yearly one it should still sell them.
      currentInterval: overview?.interval ?? null,
      // An existing Stripe subscription changes in the portal, never through a
      // second checkout — see the comment on `handleSelect`.
      manageInStripe: Boolean(overview?.isPaid && overview.hasStripeCustomer),
    }
  },
  component: PricingRoute,
})

function PricingRoute() {
  const {
    user,
    plans,
    currentPlanSlug,
    currentInterval,
    manageInStripe,
    billingEnabled,
  } = Route.useLoaderData()
  const navigate = useNavigate()
  // Opens on the period they already pay, so a yearly subscriber is not shown
  // monthly prices for a plan they are on.
  const [interval, setInterval] = React.useState<BillingInterval>(
    currentInterval ?? "monthly"
  )
  const [busyPlanSlug, setBusyPlanSlug] = React.useState<string | null>(null)

  const handleSelect = React.useCallback(
    async (plan: PlanOption, selectedInterval: BillingInterval) => {
      if (!user) {
        await navigate({ to: "/register" })
        return
      }

      setBusyPlanSlug(plan.slug)
      try {
        const { url } = await openPlanChange(
          manageInStripe,
          plan.slug,
          selectedInterval
        )
        window.location.href = url
      } catch (checkoutError) {
        showErrorToast(getBillingErrorMessage(checkoutError))
        setBusyPlanSlug(null)
      }
    },
    [manageInStripe, navigate, user]
  )

  return (
    <PublicPageFrame>
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-2 md:gap-3">
        <header className="flex flex-col gap-2 text-center">
          <h1 className="text-2xl font-semibold">Plans</h1>
          <p className="text-sm text-muted-foreground">
            Start free. Move up when you need more.
          </p>
        </header>

        {billingEnabled ? (
          <PricingTable
            plans={plans}
            currentPlanSlug={currentPlanSlug ?? undefined}
            currentInterval={currentInterval}
            interval={interval}
            onIntervalChange={setInterval}
            onSelect={handleSelect}
            busyPlanSlug={busyPlanSlug}
            actionLabel={
              !user ? "Get started" : manageInStripe ? "Change in Stripe" : "Upgrade"
            }
          />
        ) : (
          <PaymentsOffCard />
        )}

        <PricingFooter user={user} />
      </div>
    </PublicPageFrame>
  )
}

function PricingFooter({ user }: { user: AuthUser | null }) {
  if (user) {
    return (
      <div className="flex justify-center">
        <Button asChild variant="outline">
          <Link to="/" search={{ account: "billing" }}>
            Back to billing
          </Link>
        </Button>
      </div>
    )
  }

  return (
    <p className="text-center text-sm text-muted-foreground">
      Already have an account?{" "}
      <Link to="/login" className={authLinkClassName}>
        Sign in
      </Link>
    </p>
  )
}
