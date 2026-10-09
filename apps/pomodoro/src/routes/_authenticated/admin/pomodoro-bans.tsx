import { createFileRoute } from "@tanstack/react-router"

import { AdminSafetyDashboard } from "@/components/pomodoro/admin-safety-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import {
  getSafetyErrorMessage,
  loadPomodoroSafetyPage,
} from "@/lib/api/pomodoro/admin-safety"
import { readOneOf, readPage, readSearchText } from "@/lib/nav/list-search"
import { SAFETY_TABS } from "@/lib/pomodoro/admin-lists"

type SafetySearch = {
  tab?: (typeof SAFETY_TABS)[number]
  q?: string
  page?: number
}

function readSafetySearch(search: Record<string, unknown>): SafetySearch {
  return {
    tab: readOneOf(search.tab, SAFETY_TABS),
    q: readSearchText(search.q),
    page: readPage(search.page),
  }
}

export const Route = createFileRoute("/_authenticated/admin/pomodoro-bans")({
  validateSearch: readSafetySearch,
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) =>
    loadPomodoroSafetyPage({
      tab: deps.tab ?? "bans",
      search: deps.q ?? "",
      page: deps.page ?? 1,
    }),
  component: AdminPomodoroBansRoute,
  errorComponent: routeErrorComponent(getSafetyErrorMessage),
})

function AdminPomodoroBansRoute() {
  const { list, pageSize } = Route.useLoaderData()
  return <AdminSafetyDashboard initial={list} initialPageSize={pageSize} />
}
