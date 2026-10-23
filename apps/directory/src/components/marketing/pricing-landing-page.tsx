import * as React from "react"
import { Link, useNavigate } from "@tanstack/react-router"

import { publicContentAlignmentRowClassName } from "@/components/shell/public-content-alignment"
import { FrontPageRows } from "@/components/marketing/front-page-rows"
import { PublicPageFrame } from "@/components/shell/public-page-frame"
import { PricingTable } from "@/components/shared/pricing-table"
import { Button } from "@/components/ui/button"
import { definePublicPage } from "@/lib/app-options"
import { loadCurrentUser } from "@/lib/api/auth/auth"
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
import { useAppName } from "@/lib/branding"
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

        <PricingTable
          plans={plans}
          interval={interval}
          onIntervalChange={setInterval}
          onSelect={handleSelect}
          trialUsed={trialUsed}
          actionLabel="Get started"
        />
      </div>
    </PublicPageFrame>
  )
}
