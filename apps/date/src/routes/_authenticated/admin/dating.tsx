import { createFileRoute } from "@tanstack/react-router"

import { DatingWorkspace, type DatingSearch } from "@/components/dating/dating-workspace"
import { routeErrorComponent } from "@/components/shell/route-error"
import { loadDatingDashboard } from "@/lib/api/dating/dashboard"
import { datingErrorMessage } from "@/lib/dating/errors"
import { LIST_TABS, PROFILE_FILTERS } from "@/lib/dating/options"
import { readOneOf } from "@/lib/nav/list-search"

/** Ids are ours, so anything that is not a short plain id is dropped. */
function id(value: unknown): string | undefined {
  return typeof value === "string" && /^[A-Za-z0-9-]{1,40}$/.test(value) ? value : undefined
}

/**
 * The Dating dashboard: cards and matches, the one that is open, and the AI
 * and the phone. In the address: `?tab=` the left column's tab, `?filter=`
 * which cards it lists, and `?profile=<id>` or `?match=<id>` the card or
 * conversation open in the middle.
 */
export const Route = createFileRoute("/_authenticated/admin/dating")({
  validateSearch: (search: Record<string, unknown>): DatingSearch => ({
    tab: readOneOf(search.tab, LIST_TABS),
    filter: readOneOf(search.filter, PROFILE_FILTERS),
    profile: id(search.profile),
    match: id(search.match),
  }),
  loader: () => loadDatingDashboard(),
  errorComponent: routeErrorComponent(datingErrorMessage),
  component: DatingRoute,
})

function DatingRoute() {
  return <DatingWorkspace initial={Route.useLoaderData()} search={Route.useSearch()} />
}
