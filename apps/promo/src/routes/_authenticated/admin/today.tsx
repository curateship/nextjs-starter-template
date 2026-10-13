import { createFileRoute } from "@tanstack/react-router"

import { TodayDashboard, type TodayTab } from "@/components/social/today/today-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import { getTodayErrorMessage, loadToday } from "@/lib/api/social/today"

/**
 * Today: every project's best posts and every reply waiting for an answer,
 * first under Projects in the left menu. `?tab=replies` opens the replies.
 */
export const Route = createFileRoute("/_authenticated/admin/today")({
  validateSearch: (search: Record<string, unknown>): { tab?: TodayTab } => ({
    tab: search.tab === "replies" ? "replies" : undefined,
  }),
  loader: () => loadToday(),
  component: TodayRoute,
  errorComponent: routeErrorComponent(getTodayErrorMessage),
})

function TodayRoute() {
  const { tab } = Route.useSearch()
  return <TodayDashboard initial={Route.useLoaderData()} tab={tab ?? "posts"} />
}
