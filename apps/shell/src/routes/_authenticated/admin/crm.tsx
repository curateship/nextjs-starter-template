import { createFileRoute } from "@tanstack/react-router"

import { CrmDashboard, type CrmLoaded } from "@/components/crm/crm-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import { getCrmErrorMessage, loadInbox } from "@/lib/api/crm/inbox"
import {
  loadBroadcastBlockDefaults,
  loadBroadcastsPage,
  loadBroadcastTemplates,
} from "@/lib/api/email/broadcasts"
import { loadDevOutbox } from "@/lib/api/email/dev-outbox"
import { loadSegmentChoices } from "@/lib/api/people/contact-segments"
import { loadContactsPage } from "@/lib/api/people/contacts"
import type { ContactSortColumn } from "@/lib/contacts/contact-sort"
import type { CrmInboxSort } from "@/lib/crm/crm"
import {
  CRM_DEFAULT_STATUS,
  crmTabOf,
  readCrmSearch,
  type CrmSearch,
} from "@/lib/crm/crm-search"

/**
 * The CRM: one screen for all the app's email (Tyler, 7 Nov 2026: "I want to
 * consolidate them all into one CRM dashboard"). The middle panel's tabs are
 * Broadcasts, Inbox and People; `src/lib/crm/crm-search.ts` says which
 * address keys belong to which.
 */
export const Route = createFileRoute("/_authenticated/admin/crm")({
  validateSearch: readCrmSearch,
  // Everything except which record is open. Opening one must not refetch the
  // list underneath it: the right panel fetches its own.
  loaderDeps: ({ search }) => ({ ...search, open: undefined, system: undefined }),
  loader: ({ deps }) => loadCrm(deps),
  component: AdminCrmRoute,
  errorComponent: routeErrorComponent(getCrmErrorMessage),
})

async function loadCrm(search: CrmSearch): Promise<CrmLoaded> {
  const tab = crmTabOf(search)

  if (tab === "people") {
    return {
      tab,
      people: await loadContactsPage({
        search: search.q,
        rules: search.filter,
        sort: search.sort as ContactSortColumn | undefined,
        direction: search.direction,
        page: search.page,
        limit: search.size,
        segmentId: search.segment,
        people: search.view === "leads" ? "leads" : undefined,
      }),
    }
  }

  if (tab === "broadcasts") {
    const templatesPill = search.view === "templates"
    // All at once, as the old editor page did: the newsletters, the segments
    // they can go to by name, and how new blocks start out. The saved block
    // setups are a convenience, so a failure there falls back to the
    // built-in ones.
    const [broadcasts, templates, segments, defaults] = await Promise.all([
      loadBroadcastsPage({
        search: search.q,
        limit: 200,
        // All, and Templates, read every newsletter; the others one state.
        group:
          search.view === "drafts" || search.view === "scheduled" || search.view === "sent"
            ? search.view
            : undefined,
      }),
      templatesPill ? loadBroadcastTemplates().then((read) => read.templates) : Promise.resolve([]),
      loadSegmentChoices(),
      loadBroadcastBlockDefaults().catch(() => ({ defaults: {} })),
    ])
    return { tab, broadcasts, templates, segments, blockDefaults: defaults.defaults }
  }

  const view = search.view
  const [inbox, outbox] = await Promise.all([
    loadInbox({
      search: search.q,
      // The same default the filter control shows.
      status: search.status ?? CRM_DEFAULT_STATUS,
      stage: search.stage,
      unreadOnly: view === "unread" || undefined,
      savedOnly: view === "saved" || undefined,
      waitingOnly: view === "waiting" || undefined,
      toAddress: search.to,
      tag: search.tag,
      followUpDue: search.due,
      sort: search.sort as CrmInboxSort | undefined,
    }),
    // Only where the server keeps one; anywhere else the pill is not drawn.
    view === "outbox" ? loadDevOutbox().catch(() => []) : Promise.resolve(null),
  ])
  return { tab: "inbox", inbox, outbox }
}

function AdminCrmRoute() {
  return <CrmDashboard loaded={Route.useLoaderData()} search={Route.useSearch()} />
}
