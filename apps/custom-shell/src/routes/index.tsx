import * as React from "react"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"

import { PublicPageFrame } from "@/components/shell/public-page-frame"
import { PaymentsOffCard } from "@/components/shared/payments-off-card"
import { PricingTable, type BillingInterval } from "@/components/shared/pricing-table"
import { Button } from "@/components/ui/button"
import { loadCurrentUser } from "@/lib/api/auth"
import { loadBillingOverview, loadPublicPricing } from "@/lib/api/billing"
import { useAppName } from "@/lib/branding"

/**
 * The front door. Everybody sees the same page — the branding the admin set, a
 * headline, and the real plans — because the plans are public and there is
 * nothing here worth hiding from a visitor who has not signed up yet.
 *
 * Signing in only changes the buttons. It deliberately does not mark a
 * subscriber's current plan: that needs their billing overview, which is not
 * public, and `/pricing` already shows it.
 */
export const Route = createFileRoute("/")({
  loader: async () => {
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
    const overview = user
      ? await loadBillingOverview().catch(() => null)
      : null

    return {
      signedIn: Boolean(user),
      plans: pricing.plans,
      billingEnabled: pricing.billingEnabled,
      trialUsed: Boolean(overview?.trialUsed),
    }
  },
  head: () => ({
    meta: [
      {
        name: "description",
        content:
          "Accounts, workspaces and billing, ready to run. Create an account and start on the free plan.",
      },
    ],
  }),
  component: LandingRoute,
})

function LandingRoute() {
  const { signedIn, plans, billingEnabled, trialUsed } = Route.useLoaderData()
  const appName = useAppName()
  const navigate = useNavigate()
  const [interval, setInterval] = React.useState<BillingInterval>("monthly")

  // Picking a plan never checks out from here. A visitor has no account to bill
  // yet, and a member's own plan and the Stripe portal both live on /pricing,
  // so this hands off rather than keeping a second copy of that logic.
  const handleSelect = React.useCallback(async () => {
    await navigate({ to: signedIn ? "/pricing" : "/register" })
  }, [navigate, signedIn])

  return (
    <PublicPageFrame>
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-2 md:gap-3">
        <header className="flex flex-col items-center gap-2 text-center">
          <h1 className="text-2xl font-semibold">Get started with {appName}</h1>
          <p className="text-sm text-muted-foreground">
            Accounts, workspaces and billing, ready to run. Start free and move
            up when you need more.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {signedIn ? (
              <Button asChild>
                <Link to="/home">Go to dashboard</Link>
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
