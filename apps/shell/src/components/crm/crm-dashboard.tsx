import * as React from "react"
import { useNavigate, useRouter } from "@tanstack/react-router"

import { CrmBroadcastsTab } from "@/components/crm/crm-broadcasts-tab"
import { CrmPagePanel } from "@/components/crm/crm-page-panel"
import { askForNewSegment, CrmPeopleTab } from "@/components/crm/crm-people-tab"
import { CrmWorkspace } from "@/components/crm/crm-workspace"
import type { InboxFilters } from "@/components/crm/inbox-list-panel"
import { DashboardTabs } from "@/components/shared/dashboard-tabs"
import type { InboxPage } from "@/lib/api/crm/inbox"
import {
  getCrmPageErrorMessage,
  loadCrmBlockFigures,
  loadCrmPage,
  type CrmBlockFigures,
} from "@/lib/api/crm/page"
import type { BroadcastsPage, BroadcastTemplateItem } from "@/lib/api/email/broadcasts"
import type { DevOutboxItem } from "@/lib/api/email/dev-outbox"
import type { SegmentChoice } from "@/lib/api/people/contact-segments"
import type { ContactsPage } from "@/lib/api/people/contacts"
import type { BroadcastBlockDefaults } from "@/lib/broadcasts/blocks"
import { CRM_DEFAULT_INBOX_SORT, type CrmStage } from "@/lib/crm/crm"
import {
  CRM_DEFAULT_STATUS,
  crmTabOf,
  crmTabSearch,
  type CrmSearch,
  type CrmTab,
} from "@/lib/crm/crm-search"
import type { StoredPage } from "@/lib/notes/page-body"
import { showErrorToast } from "@/lib/toast/error-toast"

/** What the route's loader read, for the tab showing. */
export type CrmLoaded =
  | { tab: "inbox"; inbox: InboxPage; outbox: DevOutboxItem[] | null }
  | { tab: "people"; people: ContactsPage }
  | {
      tab: "broadcasts"
      broadcasts: BroadcastsPage
      templates: BroadcastTemplateItem[]
      /** The saved segments a newsletter can be aimed at, by name. */
      segments: SegmentChoice[]
      /** How new email blocks start out on this site. */
      blockDefaults: BroadcastBlockDefaults
    }

/** The left page, drawn for whichever tab is showing with what its blocks point at there. */
export type CrmLeft = (blocks: {
  activeAddress?: string
  activeStage?: CrmStage | "all"
  activeSegment?: string
  openThreadId?: string | null
  onAddress?: (address: string) => void
  onStage?: (stage: CrmStage | "all") => void
  onSegment?: (segmentId: string) => void
  /** Only on the People tab, which holds the segment window. */
  onEditSegment?: (segmentId: string) => void
  onDeleteSegment?: (segmentId: string) => void
  onNewSegment?: () => void
  onOpenThread?: (threadId: string) => void
}) => React.ReactNode

/**
 * The CRM dashboard: one screen for all the app's email (Part C of the CRM
 * task; Tyler, 7 Nov 2026: "I want to consolidate them all into one CRM
 * dashboard ... [broadcast][inbox][contacts]", then of the first pass: "We
 * need to consolidate this into the CRM dashboard too and not linked it
 * outside. The Ui is all over the place as well").
 *
 * - **Left:** the site's page of blocks, the same on every tab, read once
 *   here. Its ⋮ holds the System emails tab.
 * - **Middle:** one header on every tab (`CrmListHeader`), a pill row, and
 *   a table of one shape (`CrmTable`), laid out as Project's.
 * - **Right:** the open record in one frame (`RecordFrame`): a conversation,
 *   a person, a newsletter being written, a template, a system email.
 *
 * Each tab is its own `ThreePanels`, so its open record and its first-row
 * opening start again on a switch. They share one layout key, so a panel
 * dragged wider stays wider on every tab. A block pressed on a tab it does
 * not belong to goes to the tab it does.
 */
export function CrmDashboard({ loaded, search }: { loaded: CrmLoaded; search: CrmSearch }) {
  const navigate = useNavigate({ from: "/admin/crm" })
  const router = useRouter()
  const tab = crmTabOf(search)

  const [crmPage, setCrmPage] = React.useState<StoredPage | null>(null)
  const [figures, setFigures] = React.useState<CrmBlockFigures | null>(null)
  React.useEffect(() => {
    let cancelled = false
    loadCrmPage()
      .then((read) => {
        if (cancelled) return
        setCrmPage(read.page)
        setFigures(read.figures)
      })
      .catch((error) => {
        if (!cancelled) showErrorToast(getCrmPageErrorMessage(error))
      })
    return () => {
      cancelled = true
    }
  }, [])
  // Each fresh read of the tab reads the figures again too, so a count on the
  // left never disagrees with the list beside it. The first is skipped: the
  // page's own read brought them.
  const firstLoad = React.useRef(loaded)
  React.useEffect(() => {
    if (loaded === firstLoad.current) return
    let cancelled = false
    loadCrmBlockFigures()
      .then((next) => {
        if (!cancelled) setFigures(next)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [loaded])

  const goTo = (next: CrmSearch) => void navigate({ search: next })
  const reload = () => void router.invalidate()

  const left: CrmLeft = (blocks) => (
    <CrmPagePanel
      page={crmPage}
      figures={figures}
      onPageChange={setCrmPage}
      onFiguresChanged={reload}
      openSystemEmail={tab === "broadcasts" ? (search.system ?? null) : null}
      onOpenSystemEmail={(kind) =>
        goTo(crmTabSearch("broadcasts", { system: kind, view: search.tab === "broadcasts" ? search.view : undefined }))
      }
      onNewsletterCreated={(broadcastId) =>
        // Read the list again first, then open the new one, as the Broadcasts
        // tab's own New newsletter does: the other way round the row raced in.
        void router.invalidate().then(() => goTo(crmTabSearch("broadcasts", { open: broadcastId })))
      }
      blocks={{
        activeAddress: blocks.activeAddress ?? "",
        activeStage: blocks.activeStage ?? "all",
        activeSegment: blocks.activeSegment ?? "",
        openThreadId: blocks.openThreadId ?? null,
        onAddress:
          blocks.onAddress ?? ((address) => goTo(crmTabSearch("inbox", { to: address || undefined }))),
        onStage:
          blocks.onStage ??
          ((stage) => goTo(crmTabSearch("inbox", { stage: stage === "all" ? undefined : stage }))),
        onSegment:
          blocks.onSegment ??
          ((segmentId) => goTo(crmTabSearch("people", { segment: segmentId || undefined }))),
        onEditSegment: blocks.onEditSegment,
        onDeleteSegment: blocks.onDeleteSegment,
        onNewSegment:
          blocks.onNewSegment ??
          (() => {
            askForNewSegment()
            goTo(crmTabSearch("people"))
          }),
        onOpenThread:
          blocks.onOpenThread ?? ((threadId) => goTo(crmTabSearch("inbox", { open: threadId }))),
      }}
    />
  )

  const tabs = <CrmSectionTabs tab={tab} onTab={(next) => goTo(crmTabSearch(next))} />

  if (loaded.tab === "people") {
    return (
      <CrmPeopleTab key="people" data={loaded.people} search={search} figures={figures} tabs={tabs} left={left} />
    )
  }

  if (loaded.tab === "broadcasts") {
    return (
      <CrmBroadcastsTab
        key="broadcasts"
        page={loaded.broadcasts}
        templates={loaded.templates}
        segments={loaded.segments}
        blockDefaults={loaded.blockDefaults}
        search={search}
        tabs={tabs}
        left={left}
      />
    )
  }

  const filters: InboxFilters = {
    search: search.q ?? "",
    status: search.status ?? CRM_DEFAULT_STATUS,
    stage: search.stage ?? "all",
    view:
      search.view === "unread" || search.view === "saved" || search.view === "waiting" || search.view === "outbox"
        ? search.view
        : "all",
    toAddress: search.to ?? "",
    tag: search.tag ?? "",
    followUpDue: search.due ?? false,
    sort: search.sort === "oldest" || search.sort === "newest" ? search.sort : CRM_DEFAULT_INBOX_SORT,
  }

  const changeFilters = (next: Partial<InboxFilters>) => {
    void navigate({
      search: (previous) => ({
        ...previous,
        ...(next.search !== undefined ? { q: next.search || undefined } : {}),
        ...(next.status !== undefined ? { status: next.status } : {}),
        ...(next.stage !== undefined ? { stage: next.stage } : {}),
        ...(next.view !== undefined
          ? {
              view: next.view === "all" ? undefined : next.view,
              // An outbox email and a conversation are not the same kind of
              // record, so crossing between them lets go of the open one.
              ...(next.view === "outbox" || previous.view === "outbox" ? { open: undefined } : {}),
            }
          : {}),
        ...(next.toAddress !== undefined ? { to: next.toAddress || undefined } : {}),
        ...(next.tag !== undefined ? { tag: next.tag || undefined } : {}),
        ...(next.followUpDue !== undefined ? { due: next.followUpDue || undefined } : {}),
        // The default order stays out of the address.
        ...(next.sort !== undefined
          ? { sort: next.sort === CRM_DEFAULT_INBOX_SORT ? undefined : next.sort }
          : {}),
      }),
      // A filter change is not a place to come back to with Back.
      replace: true,
    })
  }

  return (
    <CrmWorkspace
      key="inbox"
      page={loaded.inbox}
      outbox={loaded.outbox}
      filters={filters}
      search={search}
      openThreadId={search.open ?? null}
      tabs={tabs}
      left={left}
      onFiltersChange={changeFilters}
      onOpenThread={(threadId) =>
        void navigate({
          search: (previous) => ({ ...previous, open: threadId ?? undefined }),
          replace: true,
        })
      }
      onReloadInbox={reload}
    />
  )
}

const TAB_LABELS: Record<CrmTab, string> = {
  broadcasts: "Broadcasts",
  inbox: "Inbox",
  people: "People",
}

/**
 * The middle header's tabs: what the panel holds, in Tyler's order
 * "[broadcast][inbox][contacts]", with contacts named People because it holds
 * leads too.
 */
export function CrmSectionTabs({ tab, onTab }: { tab: CrmTab; onTab: (tab: CrmTab) => void }) {
  return (
    <DashboardTabs
      value={tab}
      onValueChange={(value) => onTab(value as CrmTab)}
      tabs={(["broadcasts", "inbox", "people"] as const).map((value) => ({
        value,
        label: TAB_LABELS[value],
      }))}
    />
  )
}
