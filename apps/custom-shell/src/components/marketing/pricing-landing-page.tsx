import * as React from "react"
import { Link, useNavigate } from "@tanstack/react-router"

import { publicContentAlignmentRowClassName } from "@/components/shell/public-content-alignment"
import { FrontPageRows } from "@/components/marketing/front-page-rows"
import { PublicPageFrame } from "@/components/shell/public-page-frame"
import { PaymentsOffCard } from "@/components/shared/payments-off-card"
import { PricingTable } from "@/components/shared/pricing-table"
import { Button } from "@/components/ui/button"
import { definePublicPage } from "@/lib/app-options"
import { loadCurrentUser } from "@/lib/api/auth/auth"
import {
  loadBillingOverview,
  loadPublicPricing,
  type PlanOption,
} from "@/lib/api/billing/billing"
import { loadBranding } from "@/lib/api/shell"
import { useAppName } from "@/lib/branding"
import type { BillingInterval } from "@/lib/billing/pricing-choice"
import {
  frontPageHasPlans,
  type FrontPageRow,
} from "@/lib/pages/front-page"

type LandingData = {
  frontPageRows: FrontPageRow[]
  signedIn: boolean
  userRole: string | null
  plans: PlanOption[]
  billingEnabled: boolean
  trialUsed: boolean
}

/**
 * The front door. Saved front-page rows draw first. With no rows, everybody
 * sees the former page unchanged: the branding the admin set, a headline, and
 * the real public plans.
 *
 * Billing is loaded only for the former page or a composed page with a plans
 * row. Signing in changes where plan buttons lead, but this page deliberately
 * does not mark a subscriber's current plan. `/pricing` owns that account
 * detail.
 *
 * This is the shell's own front page rather than the route itself, because an
 * app can replace `/` outright through `landing.page` in its app options. The
 * loader lives in here with it. An app that sells nothing should never make a
 * call for public plans at all.
 */
export const pricingLandingPage = definePublicPage({
  loader: () => loadPricingLandingData(),
  head: () => ({
    meta: [
      {
        name: "description",
        content:
          "Accounts, workspaces and billing, ready to run. Create an account and start on the free plan.",
      },
    ],
  }),
  Component: PricingLanding,
})

export async function loadPricingLandingData(
  rootFrontPageRows?: FrontPageRow[]
): Promise<LandingData> {
  const frontPageRows =
    rootFrontPageRows ?? (await loadBranding()).frontPageRows

  if (frontPageRows.length > 0 && !frontPageHasPlans(frontPageRows)) {
    return {
      frontPageRows,
      signedIn: false,
      userRole: null,
      plans: [],
      billingEnabled: false,
      trialUsed: false,
    }
  }

  // Both are public, so they go together rather than one after the other on a
  // database that takes a second or two to answer.
  const [user, pricing] = await Promise.all([
    loadCurrentUser(),
    loadPublicPricing(),
  ])

  // These cards promise a free trial, so a signed-in visitor who has already
  // spent theirs has to be told here too — /pricing says so, and one page
  // promising what the other refuses is worse than neither saying it. Only
  // asked for when there is somebody to ask about.
  //
  // Never allowed to fail: this is the public front page, and a session that
  // lapsed between the two calls must leave a visitor on marketing copy, not
  // an error page. Falling back reads as "we do not know", which is what the
  // signed-out wording already says.
  const overview = user ? await loadBillingOverview().catch(() => null) : null

  return {
    frontPageRows,
    signedIn: Boolean(user),
    userRole: user?.role ?? null,
    plans: pricing.plans,
    billingEnabled: pricing.billingEnabled,
    trialUsed: Boolean(overview?.trialUsed),
  }
}

function PricingLanding({ data }: { data: LandingData }) {
  const {
    frontPageRows,
    signedIn,
    userRole,
    plans,
    billingEnabled,
    trialUsed,
  } = data
  const appName = useAppName()
  const navigate = useNavigate()
  const [interval, setInterval] = React.useState<BillingInterval>("monthly")
  const signedInAction =
    userRole === "admin"
      ? ({ to: "/admin/dashboard", label: "Go to overview" } as const)
      : ({ to: "/home", label: "Go to home" } as const)

  // Picking a plan never checks out from here. A visitor has no account to bill
  // yet, and a member's own plan and the Stripe portal both live on /pricing,
  // so this hands off rather than keeping a second copy of that logic.
  const handleSelect = React.useCallback(
    async (plan: PlanOption, selectedInterval: BillingInterval) => {
      await navigate({
        to: signedIn ? "/pricing" : "/register",
        search: { plan: plan.slug, interval: selectedInterval },
      })
    },
    [navigate, signedIn]
  )

  if (frontPageRows.length > 0) {
    return (
      <PublicPageFrame>
        <FrontPageRows
          rows={frontPageRows}
          plans={plans}
          billingEnabled={billingEnabled}
          trialUsed={trialUsed}
          interval={interval}
          onIntervalChange={setInterval}
          onSelectPlan={(plan, selectedInterval) =>
            void handleSelect(plan, selectedInterval)
          }
        />
      </PublicPageFrame>
    )
  }

  return (
    <PublicPageFrame>
      <div className="flex w-full flex-col gap-2 md:gap-3">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold">Get started with {appName}</h1>
          <p className="text-sm text-muted-foreground">
            Accounts, workspaces and billing, ready to run. Start free and move
            up when you need more.
          </p>
          <div
            className={`flex flex-wrap gap-2 ${publicContentAlignmentRowClassName}`}
          >
            {signedIn ? (
              <Button asChild>
                <Link to={signedInAction.to}>{signedInAction.label}</Link>
              </Button>
            ) : (
              <>
                <Button asChild>
                  <Link to="/register">Create account</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/login">Sign in</Link>
                </Button>
              </>
            )}
          </div>
        </header>

        {billingEnabled ? (
          <PricingTable
            plans={plans}
            interval={interval}
            onIntervalChange={setInterval}
            onSelect={handleSelect}
            trialUsed={trialUsed}
            actionLabel="Get started"
          />
        ) : (
          <PaymentsOffCard />
        )}
      </div>
    </PublicPageFrame>
  )
}
