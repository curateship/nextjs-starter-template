import { createFileRoute } from "@tanstack/react-router"

import { tradePageTitle } from "@/app/page-title"
import { routeErrorComponent } from "@/components/shell/route-error"
import { GoalsSettingsPage } from "@/components/trade/trade-settings-page"
import { getGoalLoadErrorMessage, loadGoalSetting } from "@/lib/api/trade/goal"

export const Route = createFileRoute("/_authenticated/admin/settings_/goals")({
  head: ({ matches }) => ({
    meta: [{ title: tradePageTitle(matches, "Settings") }],
  }),
  // The saved goal rides the page in, so the panel never draws empty and asks.
  // What the wallets are worth is the slow half and corrects the line under the
  // number once the exchanges answer.
  loader: loadGoalSetting,
  component: GoalsSettingsPage,
  errorComponent: routeErrorComponent(getGoalLoadErrorMessage),
})
