import * as React from "react"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"

import { showErrorToast } from "@/lib/error-toast"

import { authLinkClassName } from "@/components/shell/auth-shell"
import { PublicPageFrame } from "@/components/shell/public-page-frame"
import { PricingTable, type BillingInterval } from "@/components/shared/pricing-table"
import { Button } from "@/components/ui/button"
import { loadCurrentUser, type AuthUser } from "@/lib/api/auth"
import {
  getBillingErrorMessage,
  loadBillingOverview,
  loadPublicPlans,
  startCheckout,
  type PlanOption,
} from "@/lib/api/billing"

export const Route = createFileRoute("/pricing")({
  loader: async () => {
    const user = await loadCurrentUser()
    // Plans are public; the overview needs the session, so only ask when signed
    // in, and run both together rather than one after the other.
    const [plans, overview] = await Promise.all([
      loadPublicPlans(),
      user ? loadBillingOverview() : null,
    ])

    return {
      user,
      plans,
      currentPlanSlug: overview?.planSlug ?? null,
      billingEnabled: overview?.billingEnabled ?? true,
    }
  },
  component: PricingRoute,
})

function PricingRoute() {
  const { user, plans, currentPlanSlug, billingEnabled } = Route.useLoaderData()
  const navigate = useNavigate()
  const [interval, setInterval] = React.useState<BillingInterval>("monthly")
  const [busyPlanSlug, setBusyPlanSlug] = React.useState<string | null>(null)

  const handleSelect = React.useCallback(
    async (plan: PlanOption, selectedInterval: BillingInterval) => {
      if (!user) {
        await navigate({ to: "/register" })
        return
      }

      setBusyPlanSlug(plan.slug)
      try {
        const { url } = await startCheckout(plan.slug, selectedInterval)
        window.location.href = url
      } catch (checkoutError) {
        showErrorToast(getBillingErrorMessage(checkoutError))
        setBusyPlanSlug(null)
      }
    },
    [navigate, user]
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

        {!billingEnabled ? (
          <p className="text-center text-sm text-muted-foreground">
            Payments are turned off right now, so upgrades are unavailable.
          </p>
        ) : null}

        <PricingTable
          plans={plans}
          currentPlanSlug={currentPlanSlug ?? undefined}
          interval={interval}
          onIntervalChange={setInterval}
          onSelect={handleSelect}
          busyPlanSlug={busyPlanSlug}
          disabled={!billingEnabled}
          actionLabel={user ? "Upgrade" : "Get started"}
        />

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
