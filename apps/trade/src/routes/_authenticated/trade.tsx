import { createFileRoute } from "@tanstack/react-router"

import { marketTitleFromMatches } from "@/app/page-title"
import {
  TradeDashboard,
  tradeDashboardLoader,
  tradeDashboardLoaderDeps,
} from "@/components/trade/trade-dashboard-page"
import { readTradeDashboardSearch } from "@/lib/trade/dashboard-view"

/**
 * The Trade dashboard: Overview's widgets and every exchange's chart and
 * tables, picked from the Protocols block on the left page (Tyler, 8 Nov
 * 2026: "consolidate everything into one 3 panel dashboard"). It takes the
 * place of the trading overview and the eleven `/protocols/<x>` dashboards,
 * whose addresses are gone ("we dont need to forward old adress as the site
 * is not open to public yet").
 *
 * This address sits outside `/admin` so that a member reaches it too. What
 * they see is their own: every wallet, order, drawing and widget is keyed to
 * the person who made it, and every call this page makes asks only for a
 * signed-in user.
 *
 * The one-minute staleTime means a market click, or coming back inside that
 * window, paints at once instead of asking the server again. The search
 * params are explained in `@/lib/trade/dashboard-view`.
 */
export const Route = createFileRoute("/_authenticated/trade")({
  validateSearch: readTradeDashboardSearch,
  loaderDeps: tradeDashboardLoaderDeps,
  staleTime: 60_000,
  loader: tradeDashboardLoader,
  head: ({ matches }) => ({
    meta: [{ title: marketTitleFromMatches(matches, "market", "Trade") }],
  }),
  component: TradeDashboard,
})
