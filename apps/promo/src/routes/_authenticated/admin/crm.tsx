import { createFileRoute } from "@tanstack/react-router"

import { CrmDashboard, type CrmLoaded } from "@/components/crm/crm-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import { loadOverviewWidgets } from "@/lib/api/admin-dashboard"
import { getCrmErrorMessage, loadInbox } from "@/lib/api/crm/inbox"
import {
  loadBroadcastBlockDefaults,
  loadBroadcastsPage,
  loadBroadcastTemplates,
} from "@/lib/api/email/broadcasts"
import { loadDevOutbox } from "@/lib/api/email/dev-outbox"
import { loadSystemEmailsPage } from "@/lib/api/email/system-emails"
import { loadSegmentChoices } from "@/lib/api/people/contact-segments"
import { loadContactsPage, loadLeadsPage } from "@/lib/api/people/contacts"
import type { ContactSortColumn } from "@/lib/contacts/contact-sort"
import type { CrmInboxSort } from "@/lib/crm/crm"
import {
  crmTabOf,
  readCrmSearch,
  type CrmSearch,
  type CrmLeadSort,
} from "@/lib/crm/crm-search"

/**
 * The CRM: one screen for all the app's email (Tyler, 7 Nov 2026: "I want to
 * consolidate them all into one CRM dashboard"). The left page's Dashboards
 * block picks the section: Overview, Inbox, People or Broadcasts;
 * `src/lib/crm/crm-search.ts` says which address keys belong to which.
 */
export const Route = createFileRoute("/_authenticated/admin/crm")({
  validateSearch: readCrmSearch,
  // Everything except which record is open. Opening one must not refetch the
  // list underneath it: the right panel fetches its own.
  loaderDeps: ({ search }) => ({ ...search, open: undefined }),
  loader: ({ deps }) => loadCrm(deps),
  component: AdminCrmRoute,
  errorComponent: routeErrorComponent(getCrmErrorMessage),
})

async function loadCrm(search: CrmSearch): Promise<CrmLoaded> {
  const tab = crmTabOf(search)

  if (tab === "overview") {
    return { tab, widgets: await loadOverviewWidgets("crm") }
  }

  if (tab === "leads") {
    return {
      tab,
      leads: await loadLeadsPage({
        search: search.q,
        stage: search.stage === "all" ? undefined : search.stage,
        sort: search.sort as CrmLeadSort | undefined,
        direction: search.direction,
        page: search.page,
      }),
    }
  }

  if (tab === "subscribers") {
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
      }),
    }
  }

  if (tab === "system") {
    // Every email the app sends for itself, and how new blocks start out for
    // the editor on the right; a failure there falls back to the built-in ones.
    const [emails, defaults] = await Promise.all([
      loadSystemEmailsPage(),
      loadBroadcastBlockDefaults().catch(() => ({ defaults: {} })),
    ])
    return { tab, systemEmails: emails.emails, blockDefaults: defaults.defaults }
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
