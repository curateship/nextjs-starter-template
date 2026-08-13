import { createFileRoute } from "@tanstack/react-router"

import { ContactsPage } from "@/components/broadcasts/contacts-page"
import { routeErrorComponent } from "@/components/shell/route-error"
import {
  getContactLoadErrorMessage,
  loadContactsPage,
} from "@/lib/api/people/contacts"
import { CONTACT_SORT_COLUMNS } from "@/lib/contacts/contact-sort"
import {
  readSegmentRulesParam,
  type SegmentRules,
} from "@/lib/contacts/contact-segments"
import { DASHBOARD_ROWS_PER_PAGE_OPTIONS } from "@/lib/custom-shell"
import { readOpenSearch } from "@/lib/hooks/use-open-from-link"
import {
  readDirection,
  readOneOf,
  readPage,
  readSearchText,
} from "@/lib/nav/list-search"

type ContactsSearch = {
  /** Whose details window is open. */
  open?: string
  q?: string
  sort?: (typeof CONTACT_SORT_COLUMNS)[number]
  direction?: "asc" | "desc"
  page?: number
  /** Rows per page. Absent means the workspace's own setting, read on the server. */
  size?: number
  /** The list's filters, written in the same rules a segment is. */
  filter?: SegmentRules
}

/**
 * The list's state, read off the address so a reload keeps it and a filtered
 * link can be handed to somebody else. Every value is checked against a fixed
 * list, a range, or the segment rule schema, so a hand-edited address can only
 * ever fall back to the default.
 */
function readContactsSearch(
  search: Record<string, unknown>
): ContactsSearch {
  return {
    ...readOpenSearch(search),
    q: readSearchText(search.q),
    sort: readOneOf(search.sort, CONTACT_SORT_COLUMNS),
    direction: readDirection(search.direction),
    page: readPage(search.page),
    size: readOneOf(
      String(search.size),
      DASHBOARD_ROWS_PER_PAGE_OPTIONS.map(String)
    )
      ? Number(search.size)
      : undefined,
    filter: readSegmentRulesParam(search.filter),
  }
}

export const Route = createFileRoute("/_authenticated/admin/contacts")({
  validateSearch: readContactsSearch,
  // The first paint already answers the address it was opened at, so a shared
  // filtered link is filtered before any of our own fetching happens.
  // Everything except which window is open. `open` names a person already on
  // the page, so opening one must not refetch the whole list underneath it.
  loaderDeps: ({ search }) => ({ ...search, open: undefined }),
  // The loader is the only thing that fetches this list, so one change to the
  // address is one trip to the server — not a loader fetch and then a second
  // one from the page correcting it.
  loader: ({ deps }) =>
    loadContactsPage({
      search: deps.q,
      rules: deps.filter,
      sort: deps.sort,
      direction: deps.direction,
      page: deps.page,
      limit: deps.size,
    }),
  component: AdminContactsRoute,
  errorComponent: routeErrorComponent(getContactLoadErrorMessage),
})

function AdminContactsRoute() {
  return <ContactsPage data={Route.useLoaderData()} />
}
