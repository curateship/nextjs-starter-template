import { createFileRoute } from "@tanstack/react-router"

import { DatingWorkspace, type DatingSearch } from "@/components/dating/dating-workspace"
import { routeErrorComponent } from "@/components/shell/route-error"
import { loadDatingDashboard } from "@/lib/api/dating/dashboard"
import { loadSavedViews } from "@/lib/api/saved-views"
import { DATING_SAVED_VIEW_KIND } from "@/lib/dating/lead-views"
import { readLeadView } from "@/lib/dating/leads"
import { datingErrorMessage } from "@/lib/dating/errors"
import { GOOGLE_RETURNS } from "@/lib/dating/options"
import { readOneOf } from "@/lib/nav/list-search"
import { savedViewScreen } from "@/lib/saved-views"

/** Ids are ours, so anything that is not a short plain id is dropped. */
function id(value: unknown): string | undefined {
  return typeof value === "string" && /^[A-Za-z0-9-]{1,40}$/.test(value) ? value : undefined
}

/**
 * The Dating dashboard: the summary, every lead and its status, and the open
 * lead's profile with the chat under it. In the address: the list's view
 * (`readLeadView`: the tab, the search, the filters and the sort),
 * `?open=<id>`, what is open on the right, and `?google=`, how coming back
 * from Google Calendar's screen went, which opens the settings window.
 */
export const Route = createFileRoute("/_authenticated/admin/dating")({
  validateSearch: (search: Record<string, unknown>): DatingSearch => ({
    ...readLeadView(search),
    open: id(search.open),
    google: readOneOf(search.google, GOOGLE_RETURNS),
  }),
  loader: async () => {
    const [dashboard, views] = await Promise.all([loadDatingDashboard(), loadSavedViews(savedViewScreen(DATING_SAVED_VIEW_KIND, ""))])
    return { dashboard, views }
  },
  errorComponent: routeErrorComponent(datingErrorMessage),
  component: DatingRoute,
})

function DatingRoute() {
  const { dashboard, views } = Route.useLoaderData()
  return <DatingWorkspace initial={dashboard} views={views} search={Route.useSearch()} />
}
