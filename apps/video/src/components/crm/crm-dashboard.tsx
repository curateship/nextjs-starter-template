import * as React from "react"
import { useNavigate, useRouter } from "@tanstack/react-router"
import { HandshakeIcon, InboxIcon, MailCheckIcon, MegaphoneIcon, UsersIcon, type LucideIcon } from "lucide-react"

import { CrmBroadcastsTab } from "@/components/crm/crm-broadcasts-tab"
import { CrmSegmentActionsContext, useCrmFrame, type CrmSegmentActions } from "@/components/crm/crm-frame"
import { CrmPagePanel } from "@/components/crm/crm-page-panel"
import { askForNewSegment, CrmPeopleTab } from "@/components/crm/crm-people-tab"
import { CrmSystemEmailsTab } from "@/components/crm/crm-system-emails-tab"
import { CrmLeadsTab } from "@/components/crm/crm-leads-tab"
import { CrmWorkspace } from "@/components/crm/crm-workspace"
import type { InboxFilters } from "@/components/crm/inbox-list-panel"
import { RightCoverProvider } from "@/components/shared/notes/page-cover"
import { useShellRuntime } from "@/components/shell/shell-layout"
import { middleGutterClassName, MiddleHeading, PanelReopenButton, ThreePanels } from "@/components/shared/three-panels"
import { useWidgetLayout } from "@/components/shared/widgets/use-widget-layout"
import { WidgetGrid } from "@/components/shared/widgets/widget-grid"
import { ManageWidgetsProvider, WidgetSettings } from "@/components/shared/widgets/widget-menus"
import { useTabbedMenuState } from "@/components/shared/notes/tabbed-menu"
import { ErrorRow } from "@/components/ui/error-row"
import { widgetsShown, type WidgetLayout } from "@/lib/admin-dashboard/overview-widgets"
import { ANALYTICS_DEFAULT_RANGE } from "@/lib/analytics/range"
import type { InboxPage } from "@/lib/api/crm/inbox"
import {
  getCrmPageErrorMessage,
  loadCrmBlockFigures,
  loadCrmPage,
  type CrmBlockFigures,
} from "@/lib/api/crm/page"
import type { BroadcastsPage, BroadcastTemplateItem } from "@/lib/api/email/broadcasts"
import type { DevOutboxItem } from "@/lib/api/email/dev-outbox"
import type { SystemEmailListItem } from "@/lib/api/email/system-emails"
import type { SegmentChoice } from "@/lib/api/people/contact-segments"
import type { ContactsPage, LeadsPage } from "@/lib/api/people/contacts"
import type { BroadcastBlockDefaults } from "@/lib/broadcasts/blocks"
import { CRM_DEFAULT_INBOX_SORT, CRM_STAGES, type CrmStage } from "@/lib/crm/crm"
import {
  CRM_TAB_LABELS,
  CRM_TABS,
  crmTabOf,
  crmTabSearch,
  type CrmSearch,
  type CrmTab,
} from "@/lib/crm/crm-search"
import { panelLayoutKey } from "@/lib/layout/panel-layout"
import { rememberedLoad, useLoad } from "@/lib/hooks/use-load"
import { useListSearchNavigate } from "@/lib/nav/list-search"
import type { StoredPage } from "@/lib/notes/page-body"
import { cn } from "@/lib/utils"

/** What the route's loader read, for the section showing. */
export type CrmLoaded =
  | { tab: "overview"; widgets: WidgetLayout }
  | { tab: "inbox"; inbox: InboxPage; outbox: DevOutboxItem[] | null }
  | { tab: "leads"; leads: LeadsPage }
  | { tab: "subscribers"; people: ContactsPage }
  | {
      tab: "broadcasts"
      broadcasts: BroadcastsPage
      templates: BroadcastTemplateItem[]
      /** The saved segments a newsletter can be aimed at, by name. */
      segments: SegmentChoice[]
      /** How new email blocks start out on this site. */
      blockDefaults: BroadcastBlockDefaults
    }
  | {
      tab: "system"
      systemEmails: SystemEmailListItem[]
      /** How new email blocks start out, for the editor on the right. */
      blockDefaults: BroadcastBlockDefaults
    }

/** Each section's icon, at the start of the middle's header. Overview has no header. */
const SECTION_ICONS: Record<Exclude<CrmTab, "overview">, LucideIcon> = {
  inbox: InboxIcon,
  leads: HandshakeIcon,
  subscribers: UsersIcon,
  broadcasts: MegaphoneIcon,
  system: MailCheckIcon,
}

/** What the record panel is called before the section showing has said. */
const RECORD_LABELS: Record<Exclude<CrmTab, "overview">, string> = {
  inbox: "Conversation",
  leads: "Lead",
  subscribers: "Subscriber",
  broadcasts: "Newsletter",
  system: "Email",
}

/** The name the left page's read is kept under between visits. */
const CRM_PAGE_READ = "crm-page"

/**
 * The CRM dashboard: one screen for all the app's email (Part C of the CRM
 * task; Tyler, 7 Nov 2026: "I want to consolidate them all into one CRM
 * dashboard"), laid out as the Admin dashboard since 8 Nov 2026 ("We need to
 * get the CRM dashboard up to date with the new admin dashboard. We dont have
 * any CRM widgets so lets leave it empty for now").
 *
 * - **Left:** the site's page of blocks. Its fixed Dashboards block picks
 *   the section: Overview, Inbox, People or Broadcasts. Its ⋮ holds General,
 *   Emails, System emails and Widgets.
 * - **Middle:** one header (the section's icon and name, then its own
 *   toolbar), a pill row, and a table of one shape (`CrmTable`). Overview
 *   has no middle panel: its widgets sit straight on the dashboard and take
 *   the right panel's room too, as on Admin. The CRM has no widgets of its
 *   own yet, so its spots say so until an app adds one (`crm.widgets`).
 * - **Right:** the open record in one frame (`RecordFrame`): a
 *   conversation, a person, a newsletter being written, a template, a system
 *   email.
 *
 * The frame stays while the section changes: only the middle and the record
 * on the right are the section's (`crm-frame.tsx`), so the left page, its ⋮
 * and anything typed there carry on across a switch. A shut side panel comes
 * back from a button in the middle's header; Overview, with no header, keeps
 * the knob. A block pressed on a section it does not belong to goes to the
 * section it does.
 */
export function CrmDashboard({ loaded, search }: { loaded: CrmLoaded; search: CrmSearch }) {
  const navigate = useNavigate({ from: "/admin/crm" })
  const router = useRouter()
  const setListSearch = useListSearchNavigate()
  const tab = crmTabOf(search)
  const overview = loaded.tab === "overview"

  // The left page, and the figures its blocks draw, read once here.
  // Both start from the last visit's copy, so coming back from Admin draws
  // the page, its cover and its counts at once and reads again behind them.
  const [figures, setFigures] = React.useState<CrmBlockFigures | null>(
    () => rememberedLoad<Awaited<ReturnType<typeof loadCrmPage>>>(CRM_PAGE_READ)?.figures ?? null
  )
  const pageRead = useLoad(loadCrmPage, getCrmPageErrorMessage, {
    remember: CRM_PAGE_READ,
    onLoad: (read) => setFigures(read.figures),
  })
  const crmPage = pageRead.data?.page ?? null
  const setCrmPage = (page: StoredPage) => pageRead.setData((current) => (current ? { ...current, page } : current))
  // Each fresh read of the section reads the figures again too, so a count
  // on the left never disagrees with the list beside it. The first is
  // skipped: the page's own read brought them.
  const firstLoad = React.useRef(loaded)
  const setPageRead = pageRead.setData
  React.useEffect(() => {
    if (loaded === firstLoad.current) return
    let cancelled = false
    loadCrmBlockFigures()
      .then((next) => {
        if (cancelled) return
        setFigures(next)
        // Into the kept copy too, so coming back never shows older counts.
        setPageRead((current) => (current ? { ...current, figures: next } : current))
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [loaded, setPageRead])

  // Overview's widgets, held here so the left ⋮'s Widgets tab can set them
  // on every section, and the Dashboards block can count them.
  const widgets = useWidgetLayout("crm", loaded.tab === "overview" ? loaded.widgets : null)
  // The left ⋮, held here so a widget's Manage widgets opens it at Widgets.
  const leftMenu = useTabbedMenuState()
  const { openAt: openLeftMenuAt } = leftMenu
  const manageWidgets = React.useCallback(() => openLeftMenuAt("widgets"), [openLeftMenuAt])

  // People's segment windows, while People shows (`useHandSegmentActions`).
  const [segmentActions, setSegmentActions] = React.useState<CrmSegmentActions | null>(null)

  const goTo = (next: CrmSearch) => void navigate({ search: next })
  const reload = () => void router.invalidate()

  const filters: InboxFilters = {
    search: search.q ?? "",
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

  const openThread = (threadId: string | null) =>
    void navigate({
      search: (previous) => ({ ...previous, open: threadId ?? undefined }),
      replace: true,
    })

  // What the left page's blocks point at. On Inbox they narrow the list in
  // place, keeping its other filters; on People a segment shows in place,
  // the open person staying open. Anywhere else a block goes to the section
  // it belongs to, starting that section's address afresh.
  const onInbox = loaded.tab === "inbox"
  const onPeople = loaded.tab === "subscribers"
  const onLeads = loaded.tab === "leads"
  // The sections the Dashboards block leaves out, kept with the site's look
  // as the Admin dashboard's are.
  const { config, onConfigChange } = useShellRuntime()
  const hiddenSections = (config.styling.hiddenCrmSections ?? []).filter((section): section is CrmTab =>
    (CRM_TABS as readonly string[]).includes(section)
  )
  const hiddenLeadStages = (config.styling.hiddenLeadStages ?? []).filter((stage): stage is CrmStage =>
    (CRM_STAGES as readonly string[]).includes(stage)
  )
  const leadStage = onLeads && search.stage && search.stage !== "all" ? search.stage : null
  const blocks = {
    section: tab,
    activeLeadStage: onLeads ? (leadStage ?? ("all" as const)) : null,
    // On Leads the list narrows in place; anywhere else Leads opens.
    onLeadStage: (stage: CrmStage | "all") => {
      const next = stage === "all" ? undefined : stage
      if (onLeads) setListSearch({ stage: next, page: undefined, open: undefined })
      else goTo(crmTabSearch("leads", { stage: next }))
    },
    hiddenLeadStages,
    onHiddenLeadStagesChange: (hidden: CrmStage[]) =>
      onConfigChange({ ...config, styling: { ...config.styling, hiddenLeadStages: hidden } }),
    onPickSection: (next: CrmTab) => goTo(crmTabSearch(next)),
    hiddenSections,
    onHiddenSectionsChange: (hidden: CrmTab[]) =>
      onConfigChange({ ...config, styling: { ...config.styling, hiddenCrmSections: hidden } }),
    sectionOrder: config.styling.crmSectionOrder,
    onSectionOrderChange: (order: string[]) =>
      onConfigChange({ ...config, styling: { ...config.styling, crmSectionOrder: order } }),
    widgetCount: widgets.layout ? widgetsShown(widgets.layout) : null,
    activeAddress: onInbox ? filters.toAddress.toLowerCase() : "",
    openThreadId: onInbox && filters.view !== "outbox" ? (search.open ?? null) : null,
    activeSegment: onPeople ? (search.segment ?? "") : "",
    onAddress: (address: string) =>
      onInbox ? changeFilters({ toAddress: address }) : goTo(crmTabSearch("inbox", { to: address || undefined })),
    onOpenThread: (threadId: string) => {
      if (!onInbox) return goTo(crmTabSearch("inbox", { open: threadId }))
      // A conversation pressed on the left opens in the inbox, so the Outbox
      // pill gives way to it.
      if (filters.view === "outbox") changeFilters({ view: "all" })
      openThread(threadId)
    },
    onSegment: (segmentId: string) =>
      onPeople
        ? setListSearch(
            segmentId
              ? // Its people as saved: the search goes too, so the list holds
                // the number the segment's row shows.
                { filter: undefined, segment: segmentId, q: undefined, page: undefined }
              : { filter: undefined, segment: undefined, page: undefined }
          )
        : goTo(crmTabSearch("subscribers", { segment: segmentId || undefined })),
    onEditSegment: segmentActions?.onEdit,
    onDeleteSegment: segmentActions?.onDelete,
    onNewSegment:
      segmentActions?.onNew ??
      (() => {
        askForNewSegment()
        goTo(crmTabSearch("subscribers"))
      }),
  }

  const { place, frame, setRightSpot } = useCrmFrame(loaded.tab)
  const recordLabel = place?.rightLabel ?? (overview ? "" : RECORD_LABELS[loaded.tab])
  const recordShowLabel = place?.rightShowLabel ?? `Show the ${recordLabel.toLowerCase()}`
  const heading = overview ? null : <MiddleHeading icon={SECTION_ICONS[loaded.tab]} label={CRM_TAB_LABELS[loaded.tab]} />
  // The end of the middle's header: the button that reopens a shut right panel.
  const headingEnd = <PanelReopenButton side="right" label={recordShowLabel} />

  let middle: React.ReactNode
  if (loaded.tab === "subscribers") {
    middle = (
      <CrmPeopleTab
        key="subscribers"
        data={loaded.people}
        search={search}
        figures={figures}
        heading={heading}
        headingEnd={headingEnd}
        frame={frame}
      />
    )
  } else if (loaded.tab === "broadcasts") {
    middle = (
      <CrmBroadcastsTab
        key="broadcasts"
        page={loaded.broadcasts}
        templates={loaded.templates}
        segments={loaded.segments}
        blockDefaults={loaded.blockDefaults}
        search={search}
        heading={heading}
        headingEnd={headingEnd}
        frame={frame}
      />
    )
  } else if (loaded.tab === "leads") {
    middle = (
      <CrmLeadsTab
        key="leads"
        page={loaded.leads}
        search={search}
        heading={heading}
        headingEnd={headingEnd}
        frame={frame}
        onOpenSubscriber={(contactId) => goTo(crmTabSearch("subscribers", { open: contactId }))}
      />
    )
  } else if (loaded.tab === "system") {
    middle = (
      <CrmSystemEmailsTab
        key="system"
        emails={loaded.systemEmails}
        blockDefaults={loaded.blockDefaults}
        search={search}
        heading={heading}
        headingEnd={headingEnd}
        frame={frame}
      />
    )
  } else if (loaded.tab === "inbox") {
    middle = (
      <CrmWorkspace
        key="inbox"
        page={loaded.inbox}
        outbox={loaded.outbox}
        filters={filters}
        openThreadId={search.open ?? null}
        heading={heading}
        headingEnd={headingEnd}
        frame={frame}
        onFiltersChange={changeFilters}
        onOpenThread={openThread}
        onReloadInbox={reload}
        onOpenContact={(contactId) => goTo(crmTabSearch("subscribers", { open: contactId }))}
      />
    )
  } else {
    middle = widgets.layout ? (
      <WidgetGrid board="crm" layout={widgets.layout} days={ANALYTICS_DEFAULT_RANGE} onChange={widgets.change} />
    ) : widgets.error ? (
      <ErrorRow message={widgets.error} onRetry={widgets.retry} />
    ) : null
  }

  return (
    <CrmSegmentActionsContext.Provider value={setSegmentActions}>
      {/* The left page's cover carries on behind the record on the right. */}
      <RightCoverProvider value={crmPage?.coverUrl ?? null}>
      <ManageWidgetsProvider value={manageWidgets}>
      <ThreePanels
        // Overview is two panels, with a layout of its own.
        layoutKey={overview ? panelLayoutKey.crmOverview : panelLayoutKey.crmWorkspace}
        place={{
          key: panelLayoutKey.crmPlace,
          search,
          ids: place?.ids ?? [],
          // Until the section showing has said which rows it shows.
          ready: overview || place !== null,
          section: loaded.tab,
        }}
        showMiddleFor={`${loaded.tab}|${place?.showMiddleFor ?? ""}`}
        showRightFor={place?.showRightFor}
        reopenInHeader={!overview}
        left={{
          label: "Page",
          showLabel: "Show the page",
          content: (
            <CrmPagePanel
              page={crmPage}
              error={pageRead.error}
              onRetry={pageRead.retry}
              figures={figures}
              onPageChange={setCrmPage}
              onFiguresChanged={reload}
              blocks={blocks}
              menuState={leftMenu}
              widgets={
                <WidgetSettings
                  board="crm"
                  layout={widgets.layout}
                  error={widgets.error}
                  onRetry={widgets.retry}
                  onChange={widgets.change}
                />
              }
            />
          ),
        }}
        middle={{
          label: CRM_TAB_LABELS[loaded.tab],
          bare: overview,
          content: (
            // The container its tables measure, so their columns drop out as
            // the middle narrows.
            <div
              className={cn(
                "@container flex h-full min-h-0 flex-col overflow-hidden",
                !overview && ["bg-card", middleGutterClassName]
              )}
            >
              {middle}
            </div>
          ),
        }}
        right={
          overview
            ? undefined
            : {
                label: recordLabel,
                showLabel: recordShowLabel,
                content: <div ref={setRightSpot} className="flex h-full min-h-0 flex-col" />,
              }
        }
      />
      </ManageWidgetsProvider>
      </RightCoverProvider>
    </CrmSegmentActionsContext.Provider>
  )
}
