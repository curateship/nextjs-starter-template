import * as React from "react"
import { createPortal } from "react-dom"
import { useNavigate } from "@tanstack/react-router"
import { PlusIcon } from "lucide-react"

import type { AdminBlocks } from "@/components/admin-dashboard/admin-blocks"
import { PlanRows } from "@/components/admin-dashboard/admin-blocks"
import { AdminPagePanel } from "@/components/admin-dashboard/admin-page-panel"
import { OpenPersonProvider, SideRows } from "@/components/admin-dashboard/admin-parts"
import { FeedbackTab, type FeedbackLoaded } from "@/components/admin-dashboard/feedback-tab"
import { loadOverviewFigures, type OverviewFigures } from "@/lib/admin-dashboard/overview-figures"
import { OverviewTab } from "@/components/admin-dashboard/overview-tab"
import { UsersTab, type UsersLoaded } from "@/components/admin-dashboard/users-tab"
import { AnnouncementDialog } from "@/components/admin/announcement-dialog"
import { PlanDialog } from "@/components/admin/plan-dialog"
import { DashboardCardHeader } from "@/components/shared/dashboard-card-header"
import { DashboardTabs } from "@/components/shared/dashboard-tabs"
import { ThreePanels } from "@/components/shared/three-panels"
import { Button } from "@/components/ui/button"
import { ErrorRow } from "@/components/ui/error-row"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ADMIN_FIGURE_BLOCK_TYPES, type AdminPageSide } from "@/lib/admin-dashboard/admin-page"
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
  announcementStatus,
  announcementStatusLabels,
  windowText,
} from "@/lib/admin-dashboard/announcement-status"
import {
  ANALYTICS_DEFAULT_RANGE,
  ANALYTICS_RANGE_LABELS,
  ANALYTICS_RANGES,
  type AnalyticsRange,
} from "@/lib/analytics/range"
import { getAdminErrorMessage, loadAdminPages } from "@/lib/api/admin-dashboard"
import { loadAdminPlans, type AdminPlan } from "@/lib/api/billing/admin-plans"
import { loadAdminAnnouncements, type Announcement } from "@/lib/api/content/announcements"
import { focusRingInset } from "@/lib/layout/focus-ring"
import { panelLayoutKey } from "@/lib/layout/panel-layout"
import type { StoredPage } from "@/lib/notes/page-body"
import { useLoad } from "@/lib/hooks/use-load"
import { cn } from "@/lib/utils"

/** What the route's loader read, for the tab showing. */
export type AdminLoaded =
  | { tab: "overview"; figures: OverviewFigures }
  | { tab: "users"; users: UsersLoaded }
  | { tab: "feedback"; feedback: FeedbackLoaded }

/**
 * What a tab hands the frame to draw (each tab draws itself into it):
 *
 * - `header`: the middle's one header, starting with the `tabs` it was given.
 * - `middle`: what sits under it.
 * - `right`: a record panel, on a tab that opens records. Overview leaves it
 *   out and the right panel is the Notes page.
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
 * Admin: the Overview, Users, Plans, Feedback, Announcements and Analytics
 * screens as one three-panel dashboard (Tyler, 8 Nov 2026,
 * `workspace/tasks/features/admin/admin.md`).
 *
 * - **Left:** the site's Admin page, beside every tab. Its ⋮ holds General
 *   (cover photo, Lock the notes), Announcements and Plans.
 * - **Middle:** one header (the tabs, then the tab's own toolbar), then the
 *   tab. Edge to edge.
 * - **Right:** on Overview, the site's Notes page of "/" blocks. On Users, the
 *   person open; on Feedback, the thread open.
 *
 * The three panels stay put while the tab changes: only the middle and the
 * record on the right are the tab's, so the left page, its ⋮ and anything
 * typed there carry on across a switch. Plans and announcements open their
 * windows over the dashboard. A member's name, wherever it shows, opens them
 * in the Users tab.
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
  const announcementsRead = useLoad(
    async () => (await loadAdminAnnouncements()).announcements,
    getAdminErrorMessage
  )
  const pages = pagesRead.data
  const [planOpen, setPlanOpen] = React.useState<AdminPlan | "new" | null>(null)
  const [announcementOpen, setAnnouncementOpen] = React.useState<Announcement | "new" | null>(null)
  // When the dashboard opened, so an announcement's Showing or Ended is read once.
  const [openedAt] = React.useState(() => Date.now())

  // Overview's figures for the blocks. Overview's own tab brought them; on
  // another tab they are read only when the left page holds a figure block.
  const leftHoldsFigures = pages
    ? ADMIN_FIGURE_BLOCK_TYPES.some((type) => pages.left.body.includes(`"${type}"`))
    : false
  const needFigures = loaded.tab !== "overview" && leftHoldsFigures
  const figuresRead = useLoad(
    async () => (needFigures ? { days, figures: await loadOverviewFigures(days) } : null),
    getAdminErrorMessage,
    { keys: [needFigures, days] }
  )
  const figures =
    loaded.tab === "overview"
      ? loaded.figures
      : figuresRead.data?.days === days
        ? figuresRead.data.figures
        : null

  const blocks: AdminBlocks = {
    figures,
    figuresError: loaded.tab === "overview" ? null : figuresRead.error,
    onRetryFigures: figuresRead.retry,
    plans: plansRead.data,
    plansError: plansRead.error,
    onRetryPlans: plansRead.retry,
    onOpenPlan: (plan) => setPlanOpen(plan),
    onNewPlan: () => setPlanOpen("new"),
  }

  const pickTab = (next: AdminTab) => void navigate({ search: adminTabSearch(next, days) })
  const pickRange = (next: AnalyticsRange) =>
    void navigate({
      // The tab is written too, so the address is never a bare one, which
      // would send the dashboard back to the place it last had.
      search: (previous: AdminSearch) => ({
        ...previous,
        tab: previous.tab ?? "overview",
        range: next === ANALYTICS_DEFAULT_RANGE ? undefined : next,
      }),
    })
  const openPerson = (userId: string) =>
    void navigate({ search: { ...adminTabSearch("users", days), open: userId } })

  const tabs = (
    <DashboardTabs
      // Each tab draws its own header, so this row is built afresh on every
      // switch; the handoff lets its line slide over from the last tab.
      handoff="admin-tabs"
      value={tab}
      onValueChange={(value) => pickTab(value as AdminTab)}
      tabs={ADMIN_TABS.map((value) => ({ value, label: ADMIN_TAB_LABELS[value] }))}
    />
  )

  const setPage = (side: AdminPageSide) => (page: StoredPage) =>
    pagesRead.setData((current) => (current ? { ...current, [side]: page } : current))

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
        tabs={tabs}
        frame={frame}
      />
    )
  } else if (loaded.tab === "feedback") {
    middle = <FeedbackTab key="feedback" loaded={loaded.feedback} search={search} tabs={tabs} frame={frame} />
  } else {
    middle = frame({
      header: (
        <DashboardCardHeader className="@container gap-2">
          {tabs}
          <Select value={String(days)} onValueChange={(value) => pickRange(Number(value) as AnalyticsRange)}>
            <SelectTrigger aria-label="Date range" className="ml-auto shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {ANALYTICS_RANGES.map((range) => (
                <SelectItem key={range} value={String(range)}>
                  {ANALYTICS_RANGE_LABELS[range]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </DashboardCardHeader>
      ),
      middle: <OverviewTab figures={loaded.figures} days={days} />,
    })
  }

  const recordLabel = place.rightLabel ?? (loaded.tab === "users" ? "Person" : "Thread")

  return (
    <OpenPersonProvider value={openPerson}>
      <ThreePanels
        layoutKey={panelLayoutKey.admin}
        place={{ key: panelLayoutKey.adminPlace, search, ids: place.ids, ready: place.ready }}
        showMiddleFor={tab}
        showRightFor={place.openId}
        left={{
          label: "Page",
          showLabel: "Show the page",
          content: (
            <AdminPagePanel
              side="left"
              title="Admin"
              menuLabel="Admin settings"
              page={pages?.left ?? null}
              error={pagesRead.error}
              onRetry={pagesRead.retry}
              blocks={blocks}
              onPageChange={setPage("left")}
              menuTabs={[
                {
                  value: "announcements",
                  label: "Announcements",
                  content: (
                    <MenuList
                      rows={(announcementsRead.data ?? []).map((announcement) => {
                        const status = announcementStatus(announcement, openedAt)
                        return {
                          key: announcement.id,
                          name: announcement.title,
                          line: windowText(announcement),
                          value: announcementStatusLabels[status],
                          onPress: () => setAnnouncementOpen(announcement),
                        }
                      })}
                      reading={announcementsRead.data === null}
                      error={announcementsRead.error}
                      onRetry={announcementsRead.retry}
                      empty="No announcements yet."
                      newLabel="New announcement"
                      onNew={() => setAnnouncementOpen("new")}
                    />
                  ),
                },
                {
                  value: "plans",
                  label: "Plans",
                  content: plansRead.data ? (
                    <PlanRows
                      plans={plansRead.data}
                      onOpen={(plan) => setPlanOpen(plan)}
                      onNew={() => setPlanOpen("new")}
                    />
                  ) : plansRead.error ? (
                    <ErrorRow message={plansRead.error} onRetry={plansRead.retry} className="py-4" />
                  ) : (
                    <p className="p-3 text-sm text-muted-foreground">Reading…</p>
                  ),
                },
              ]}
            />
          ),
        }}
        middle={{
          label: ADMIN_TAB_LABELS[tab],
          content: (
            // The container its tables and charts measure, so their columns
            // drop out as the middle narrows, as the CRM's do.
            <div className="@container flex h-full min-h-0 flex-col overflow-hidden bg-card">{middle}</div>
          ),
        }}
        right={
          loaded.tab === "overview"
            ? {
                label: "Notes",
                showLabel: "Show the notes",
                content: (
                  <AdminPagePanel
                    side="right"
                    title="Notes"
                    menuLabel="Notes settings"
                    page={pages?.right ?? null}
                    error={pagesRead.error}
                    onRetry={pagesRead.retry}
                    blocks={blocks}
                    onPageChange={setPage("right")}
                  />
                ),
              }
            : {
                label: recordLabel,
                showLabel: `Show ${recordLabel.toLowerCase()}`,
                content: <div ref={setRightSpot} className="flex h-full min-h-0 flex-col" />,
              }
        }
      >
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
        <AnnouncementDialog
          key={announcementOpen === "new" ? "new-announcement" : (announcementOpen?.id ?? "announcement-closed")}
          open={announcementOpen !== null}
          announcement={announcementOpen === "new" ? null : announcementOpen}
          onClose={() => setAnnouncementOpen(null)}
          onSaved={async () => {
            setAnnouncementOpen(null)
            announcementsRead.retry()
          }}
        />
      </ThreePanels>
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

/** A list inside a ⋮ tab: its rows, then a New … button. */
function MenuList({
  rows,
  reading,
  error,
  onRetry,
  empty,
  newLabel,
  onNew,
}: {
  rows: React.ComponentProps<typeof SideRows>["rows"]
  reading: boolean
  error: string | null
  onRetry: () => void
  empty: string
  newLabel: string
  onNew: () => void
}) {
  if (reading && error) return <ErrorRow message={error} onRetry={onRetry} className="py-4" />
  if (reading) return <p className="p-3 text-sm text-muted-foreground">Reading…</p>
  return (
    <SideRows
      rows={rows}
      empty={empty}
      after={
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn("m-1.5 justify-self-start", focusRingInset)}
          onClick={onNew}
        >
          <PlusIcon className="size-4" />
          {newLabel}
        </Button>
      }
    />
  )
}
