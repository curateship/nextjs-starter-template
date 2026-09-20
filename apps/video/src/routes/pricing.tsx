import * as React from "react"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"

import { showErrorToast } from "@/lib/toast/error-toast"

import { authLinkClassName } from "@/components/shell/auth-shell"
import { publicContentAlignmentRowClassName } from "@/components/shell/public-content-alignment"
import { PublicPageFrame } from "@/components/shell/public-page-frame"
import { visitorRouteErrorComponent } from "@/components/shell/route-error"
import { PaymentsOffCard } from "@/components/shared/payments-off-card"
import { PricingTable } from "@/components/shared/pricing-table"
import { PlanChangeConfirmation } from "@/components/shared/plan-change-confirmation"
import { Button } from "@/components/ui/button"
import { loadCurrentUser, type AuthUser } from "@/lib/api/auth/auth"
import {
  getBillingErrorMessage,
  loadBillingOverview,
  loadPublicPricing,
  openPlanChange,
  type PlanOption,
  type PlanChangePreview,
} from "@/lib/api/billing/billing"
import { requirePageVisible } from "@/lib/api/content/pages"
import {
  readPricingChoice,
  type BillingInterval,
} from "@/lib/billing/pricing-choice"

export const Route = createFileRoute("/pricing")({
  validateSearch: readPricingChoice,
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    // An admin can hide this page or make it members-only. Asked alongside the
    // session rather than before it: the answer has to arrive before the page
    // draws, not before the page starts fetching, and a public page should not
    // pay for an extra round trip in a row on every visit. A hidden page
    // rejects here and nothing it fetched is ever shown.
    const [, user] = await Promise.all([
      requirePageVisible("/pricing"),
      loadCurrentUser(),
    ])
    // Plans are public; the overview needs the session, so only ask when signed
    // in, and run both together rather than one after the other.
    const [pricing, overview] = await Promise.all([
      loadPublicPricing(),
      user ? loadBillingOverview() : null,
    ])

    return {
      user,
      plans: pricing.plans,
      selectedPlanSlug: pricing.plans.some((plan) => plan.slug === deps.plan)
        ? deps.plan
        : null,
      selectedInterval: deps.interval ?? null,
      // The public answer, so a signed-out visitor is told the same thing a
      // member is rather than being shown a grid on the assumption it is on.
      billingEnabled: pricing.billingEnabled,
      currentPlanSlug: overview?.planSlug ?? null,
      // Kept, not thrown away: without it the page cannot tell a monthly
      // subscriber's own card from the yearly one it should still sell them.
      currentInterval: overview?.interval ?? null,
      changingPlan: overview?.source === "stripe" && overview.hasStripeCustomer,
      // A visitor we do not know yet is never told they have spent a trial.
      trialUsed: Boolean(overview?.trialUsed),
    }
  },
  errorComponent: visitorRouteErrorComponent(getBillingErrorMessage),
  component: PricingRoute,
})

function PricingRoute() {
  const {
    user,
    plans,
    selectedPlanSlug,
    selectedInterval,
    currentPlanSlug,
    currentInterval,
    changingPlan,
    billingEnabled,
    trialUsed,
  } = Route.useLoaderData()
  const navigate = useNavigate()
  // Opens on the period they already pay, so a yearly subscriber is not shown
  // monthly prices for a plan they are on.
  const [interval, setInterval] = React.useState<BillingInterval>(
    selectedInterval ?? currentInterval ?? "monthly"
  )
  const [busyPlanSlug, setBusyPlanSlug] = React.useState<string | null>(null)
  const [preview, setPreview] = React.useState<PlanChangePreview | null>(null)
  const selecting = React.useRef(false)

  const handleSelect = React.useCallback(
    async (plan: PlanOption, selectedInterval: BillingInterval) => {
      if (!user) {
        await navigate({
          to: "/register",
          search: { plan: plan.slug, interval: selectedInterval },
        })
        return
      }

      if (selecting.current) return
      selecting.current = true
      setBusyPlanSlug(plan.slug)
      try {
        const result = await openPlanChange(plan.slug, selectedInterval)
        if ("preview" in result) setPreview(result.preview)
        else window.location.href = result.url
      } catch (checkoutError) {
        showErrorToast(getBillingErrorMessage(checkoutError))
      } finally {
        selecting.current = false
        setBusyPlanSlug(null)
      }
    },
    [navigate, user]
  )

  return (
    <PublicPageFrame>
      <div className="flex w-full flex-col gap-2 md:gap-3">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold">Plans</h1>
          <p className="text-sm text-muted-foreground">
            Start free. Move up when you need more.
          </p>
        </header>

        {preview ? (
          <PlanChangeConfirmation
            preview={preview}
            onCancel={() => setPreview(null)}
          />
        ) : billingEnabled ? (
          <PricingTable
            plans={plans}
            currentPlanSlug={currentPlanSlug ?? undefined}
            selectedPlanSlug={selectedPlanSlug}
            currentInterval={currentInterval}
            interval={interval}
            onIntervalChange={setInterval}
            onSelect={handleSelect}
            busyPlanSlug={busyPlanSlug}
            trialUsed={trialUsed}
            changingPlan={changingPlan}
            actionLabel={
              !user ? "Get started" : changingPlan ? "Change plan" : "Upgrade"
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
      <div className={`flex ${publicContentAlignmentRowClassName}`}>
        <Button asChild variant="outline">
          <Link to="/home" search={{ account: "billing" }}>
            Back to billing
          </Link>
        </Button>
      </div>
    )
  }

  return (
    <p className="text-sm text-muted-foreground">
      Already have an account?{" "}
      <Link to="/login" className={authLinkClassName}>
        Sign in
      </Link>
    </p>
  )
}
