import { createFileRoute } from "@tanstack/react-router"

import { AdminCatalogDashboard } from "@/components/pomodoro/admin-catalog-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import {
  getCatalogAdminErrorMessage,
  loadCatalogPage,
} from "@/lib/api/pomodoro/admin-catalog"
import { readCatalogSearch } from "@/lib/pomodoro/admin-catalog"

export const Route = createFileRoute("/_authenticated/admin/pomodoro-themes")({
  // Search, filters, sort, page and the open window live in the address, so
  // Back returns this exact list and closes the window.
  validateSearch: readCatalogSearch,
  loaderDeps: ({ search }) => ({ ...search, open: undefined }),
  loader: ({ deps }) =>
    loadCatalogPage({
      kind: "theme",
      search: deps.q ?? "",
      status: deps.status ?? "all",
      access: deps.access ?? "all",
      tag: deps.tag ?? null,
      sort: deps.sort ?? "position",
      direction: deps.direction ?? "asc",
      page: deps.page ?? 1,
    }),
  component: AdminPomodoroThemesRoute,
  errorComponent: routeErrorComponent(getCatalogAdminErrorMessage),
})

function AdminPomodoroThemesRoute() {
  const { list, pageSize, tags } = Route.useLoaderData()
  return (
    <AdminCatalogDashboard
      kind="theme"
      search={Route.useSearch()}
      initial={list}
      initialPageSize={pageSize}
      initialTags={tags}
    />
  )
}
