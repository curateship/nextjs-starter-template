import { createFileRoute } from "@tanstack/react-router"

import { AdminCatalogDashboard } from "@/components/pomodoro/admin-catalog-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import {
  getCatalogAdminErrorMessage,
  loadCatalogPage,
} from "@/lib/api/pomodoro/admin-catalog"
import { readCatalogSearch } from "@/lib/pomodoro/admin-catalog"

export const Route = createFileRoute("/_authenticated/admin/pomodoro-sounds")({
  // Search, filters, sort, page and the open window live in the address, so
  // Back returns this exact list and closes the window.
  validateSearch: readCatalogSearch,
  loaderDeps: ({ search }) => ({ ...search, open: undefined }),
  loader: ({ deps }) =>
    loadCatalogPage({
      kind: "sound",
      search: deps.q ?? "",
      status: deps.status ?? "all",
      access: deps.access ?? "all",
      tag: deps.tag ?? null,
      sort: deps.sort ?? "position",
      direction: deps.direction ?? "asc",
      page: deps.page ?? 1,
    }),
  component: AdminPomodoroSoundsRoute,
  errorComponent: routeErrorComponent(getCatalogAdminErrorMessage),
})

function AdminPomodoroSoundsRoute() {
  const { list, pageSize, tags } = Route.useLoaderData()
  return (
    <AdminCatalogDashboard
      kind="sound"
      search={Route.useSearch()}
      initial={list}
      initialPageSize={pageSize}
      initialTags={tags}
    />
  )
}
