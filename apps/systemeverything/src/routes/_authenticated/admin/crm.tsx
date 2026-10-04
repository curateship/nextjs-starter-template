import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router"

import { CrmWorkspace } from "@/components/crm/crm-workspace"
import type { InboxFilters } from "@/components/crm/inbox-list-panel"
import { routeErrorComponent } from "@/components/shell/route-error"
import {
  getCrmErrorMessage,
  loadInbox,
} from "@/lib/api/crm/inbox"
import {
  CRM_STAGES,
  CRM_THREAD_STATUSES,
  type CrmStage,
  type CrmThreadStatus,
} from "@/lib/crm/crm"
import { readOpenSearch } from "@/lib/hooks/use-open-from-link"
import { readOneOf, readSearchText } from "@/lib/nav/list-search"

type CrmSearch = {
  /** Which conversation is open in the middle panel. */
  open?: string
  q?: string
  status?: CrmThreadStatus | "all"
  stage?: CrmStage | "all"
  unread?: boolean
  due?: boolean
}

/**
 * The screen's state, read off the address so a reload keeps it and a filtered
 * view can be handed to somebody else. Everything is checked against a fixed
 * list, so a hand-edited address can only fall back to the default.
 */
function readCrmSearch(search: Record<string, unknown>): CrmSearch {
  return {
    ...readOpenSearch(search),
    q: readSearchText(search.q),
    status: readOneOf(search.status, [...CRM_THREAD_STATUSES, "all"] as const),
    stage: readOneOf(search.stage, [...CRM_STAGES, "all"] as const),
    unread: search.unread === true || search.unread === "true" ? true : undefined,
    due: search.due === true || search.due === "true" ? true : undefined,
  }
}

/**
 * What the inbox shows when nobody has chosen: the open conversations.
 *
 * An inbox that also shows the closed ones is an archive, and the question
 * this screen answers is what needs doing. Named once because the loader and
 * the filter control both have to use it — when they disagreed, the control
 * said "Open" and the list showed everything.
 */
const DEFAULT_STATUS = "open" as const

export const Route = createFileRoute("/_authenticated/admin/crm")({
  validateSearch: readCrmSearch,
  // Everything except which conversation is open. Opening one must not refetch
  // the list underneath it — the middle panel fetches its own thread.
  loaderDeps: ({ search }) => ({ ...search, open: undefined }),
  loader: ({ deps }) =>
    loadInbox({
      search: deps.q,
      // The same default the filter control shows. Leaving it undefined asked
      // the server for everything while the control read "Open", so a snoozed
      // conversation sat in the inbox it had been snoozed out of.
      status: deps.status ?? DEFAULT_STATUS,
      stage: deps.stage,
      unreadOnly: deps.unread,
      followUpDue: deps.due,
    }),
  component: AdminCrmRoute,
  errorComponent: routeErrorComponent(getCrmErrorMessage),
})

function AdminCrmRoute() {
  const page = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const router = useRouter()

  const filters: InboxFilters = {
    search: search.q ?? "",
    status: search.status ?? DEFAULT_STATUS,
    stage: search.stage ?? "all",
    unreadOnly: search.unread ?? false,
    followUpDue: search.due ?? false,
  }

  const changeFilters = (next: Partial<InboxFilters>) => {
    void navigate({
      search: (previous) => ({
        ...previous,
        ...(next.search !== undefined
          ? { q: next.search || undefined }
          : {}),
        ...(next.status !== undefined ? { status: next.status } : {}),
        ...(next.stage !== undefined ? { stage: next.stage } : {}),
        ...(next.unreadOnly !== undefined
          ? { unread: next.unreadOnly || undefined }
          : {}),
        ...(next.followUpDue !== undefined
          ? { due: next.followUpDue || undefined }
          : {}),
      }),
      // A filter change is not a place to come back to with Back.
      replace: true,
    })
  }

  return (
    <CrmWorkspace
      page={page}
      filters={filters}
      openThreadId={search.open ?? null}
      onFiltersChange={changeFilters}
      onOpenThread={(threadId) =>
        void navigate({
          search: (previous) => ({ ...previous, open: threadId ?? undefined }),
          replace: true,
        })
      }
      // The loader is the only thing that reads this list, so redrawing it is
      // asking the router to run that loader again rather than fetching a
      // second copy from the page.
      onReloadInbox={() => void router.invalidate()}
    />
  )
}
