import * as React from "react"
import { Link, useNavigate } from "@tanstack/react-router"

import { FrontPageRows } from "@/components/marketing/front-page-rows"
import { PublicPageFrame } from "@/components/shell/public-page-frame"
import { BareAuthPage } from "@/components/shell/auth-shell"
import { SignInForm } from "@/components/shell/sign-in-form"
import { Button } from "@/components/ui/button"
import { definePublicPage } from "@/lib/app-options"
import { loadCurrentUser, loadSignInOptions } from "@/lib/api/auth/auth"
import {
  loadBillingOverview,
  loadPublicPricing,
  type PlanOption,
} from "@/lib/api/billing/billing"
import { loadAppFrontPageRows, loadBranding } from "@/lib/api/shell"
import {
  loadPublicListedPages,
  loadPublicPageBlocks,
} from "@/lib/api/content/page-blocks"
import { FRONT_PAGE_PATH } from "@/lib/pages/page-descriptor"
import type { BillingInterval } from "@/lib/billing/pricing-choice"
import {
  APP_FRONT_PAGE_ROW_KIND,
  frontPageHasListedPages,
  frontPageHasPlans,
  frontPageHeroRunsUnderMenu,
  type FrontPageListedPage,
  type FrontPageRow,
} from "@/lib/pages/front-page"

type LandingData = {
  frontPageRows: FrontPageRow[]
  /** True when this address is one of the deployment's own sites. */
  hostIsSite: boolean
  signedIn: boolean
  userRole: string | null
  plans: PlanOption[]
  trialUsed: boolean
  /** What the app's own rows hold on this request, by row id. */
  appRowData: Record<string, unknown>
  /** The cards each Pages list block shows, by row id. */
  listedPages: Record<string, FrontPageListedPage[]>
  /** Which ways in the sign-in card offers. Only read when no rows are saved. */
  signIn: { google: boolean; passkeys: boolean } | null
}

/** How long the signed-in message waits before it moves on by itself. */
const SIGNED_IN_REDIRECT_SECONDS = 5

/**
 * The front door. Saved front-page rows draw first. With no rows, the page is
 * the sign-in card on its own, with no menu, no plans and no footer. Somebody
 * already signed in is told so and sent to their dashboard after a few
 * seconds, with a button to go straight away. Tyler's call on 18 Oct 2026.
 *
 * Billing is loaded only for a composed page with a plans row. Signing in changes where plan buttons lead, but this page deliberately
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
  Component: PricingLanding,
})

export async function loadPricingLandingData(
  rootHostIsSite?: boolean
): Promise<LandingData> {
  // Branding is read only when the caller has not already answered this. The
  // root route has, and reading it twice on the front page is the round trip
  // the argument exists to save.
  const hostIsSite =
    rootHostIsSite ?? (await loadBranding().catch(() => null))?.hostIsSite ?? false
  // The page's own blocks, from the table they live in. Hidden ones never
  // leave the server, so what arrives here is what a visitor may see.
  const savedRows = await loadPublicPageBlocks(FRONT_PAGE_PATH)

  // Asked for only when the page has a row of the app's own on it, and the
  // rows it answers about are the saved ones, read again on the server — never
  // the list the browser is holding.
  //
  // The cards for a Pages list block go alongside, asked for only when the
  // page has one. A failure leaves those blocks as their headings rather than
  // turning the front page into an error page.
  const [fills, listedPages] = await Promise.all([
    savedRows.some((row) => row.kind === APP_FRONT_PAGE_ROW_KIND)
      ? loadAppFrontPageRows().catch(() => null)
      : null,
    frontPageHasListedPages(savedRows)
      ? loadPublicListedPages(FRONT_PAGE_PATH).catch(() => ({}))
      : {},
  ])
  const dropped = new Set(fills?.dropped ?? [])
  // A row the app answered "nothing" for comes off the page, the same as one
  // whose category has nothing published in it.
  const frontPageRows = savedRows.filter((row) => !dropped.has(row.id))
  const appRowData = fills?.data ?? {}

  // A site that has not built a front page gets its header and its footer with
  // nothing between them. Tyler's call on 27 Sep 2026: the block below is the
  // deployment selling itself, and on somebody else's website that is an advert
  // for software they did not come for. The deployment's own address, and a
  // one-site app, still get it.
  if (
    (frontPageRows.length > 0 && !frontPageHasPlans(frontPageRows)) ||
    (frontPageRows.length === 0 && hostIsSite)
  ) {
    return {
      frontPageRows,
      hostIsSite,
      signedIn: false,
      userRole: null,
      plans: [],
      trialUsed: false,
      appRowData,
      listedPages,
      signIn: null,
    }
  }

  // No rows saved: the sign-in card, or the signed-in message. Neither shows
  // a plan, so pricing is never asked for.
  if (frontPageRows.length === 0) {
    const [user, signIn] = await Promise.all([
      loadCurrentUser(),
      loadSignInOptions(),
    ])
    return {
      frontPageRows,
      hostIsSite,
      signedIn: Boolean(user),
      userRole: user?.role ?? null,
      plans: [],
      trialUsed: false,
      appRowData,
      listedPages,
      signIn,
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
    hostIsSite,
    signedIn: Boolean(user),
    userRole: user?.role ?? null,
    plans: pricing.plans,
    trialUsed: Boolean(overview?.trialUsed),
    appRowData,
    listedPages,
    signIn: null,
  }
}

function PricingLanding({ data }: { data: LandingData }) {
  const {
    frontPageRows,
    hostIsSite,
    signedIn,
    userRole,
    plans,
    trialUsed,
    appRowData,
    listedPages,
    signIn,
  } = data
  const navigate = useNavigate()
  const [interval, setInterval] = React.useState<BillingInterval>("monthly")
  const dashboardPath =
    userRole === "admin"
      ? ("/admin/dashboard" as const)
      : ("/home" as const)

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

  // Nothing between the header and the footer, which is what a site with no
  // rows of its own is.
  if (frontPageRows.length === 0 && hostIsSite) {
    return <PublicPageFrame>{null}</PublicPageFrame>
  }

  if (frontPageRows.length > 0) {
    return (
      <PublicPageFrame
        heroRunsUnderMenu={frontPageHeroRunsUnderMenu(frontPageRows)}
      >
        <FrontPageRows
          rows={frontPageRows}
          appRowData={appRowData}
          listedPages={listedPages}
          plans={plans}
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

  if (signedIn) return <SignedInRedirect to={dashboardPath} />

  return (
    <SignInForm
      bare
      google={signIn?.google ?? false}
      passkeys={signIn?.passkeys ?? false}
    />
  )
}

/**
 * What somebody already signed in sees on the front page: a countdown, then
 * their dashboard. The button skips the wait.
 */
function SignedInRedirect({ to }: { to: "/admin/dashboard" | "/home" }) {
  const navigate = useNavigate()
  const [seconds, setSeconds] = React.useState(SIGNED_IN_REDIRECT_SECONDS)

  React.useEffect(() => {
    if (seconds <= 0) {
      void navigate({ to, replace: true })
      return
    }
    const timer = window.setTimeout(() => setSeconds(seconds - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [navigate, seconds, to])

  return (
    <BareAuthPage>
      <div className="flex w-full max-w-sm flex-col items-center gap-6 rounded-xl border bg-card p-6 text-center shadow-sm">
        <p className="text-sm" role="status" aria-live="polite">
          You are logged in. Redirecting in {seconds}{" "}
          {seconds === 1 ? "second" : "seconds"}.
        </p>
        <Button asChild className="w-full">
          <Link to={to} replace>
            Go to dashboard
          </Link>
        </Button>
      </div>
    </BareAuthPage>
  )
}
