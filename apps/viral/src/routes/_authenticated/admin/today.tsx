import { createFileRoute } from "@tanstack/react-router"

import { routeErrorComponent } from "@/components/shell/route-error"
import { TodayPage } from "@/components/viral/today-page"
import { getViralErrorMessage } from "@/lib/api/viral/viral"
import { loadViralTodayFn, searchEveryProjectFn } from "@/lib/api/viral/viral-finding"
import { readSearchText } from "@/lib/nav/list-search"

type TodaySearch = {
  /** Words looked for in every project's videos. */
  q?: string
}

/**
 * Today, Viral's home page (`workspace/docs/today-page.md`): each project's
 * best new and rising videos, the vault's counts, and a search across every
 * project. The search lives in the address, so Back returns to it. The loader
 * reads saved rows only; it never asks YouTube.
 */
export const Route = createFileRoute("/_authenticated/admin/today")({
  validateSearch: (search: Record<string, unknown>): TodaySearch => ({ q: readSearchText(search.q) }),
  loaderDeps: ({ search }) => ({ q: search.q ?? "" }),
  loader: async ({ deps }) => {
    const [today, hits] = await Promise.all([
      loadViralTodayFn(),
      deps.q.trim() ? searchEveryProjectFn(deps.q) : Promise.resolve([]),
    ])
    return { today, hits }
  },
  component: TodayRoute,
  errorComponent: routeErrorComponent(getViralErrorMessage),
})

function TodayRoute() {
  const { today, hits } = Route.useLoaderData()
  const search = Route.useSearch()
  return <TodayPage today={today} hits={hits} q={search.q ?? ""} />
}
