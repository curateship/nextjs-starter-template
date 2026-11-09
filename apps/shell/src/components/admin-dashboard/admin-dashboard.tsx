import * as React from "react"
import { createPortal } from "react-dom"
import { useNavigate, useRouter } from "@tanstack/react-router"
import {
  ImageIcon,
  LayoutDashboardIcon,
  MegaphoneIcon,
  MessageSquareIcon,
  PlusIcon,
  UserPlusIcon,
  type LucideIcon,
} from "lucide-react"

import type { AdminBlocks } from "@/components/admin-dashboard/admin-blocks"
import { PlanRows } from "@/components/admin-dashboard/admin-blocks"
import { AdminPagePanel } from "@/components/admin-dashboard/admin-page-panel"
import { OpenPersonProvider } from "@/components/admin-dashboard/admin-parts"
import { AnnouncementsTab, type AnnouncementsLoaded } from "@/components/admin-dashboard/announcements-tab"
import { FeedbackTab, type FeedbackLoaded } from "@/components/admin-dashboard/feedback-tab"
import { MediaTab, type MediaLoaded } from "@/components/admin-dashboard/media-tab"
import { OverviewTab } from "@/components/admin-dashboard/overview-tab"
import { useWidgetLayout } from "@/components/shared/widgets/use-widget-layout"
import { WidgetSettings } from "@/components/shared/widgets/widget-menus"
import { UsersTab, type UsersLoaded } from "@/components/admin-dashboard/users-tab"
import type { OverviewFigures } from "@/lib/admin-dashboard/overview-figures"
import { widgetsShown, type WidgetLayout } from "@/lib/admin-dashboard/overview-widgets"
import { AddAccountDialog } from "@/components/admin/add-account-dialog"
import { PlanDialog } from "@/components/admin/plan-dialog"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { PickGroup, PickMenuRow } from "@/components/shared/notes/pick-rows"
import { MenuFooterButton } from "@/components/shared/notes/tabbed-menu"
import { DashboardTabs } from "@/components/shared/dashboard-tabs"
import { useShellRuntime } from "@/components/shell/shell-layout"
import { RightCoverProvider } from "@/components/shared/notes/page-cover"
import { middleGutterClassName, MiddleHeading, PanelReopenButton, ThreePanels } from "@/components/shared/three-panels"
import { ErrorRow } from "@/components/ui/error-row"
import {
  ADMIN_TAB_LABELS,
  ADMIN_TABS,
  adminRangeOf,
  adminTabOf,
  adminTabSearch,
  type AdminSearch,
  type AdminTab,
} from "@/lib/admin-dashboard/admin-search"
import {
  ANALYTICS_DEFAULT_RANGE,
  ANALYTICS_RANGE_LABELS,
  ANALYTICS_RANGES,
  type AnalyticsRange,
} from "@/lib/analytics/range"
import { getAdminErrorMessage, loadAdminPages, loadAdminSectionCounts } from "@/lib/api/admin-dashboard"
import { loadAdminPlans, type AdminPlan } from "@/lib/api/billing/admin-plans"
import { panelLayoutKey } from "@/lib/layout/panel-layout"
import type { StoredPage } from "@/lib/notes/page-body"
import { useLoad } from "@/lib/hooks/use-load"
import { allRoles } from "@/lib/roles"
import { cn } from "@/lib/utils"

/** Each section's icon, at the start of the middle's header; Users has tabs there instead. */
const SECTION_ICONS: Record<Exclude<AdminTab, "users">, LucideIcon> = {
  overview: LayoutDashboardIcon,
  feedback: MessageSquareIcon,
  announcements: MegaphoneIcon,
  media: ImageIcon,
}

/** What the route's loader read, for the section showing. */
export type AdminLoaded =
  | { tab: "overview"; figures: OverviewFigures; widgets: WidgetLayout }
  | { tab: "users"; users: UsersLoaded }
  | { tab: "feedback"; feedback: FeedbackLoaded }
  | { tab: "announcements"; announcements: AnnouncementsLoaded }
  | { tab: "media"; media: MediaLoaded }

/**
 * What a section hands the frame to draw (each section draws itself into it):
 *
 * - `header`: the middle's one header, starting with the `heading` it was
 *   given, the section's name. Overview has none.
 * - `middle`: what sits under it.
 * - `right`: a record panel, on a section that opens records. Overview
 *   leaves it out and has no right panel.
 * - `ids` and `openId`: the rows shown, first first, and the one open, so a
 *   bare address goes back to it and arrival opens the first.
 */
type AdminTabPanels = {
  header: React.ReactNode
  middle: React.ReactNode
  right?: { label: string; content: React.ReactNode }
  ids?: string[]
  openId?: string
  /** False while the rows shown still belong to the address before. */
  ready?: boolean
  windows?: React.ReactNode
}

export type AdminFrame = (panels: AdminTabPanels) => React.ReactNode

/** What the tab showing tells the frame about its rows, for `ThreePanels`' place. */
type TabPlace = {
  tab: AdminTab
  ids: string[]
  openId?: string
  ready: boolean
  rightLabel?: string
}

function samePlace(a: TabPlace | null, b: TabPlace) {
  return (
    a !== null &&
    a.tab === b.tab &&
    a.openId === b.openId &&
    a.ready === b.ready &&
    a.rightLabel === b.rightLabel &&
    a.ids.join("\n") === b.ids.join("\n")
  )
}

/**
 * Admin: the Overview, Users, Plans, Feedback, Announcements, Analytics and
 * Media library screens as one three-panel dashboard (Tyler, 8 Nov 2026,
 * `workspace/tasks/features/admin/admin.md`, then
 * `workspace/tasks/admin-changes.md`).
 *
 * - **Left:** the site's Admin page, beside every section. Its fixed
 *   Dashboards block picks the section: Overview, Users, Feedback,
 *   Announcements or Media library. Its ⋮ holds General (cover photo, Lock
 *   blocks last) and Plans; Announcements left it for a section of its own
 *   on 9 Nov 2026 ("Move the announcement from the top left settings into
 *   its own dashboard").
 *   Its ⋮ also holds Overview's date range (General) and its widgets
 *   (Widgets).
 * - **Middle:** one header (the section's name, then its own toolbar), then
 *   the section, edge to edge. Overview has no middle panel: its widgets sit
 *   straight on the dashboard and take the right panel's room too (Tyler,
 *   8 Nov 2026: "Remove the right panel for overview dashboard").
 * - **Right:** on Users, the person open; on Feedback, the thread open; on
 *   Announcements, the announcement, changed in place; on Media library, the
 *   file.
 *
 * The left panel stays put while the section changes: only the middle and
 * the record on the right are the section's, so the left page, its ⋮ and
 * anything typed there carry on across a switch. Plans open their windows
 * over the dashboard. A member's name, wherever it shows, opens
 * them in Users.
 */
export function AdminDashboard({
  loaded,
  search,
  currentUserId,
}: {
  loaded: AdminLoaded
  search: AdminSearch
  currentUserId: string
}) {
  const navigate = useNavigate({ from: "/admin/dashboard" })
  const tab = adminTabOf(search)
  const days = adminRangeOf(search)

  const pagesRead = useLoad(loadAdminPages, getAdminErrorMessage)
  const plansRead = useLoad(loadAdminPlans, getAdminErrorMessage)
  const pages = pagesRead.data
  const [planOpen, setPlanOpen] = React.useState<AdminPlan | "new" | null>(null)

  // The counts beside the Dashboards block's rows, read again on each
  // section switch, after whatever was changed in the last one.
  const countsRead = useLoad(loadAdminSectionCounts, getAdminErrorMessage, { keys: [loaded.tab] })

  const pickTab = (next: AdminTab) => void navigate({ search: adminTabSearch(next, days) })
  const router = useRouter()
  // The Admin header's + (Tyler, 9 Nov 2026: "Add a + icon here with a
  // dropdown to add announcements and users").
  const [addingUser, setAddingUser] = React.useState(false)
  const newAnnouncement = () =>
    void navigate({ search: { ...adminTabSearch("announcements", days), draft: "1" } })
  const pickRange = (next: AnalyticsRange) =>
    void navigate({
      // The section is written too, so the address is never a bare one, which
      // would send the dashboard back to the place it last had.
      search: (previous: AdminSearch) => ({
        ...previous,
        tab: previous.tab ?? "overview",
        range: next === ANALYTICS_DEFAULT_RANGE ? undefined : next,
      }),
    })
  const openPerson = (userId: string) =>
    void navigate({ search: { ...adminTabSearch("users", days), open: userId } })

  // Overview's widgets, held here so the left ⋮'s Widgets tab can set them
  // on every section, and the Dashboards block can count them.
  const widgets = useWidgetLayout("admin", loaded.tab === "overview" ? loaded.widgets : null)

  // The sections the Dashboards block leaves out, kept with the site's look
  // and saved as the rest of Settings is.
  const { config, onConfigChange } = useShellRuntime()
  const hiddenSections = (config.styling.hiddenAdminSections ?? []).filter((section): section is AdminTab =>
    (ADMIN_TABS as readonly string[]).includes(section)
  )
  const blocks: AdminBlocks = {
    tab,
    hiddenSections,
    onHiddenSectionsChange: (hidden) =>
      onConfigChange({ ...config, styling: { ...config.styling, hiddenAdminSections: hidden } }),
    widgetCount: widgets.layout ? widgetsShown(widgets.layout) : null,
    onPickTab: pickTab,
    counts: countsRead.data,
    days,
    plans: plansRead.data,
    plansError: plansRead.error,
    onRetryPlans: plansRead.retry,
    onOpenPlan: (plan) => setPlanOpen(plan),
    onNewPlan: () => setPlanOpen("new"),
  }

  // A role picked from Users' tabs. The list starts at its first page, and
  // its first row opens.
  const pickRole = (role: string) =>
    void navigate({
      search: (previous: AdminSearch) => ({
        ...previous,
        tab: "users",
        role: role === "all" ? undefined : (role as AdminSearch["role"]),
        page: undefined,
        open: undefined,
      }),
      replace: true,
    })

  // The start of the middle's header: the button that reopens a shut left
  // panel, then the section's icon and name (Tyler, 8 Nov 2026: "Every panel
  // needs an icon"). Users has its role tabs instead ("for users, make this
  // into tabs for roles. First tab "All roles""), and a header with tabs has
  // no icon ("dashboards with middle header tabs does not [need] icon"). The
  // tabs sit straight in the header, so their underline reaches its bottom
  // edge ("underline should be at the edge").
  const SectionIcon = tab === "users" ? null : SECTION_ICONS[tab]
  const heading =
    !SectionIcon ? (
      <>
        <PanelReopenButton side="left" label="Show the page" />
        <DashboardTabs
          value={search.role ?? "all"}
          onValueChange={pickRole}
          tabs={[
            { value: "all", label: "All roles" },
            ...allRoles().map((role) => ({ value: role.id, label: role.label })),
          ]}
        />
      </>
    ) : (
      <MiddleHeading icon={SectionIcon} label={ADMIN_TAB_LABELS[tab]} />
    )

  const setPage = (page: StoredPage) => pagesRead.setData((current) => (current ? { ...current, left: page } : current))

  // Where a tab's record panel is drawn: a spot in the right panel that stays
  // while the tab changes, and what the tab says about its rows.
  const [rightSpot, setRightSpot] = React.useState<HTMLDivElement | null>(null)
  const [reported, setReported] = React.useState<TabPlace | null>(null)
  const report = React.useCallback(
    (next: TabPlace) => setReported((current) => (samePlace(current, next) ? current : next)),
    []
  )
  const place: TabPlace =
    reported?.tab === loaded.tab ? reported : { tab: loaded.tab, ids: [], ready: loaded.tab === "overview" }

  const recordLabel =
    place.rightLabel ??
    (loaded.tab === "users"
      ? "Person"
      : loaded.tab === "media"
        ? "File"
        : loaded.tab === "announcements"
          ? "Announcement"
          : "Thread")
  // The end of the middle's header: the button that reopens a shut right panel.
  const headingEnd = <PanelReopenButton side="right" label={`Show ${recordLabel.toLowerCase()}`} />

  const frame: AdminFrame = (panels) => (
    <TabPanels tab={loaded.tab} panels={panels} rightSpot={rightSpot} onReport={report} />
  )

  let middle: React.ReactNode
  if (loaded.tab === "users") {
    middle = (
      <UsersTab
        key="users"
        loaded={loaded.users}
        search={search}
        currentUserId={currentUserId}
        heading={heading}
        headingEnd={headingEnd}
        frame={frame}
      />
    )
  } else if (loaded.tab === "feedback") {
    middle = <FeedbackTab key="feedback" loaded={loaded.feedback} search={search} heading={heading} headingEnd={headingEnd} frame={frame} />
  } else if (loaded.tab === "announcements") {
    middle = (
      <AnnouncementsTab
        key="announcements"
        loaded={loaded.announcements}
        search={search}
        heading={heading}
        headingEnd={headingEnd}
        frame={frame}
      />
    )
  } else if (loaded.tab === "media") {
    middle = (
      <MediaTab
        key="media"
        loaded={loaded.media}
        search={search}
        currentUserId={currentUserId}
        heading={heading}
        headingEnd={headingEnd}
        frame={frame}
      />
    )
  } else {
    middle = frame({
      header: null,
      middle: widgets.layout ? (
        <OverviewTab figures={loaded.figures} days={days} layout={widgets.layout} onChange={widgets.change} />
      ) : widgets.error ? (
        <ErrorRow message={widgets.error} onRetry={widgets.retry} />
      ) : null,
    })
  }
  const overview = loaded.tab === "overview"


  return (
    <OpenPersonProvider value={openPerson}>
      {/* The left page's cover carries on behind the record on the right. */}
      <RightCoverProvider value={pages?.left?.coverUrl ?? null}>
      <ThreePanels
        // Overview is two panels, with a layout of its own.
        layoutKey={overview ? panelLayoutKey.adminOverview : panelLayoutKey.admin}
        place={{ key: panelLayoutKey.adminPlace, search, ids: place.ids, ready: place.ready, section: loaded.tab }}
        showMiddleFor={tab}
        // Only a record the address names. A section's first row stands in
        // for an empty `?open=` until the place opens it quietly, and handing
        // that over first read as a press, so a phone jumped to the record
        // (the UI standard: "On a narrow screen the list stays in front").
        showRightFor={search.orphan ?? search.open}
        // A shut side panel comes back from a button in the middle's header,
        // not a knob on its edge. Overview has no middle panel and keeps the
        // knob (Tyler, 8 Nov 2026).
        reopenInHeader={!overview}
        left={{
          label: "Page",
          showLabel: "Show the page",
          content: (
            <AdminPagePanel
              title="Admin"
              menuLabel="Admin settings"
              actions={<AddMenu onNewAnnouncement={newAnnouncement} onNewUser={() => setAddingUser(true)} />}
              page={pages?.left ?? null}
              error={pagesRead.error}
              onRetry={pagesRead.retry}
              blocks={blocks}
              onPageChange={setPage}
              general={
                // Overview's range, in place of the select in its old header
                // (Tyler, 8 Nov 2026: "move the date filter into general
                // settings options").
                <PickGroup title="Overview">
                  <PickMenuRow
                    label="Date range"
                    value={ANALYTICS_RANGE_LABELS[days]}
                    options={ANALYTICS_RANGES.map((range) => ({
                      value: String(range),
                      label: ANALYTICS_RANGE_LABELS[range],
                    }))}
                    selected={String(days)}
                    onPick={(value) => pickRange(Number(value) as AnalyticsRange)}
                  />
                </PickGroup>
              }
              menuTabs={[
                {
                  value: "plans",
                  label: "Plans",
                  content: plansRead.data ? (
                    <PlanRows plans={plansRead.data} onOpen={(plan) => setPlanOpen(plan)} />
                  ) : plansRead.error ? (
                    <ErrorRow message={plansRead.error} onRetry={plansRead.retry} className="py-4" />
                  ) : (
                    <p className="p-3 text-sm text-muted-foreground">Reading…</p>
                  ),
                  // The same footer as General's Lock blocks (Tyler, 9 Nov
                  // 2026: "make both footer the same ui").
                  footer: (
                    <MenuFooterButton icon={<PlusIcon />} onClick={() => setPlanOpen("new")}>
                      New plan
                    </MenuFooterButton>
                  ),
                },
                {
                  value: "widgets",
                  label: "Widgets",
                  content: (
                    <WidgetSettings
                      board="admin"
                      layout={widgets.layout}
                      error={widgets.error}
                      onRetry={widgets.retry}
                      onChange={widgets.change}
                    />
                  ),
                },
              ]}
            />
          ),
        }}
        middle={{
          label: ADMIN_TAB_LABELS[tab],
          bare: overview,
          content: (
            // The container its tables and charts measure, so their columns
            // drop out as the middle narrows, as the CRM's do.
            <div
              className={cn(
                "@container flex h-full min-h-0 flex-col overflow-hidden",
                !overview && [
                  "bg-card",
                  middleGutterClassName,
                ]
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
                showLabel: `Show ${recordLabel.toLowerCase()}`,
                content: <div ref={setRightSpot} className="flex h-full min-h-0 flex-col" />,
              }
        }
      >
        <AddAccountDialog
          // Remounts on every open, so the last invite's fields never linger.
          key={addingUser ? "add-user-open" : "add-user-closed"}
          open={addingUser}
          onClose={() => setAddingUser(false)}
          onCreated={async () => {
            setAddingUser(false)
            countsRead.retry()
            // On Users, the list reads again with the new account in it.
            if (loaded.tab === "users") await router.invalidate()
          }}
        />
        <PlanDialog
          key={planOpen === "new" ? "new-plan" : (planOpen?.id ?? "plan-closed")}
          open={planOpen !== null}
          plan={planOpen === "new" ? null : planOpen}
          onClose={() => setPlanOpen(null)}
          onSaved={async () => {
            setPlanOpen(null)
            plansRead.retry()
          }}
        />
      </ThreePanels>
      </RightCoverProvider>
    </OpenPersonProvider>
  )
}

/**
 * One tab's panels inside the frame that stays: its header, middle and
 * windows where it stands, its record drawn into the right panel's spot, and
 * its rows told to the frame for the place it keeps.
 */
function TabPanels({
  tab,
  panels,
  rightSpot,
  onReport,
}: {
  tab: AdminTab
  panels: AdminTabPanels
  rightSpot: HTMLDivElement | null
  onReport: (place: TabPlace) => void
}) {
  // Compared as text: a tab hands over a fresh list every render.
  const idsText = (panels.ids ?? []).join("\n")
  const rightLabel = panels.right?.label
  const ready = panels.ready ?? true
  React.useEffect(() => {
    onReport({ tab, ids: idsText ? idsText.split("\n") : [], openId: panels.openId, ready, rightLabel })
  }, [tab, idsText, panels.openId, ready, rightLabel, onReport])

  return (
    <>
      {panels.header}
      {panels.middle}
      {panels.right && rightSpot ? createPortal(panels.right.content, rightSpot) : null}
      {panels.windows}
    </>
  )
}

/**
 * The + in the Admin header, before the ⋮ (Tyler, 9 Nov 2026: "Add a + icon
 * here with a dropdown to add announcements and users"), drawn as the CRM's
 * is. New announcement opens Announcements with a blank one on the right;
 * New user opens the Add account window over whatever section is showing.
 */
function AddMenu({ onNewAnnouncement, onNewUser }: { onNewAnnouncement: () => void; onNewUser: () => void }) {
  const [open, setOpen] = React.useState(false)
  return (
    <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Add to Admin"
          className={cn("shrink-0", open && "bg-muted")}
        >
          <PlusIcon className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        <DropdownMenuItem onSelect={onNewAnnouncement}>
          <MegaphoneIcon className="size-4 text-muted-foreground" />
          New announcement
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onNewUser}>
          <UserPlusIcon className="size-4 text-muted-foreground" />
          New user
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
