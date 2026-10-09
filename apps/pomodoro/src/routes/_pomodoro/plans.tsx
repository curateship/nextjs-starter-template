import { createFileRoute } from "@tanstack/react-router"

import { PricingPage } from "@/components/pomodoro/pricing-page"
import { visitorRouteErrorComponent } from "@/components/shell/route-error"
import { loadCurrentUser } from "@/lib/api/auth/auth"
import {
  confirmCheckoutSession,
  getBillingErrorMessage,
  loadBillingOverview,
  loadPublicPricing,
} from "@/lib/api/billing/billing"

/**
 * The plans screen, inside the product shell rather than the shell's public
 * frame. Guests see it too: the whole product works without an account, and
 * the cards send a visitor to the sign-up instead of the checkout.
 *
 * The shell's own `/pricing` is a different page and is not linked from the
 * product. See `workspace/docs/plans-page.md`.
 */
export const Route = createFileRoute("/_pomodoro/plans")({
  // Stripe sends a payer back here with `welcome=pro` and the session id
  // (`billing.returnPaths` in `src/app/server-options.ts`).
  validateSearch: (
    search: Record<string, unknown>
  ): { welcome?: "pro"; session_id?: string } => ({
    ...(search.welcome === "pro" ? { welcome: "pro" as const } : {}),
    ...(typeof search.session_id === "string"
      ? { session_id: search.session_id }
      : {}),
  }),
  loaderDeps: ({ search }) => ({
    welcome: search.welcome,
    sessionId: search.session_id,
  }),
  loader: async ({ deps }) => {
    // Plans are public; the overview needs the session, so only ask for it
    // when signed in, and run both together rather than one after the other.
    const user = await loadCurrentUser()
    // Ask Stripe about the purchase before reading the plan, so Pro is on by
    // the time the cards draw even when the webhook is a beat behind. A
    // failed ask is not an error page: the page refreshes briefly instead.
    if (user && deps.sessionId) {
      await confirmCheckoutSession(deps.sessionId).catch(() => null)
    }
    const [pricing, overview] = await Promise.all([
      loadPublicPricing(),
      user ? loadBillingOverview() : null,
    ])

    return {
      signedIn: Boolean(user),
      plans: pricing.plans,
      // The public answer, so a visitor is told the same thing a member is
      // rather than shown a grid on the assumption billing is on.
      billingEnabled: pricing.billingEnabled,
      currentPlanSlug: overview?.planSlug ?? null,
      // Kept, not thrown away: without it the page cannot tell a monthly
      // subscriber's own card from the yearly one it should still sell them.
      currentInterval: overview?.interval ?? null,
      changingPlan: overview?.source === "stripe" && overview.hasStripeCustomer,
      // Somebody we do not know yet is never told they have spent a trial.
      trialUsed: Boolean(overview?.trialUsed),
      // Just back from paying. The line under the headline says so, and the
      // page refreshes briefly if the plan has not caught up yet.
      welcome: deps.welcome === "pro" && Boolean(user),
      isPaid: Boolean(overview?.isPaid),
    }
  },
  head: () => ({
    meta: [
      { title: "Plans — Pomoder" },
      {
        name: "description",
        content:
          "Focus alone for free. A paid plan adds focus rooms, premium sounds and scenes, your own uploads and the long history ranges.",
      },
    ],
  }),
  errorComponent: visitorRouteErrorComponent(getBillingErrorMessage),
  component: PlansRoute,
})

function PlansRoute() {
  return <PricingPage {...Route.useLoaderData()} />
}
