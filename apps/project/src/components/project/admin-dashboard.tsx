import * as React from "react"
import { useNavigate, useRouter } from "@tanstack/react-router"

import { AdminCards } from "@/components/project/admin-cards"
import { DailyCard, DailyLookBackButton, DailySkyBanner, useDailyNow } from "@/components/project/daily-card"
import { DailyLookBack } from "@/components/project/daily-look-back"
import { DailyCityField } from "@/components/project/daily-city-field"
import { DailyHabitsSetting, DailySectionsSetting, DailySkySetting } from "@/components/project/daily-settings"
import { ProjectsCard } from "@/components/project/admin-project-cards"
import { InboxCard, type InboxPage } from "@/components/project/inbox-card"
import { InboxMorphIcon } from "@/components/project/inbox-morph-icon"
import { MyNoticeSwitches } from "@/components/project/my-notice-switches"
import { RoutineReminderTimes } from "@/components/project/routine-reminder-times"
import { MySettingsMenu, SettingRow } from "@/components/project/my-settings-menu"
import { MyTasksPanel } from "@/components/project/my-tasks-panel"
import { PersonPages } from "@/components/project/person-pages"
import { AdminPageNotes } from "@/components/project/project-page-notes"
import { SaveLine } from "@/components/project/save-line"
import { PersonAvatar } from "@/components/project/task-bits"
import { TaskSidePanel } from "@/components/project/task-side-panel"
import { ThreePanels } from "@/components/project/three-panels"
import { TimeZoneSelect } from "@/components/project/time-zone-select"
import type { FilterProject } from "@/components/project/task-filter-popover"
import { DashboardCardHeader } from "@/components/shared/dashboard-card-header"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { saveAdminStatusOrder, saveAdminTimeZone, type AdminDashboard } from "@/lib/api/project/admin-dashboard"
import type { DailyCard as DailyCardData } from "@/lib/api/project/daily-card"
import { useTaskAddress } from "@/lib/hooks/use-task-address"
import { adminProjectColumn } from "@/lib/project/admin-projects"
import { browserTimeZone } from "@/lib/project/days"
import { ADMIN_DASHBOARD_PANEL_LAYOUT_KEY, ADMIN_OPEN_TASK_KEY } from "@/lib/project/panel-keys"
import type { TaskFilters } from "@/lib/project/task-filters"
import { TeamScope } from "@/lib/project/team-scope"
import { useMyLive } from "@/lib/project/use-my-live"
import { useRememberedTask } from "@/lib/project/use-remembered-task"
import { useSaveLine } from "@/lib/project/use-save-line"
import { PANEL_GUTTER } from "@/lib/project/panel-gutter"
import { readActiveView } from "@/lib/saved-views"
import { cn } from "@/lib/utils"

/** The route whose data loads again on a live change. */
const DASHBOARD_ROUTE_ID = "/_authenticated/dashboard"

/** The site admin's My dashboard address: filters and the open task, as an employee's. */
export type AdminDashboardSearch = Omit<TaskFilters, "person"> & { task?: string }

/**
 * The site admin's My dashboard (Admin task 03, Tyler, 23 Oct 2026): no
 * check-in or check-out, every task handed to them in any team mixed with
 * their own "Just me" list in the middle, ten cards counting across every
 * team on the left, and the open task on the right, never empty and with no
 * cross. An employee's is `my-dashboard.tsx`.
 */
export function AdminDashboardScreen({
  dashboard,
  daily,
  inbox,
  search,
}: {
  dashboard: AdminDashboard
  daily: DailyCardData
  inbox: InboxPage
  search: AdminDashboardSearch
}) {
  const navigate = useNavigate()
  const router = useRouter()
  const taskAddress = useTaskAddress()
  const [rows, setRows] = React.useState<string[] | null>(null)
  const quietTask = useRememberedTask({ storageKey: ADMIN_OPEN_TASK_KEY, taskId: search.task, ids: rows })
  useFirstZone(dashboard.savedZone)
  // Any change in any team loads the page again, so the cards and the Projects
  // card never go stale (task "My dashboard/01 Project cards", Tyler's pick).
  useMyLive(
    () => true,
    () => void router.invalidate({ filter: (match) => match.routeId === DASHBOARD_ROUTE_ID })
  )

  // The open task asks its own team's questions (its tags, its people), as on its
  // project page. Only the right panel is scoped: New task in the middle offers
  // every team's projects, so it must not borrow the open task's team.
  const taskProjects = React.useMemo(() => {
    const all = [
      ...dashboard.tasks,
      ...dashboard.cards.dueThisWeek,
      ...dashboard.cards.unassigned.map((task) => ({ id: task.taskId, projectId: task.projectId })),
      ...dashboard.cards.waiting.map((ask) => ({ id: ask.taskId, projectId: ask.projectId })),
      ...dashboard.cards.doneToday.flatMap((person) =>
        person.tasks.map((task) => ({ id: task.taskId, projectId: task.projectId }))
      ),
    ]
    return new Map(all.map((task) => [task.id, task.projectId]))
  }, [dashboard])
  const openProject = search.task ? taskProjects.get(search.task) : undefined
  const openTeam = openProject ? dashboard.projectTeams[openProject] : undefined

  const projectColumn = React.useMemo(() => adminProjectColumn(dashboard), [dashboard])
  const filterProjects = React.useMemo(() => filterProjectsOf(dashboard), [dashboard])

  const setFilters = (patch: Partial<AdminDashboardSearch>) =>
    void navigate({
      to: ".",
      replace: true,
      search: (previous: Record<string, unknown>) => {
        const next: Record<string, unknown> = { ...previous, ...patch }
        for (const key of Object.keys(next)) if (next[key] === undefined) delete next[key]
        return next
      },
    })
  // Pressing the picked project again goes back to the view picked under it,
  // its own project included (Tyler, 2 Nov 2026: "clicking on project again
  // does not go back to my saved view").
  const pickProject = (project: string | undefined) =>
    setFilters({
      project: project ?? viewProject(readActiveView(dashboard.viewScreen, dashboard.views)?.filters.project),
    })
  const taskLoaded = (taskId: string) => {
    if (dashboard.tasks.some((task) => task.id === taskId && task.unread > 0)) void router.invalidate()
  }

  return (
    <ThreePanels
      layoutKey={ADMIN_DASHBOARD_PANEL_LAYOUT_KEY}
      // On a phone the Daily card is the first thing seen (Tyler, 29 Oct 2026).
      narrowStart="left"
      // A task opened on arrival leaves a narrow screen on the list.
      showRightFor={search.task === quietTask ? undefined : search.task}
      // Picking a pinned project on a phone shows its tasks at once.
      showMiddleFor={search.project}
      left={{
        label: "Me",
        showLabel: "Show my cards",
        content: (
          <AdminPanel
            dashboard={dashboard}
            daily={daily}
            inbox={inbox}
            pickedProject={search.project}
            onPickProject={pickProject}
            openTaskId={search.task}
            onOpenTask={taskAddress.open}
          />
        ),
      }}
      middle={{
        label: "My tasks",
        content: (
          <MyTasksPanel
            source={{
              tasks: dashboard.tasks,
              picks: [],
              orderPicks: null,
              myOrder: dashboard.myOrder,
              today: dashboard.today,
              people: dashboard.people,
              labels: dashboard.labels,
              taskTypes: dashboard.taskTypes,
              views: dashboard.views,
              viewScreen: dashboard.viewScreen,
              statusOrder: dashboard.statusOrder,
              saveStatusOrder: saveAdminStatusOrder,
              myUserId: dashboard.me.id,
              // The site admin may delete any task.
              canDelete: () => true,
              table: { project: projectColumn },
              projects: filterProjects,
            }}
            openTaskId={search.task}
            filters={{
              q: search.q,
              status: search.status,
              priority: search.priority,
              label: search.label,
              type: search.type,
              due: search.due,
              client: search.client,
              project: search.project,
            }}
            onFilters={setFilters}
            onOpenTask={taskAddress.open}
            onRows={setRows}
          />
        ),
      }}
      right={{
        label: "Task",
        showLabel: "Show the task",
        content: (
          <TeamScope teamId={openTeam}>
            <PersonPages>
              <TaskSidePanel taskId={search.task} onClose={taskAddress.back} onLoaded={taskLoaded} />
            </PersonPages>
          </TeamScope>
        ),
      }}
    />
  )
}

/** A saved view's project, when it has one. */
function viewProject(value: unknown) {
  return typeof value === "string" ? value : undefined
}

/**
 * Filter's Project row: every open project, pinned or not, and every one
 * holding a task of theirs, named as the table's Project chip names it, with
 * its team ("Acme · Website", or "Just me" for their own list).
 */
function filterProjectsOf(dashboard: AdminDashboard): FilterProject[] {
  const ids = new Set([
    ...dashboard.cards.projects.map((project) => project.id),
    ...dashboard.tasks.map((task) => task.projectId),
  ])
  return [...ids]
    .flatMap((id) => {
      const info = dashboard.projectInfo[id]
      return info ? [{ id, name: info.teamName ? `${info.teamName} · ${info.name}` : info.name, color: info.color }] : []
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Before a zone is saved, the browser's is saved once, so "today" here is the
 * site admin's own from the first visit (Tyler's pick: it starts on the
 * browser's zone and changes in My settings).
 */
function useFirstZone(savedZone: string | null) {
  const router = useRouter()
  const tried = React.useRef(false)
  React.useEffect(() => {
    if (savedZone || tried.current) return
    tried.current = true
    // Quietly: if it fails, the dashboard still counts in UTC and the cog can set it.
    saveAdminTimeZone({ timeZone: browserTimeZone() }).then(
      () => router.invalidate(),
      () => undefined
    )
  }, [savedZone, router])
}

/**
 * The left panel: me with my inbox and My settings in the header, then my
 * page, then the footer of cards. The inbox icon swaps the page for the
 * inbox, and again for it (Tyler, 25 Oct 2026: "add an inbox
 * icon here with red bubble notification. the inbox open in that tab instead
 * of card"). Both stay mounted, so what was read here keeps the bubble right
 * on the way back.
 *
 * The footer stays put while the page scrolls, with the inbox and Look back
 * open too: Pinned projects, Need your attention, then the whole Daily card,
 * greeting, Start day and all, each folding like the greeting (Tyler, 6 Nov
 * 2026: "move the start your day button into the footer of the panel as well
 * as the pinned projects", "the footer card now hold greetings and the habit
 * section", "The pinned project should have the same toggle card like the
 * good morning card", "the need my attention should be a card in the footer
 * too"). My page takes the greeting's old place under the sky.
 */
function AdminPanel({
  dashboard,
  daily,
  inbox,
  pickedProject,
  onPickProject,
  openTaskId,
  onOpenTask,
}: {
  dashboard: AdminDashboard
  daily: DailyCardData
  inbox: InboxPage
  /** The project My tasks is filtered to. */
  pickedProject: string | undefined
  onPickProject: (projectId: string | undefined) => void
  /** The task open in the right panel. */
  openTaskId: string | undefined
  onOpenTask: (taskId: string) => void
}) {
  const { me } = dashboard
  // The cards, or in their place the inbox or Look back, from the icons in the header.
  const [view, setView] = React.useState<"cards" | "inbox" | "lookBack">("cards")
  const inboxOpen = view === "inbox"
  const showView = (next: "inbox" | "lookBack") => setView((shown) => (shown === next ? "cards" : next))
  const [unread, setUnread] = React.useState(() => inbox.notifications.filter((item) => !item.read_at).length)
  const now = useDailyNow(daily)
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* The sky stays with the inbox and Look back open too (Tyler, 30 Oct 2026:
          "the panel background image should not disapeared when i click on the
          graph or the inbox tab"). */}
      <DailySkyBanner daily={daily} now={now} />
      {/* The line goes see-through over the sky rather than away, so the header keeps its height. */}
      <DashboardCardHeader className="relative border-b-transparent">
        <PersonAvatar name={me.name} avatarUrl={me.avatarUrl} size="default" />
        <div className="grid min-w-0 flex-1">
          <span className="truncate text-sm font-medium">{me.name}</span>
          <span className="truncate text-xs text-muted-foreground">Site admin</span>
        </div>
        <DailyLookBackButton open={view === "lookBack"} onToggle={() => showView("lookBack")} />
        <InboxButton unread={unread} open={inboxOpen} onToggle={() => showView("inbox")} />
        <AdminSettingsMenu dashboard={dashboard} daily={daily} />
      </DashboardCardHeader>
      {/* Look back and the inbox bring their own tab rows and scrolling. The inbox
          and the page stay mounted while hidden, so what was read keeps the bubble right.
          The body and the footer share the panel's height: the footer takes what its
          cards need and the body grows into the rest, keeping at least 6rem for the
          page, or half the panel for the inbox or Look back. Only when both are full
          does the footer scroll (Tyler, 6 Nov 2026: "why is there areascroll when
          theres so much space here", of a footer capped at 60 out of 100 of the
          screen's height). */}
      <div className={cn("relative flex min-h-0 flex-col", view === "cards" ? "flex-[1_0_6rem]" : "flex-[1_0_50%]")}>
        {view === "lookBack" ? <DailyLookBack /> : null}
        <div className={cn("relative flex min-h-0 flex-1 flex-col", !inboxOpen && "hidden")}>
          <InboxCard inbox={inbox} bare onUnread={setUnread} />
        </div>
        <ScrollArea className={cn("relative min-h-0 flex-1", view !== "cards" && "hidden")} viewportClassName="h-full">
          {/* One column that can shrink to the panel: left to grow, it took the
              Daily card's widest row and pushed a counted habit's "+" past the
              panel's edge (Tyler, 31 Oct 2026: "Add the + icon back"). */}
          <div className={cn("grid grid-cols-[minmax(0,1fr)]", PANEL_GUTTER)}>
            <AdminPageNotes page={dashboard.page} />
          </div>
        </ScrollArea>
      </div>
      {/* Three cards that fold the same way, top to bottom, each parted from the next by
          a line running edge to edge (Tyler, 6 Nov 2026: "add divider for each card"), each
          heading on a light band and each body padding itself (`band` on FoldHeading). A
          card with nothing to show leaves no empty strip. Folding a card shrinks the
          footer to its heading, and the page above grows into the room. */}
      <footer className="relative flex min-h-0 flex-col border-t">
        <ScrollArea className="min-h-0">
          <div className="grid grid-cols-[minmax(0,1fr)] divide-y">
            <div className="grid grid-cols-[minmax(0,1fr)] empty:hidden">
              <ProjectsCard
                projects={dashboard.cards.projects}
                extras={dashboard.cards.projectCards}
                today={dashboard.today}
                picked={pickedProject}
                onPick={onPickProject}
              />
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)] empty:hidden">
              <AdminCards
                cards={dashboard.cards}
                zone={dashboard.zone}
                loadedAt={daily.loadedAt}
                openTaskId={openTaskId}
                projectInfo={dashboard.projectInfo}
                onOpenTask={onOpenTask}
              />
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)]">
              <DailyCard daily={daily} now={now} checkin={null} inFooter />
            </div>
          </div>
        </ScrollArea>
      </footer>
    </div>
  )
}

/** The inbox icon, with a red bubble counting unread notices; a cross while the inbox shows. */
function InboxButton({ unread, open, onToggle }: { unread: number; open: boolean; onToggle: () => void }) {
  const label = open ? "Back to my cards" : unread ? `Inbox, ${unread} unread` : "Inbox"
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={label}
          aria-pressed={open}
          className={cn("relative", open && "bg-muted")}
          onClick={onToggle}
        >
          <InboxMorphIcon open={open} />
          {unread && !open ? (
            <span
              aria-hidden
              // 12px, under the 16px tray, so the count marks the icon without covering it
              // (Tyler, 29 Oct 2026: "the notification bubble is a bit too big").
              className="absolute top-0.5 right-0.5 flex h-3 min-w-3 items-center justify-center rounded-full bg-destructive px-[3px] text-[8px] leading-none font-semibold text-white tabular-nums"
            >
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{open ? "Back to my cards" : "Inbox"}</TooltipContent>
    </Tooltip>
  )
}

/**
 * My settings for the site admin, behind the ⋮: General (their time zone,
 * weather city and the card's sky), Notifications (the bell notices, with the
 * Daily card's reminder times) and Daily card (Card layout and Routine
 * habits, which the pencil window held until 6 Nov 2026).
 */
function AdminSettingsMenu({ dashboard, daily }: { dashboard: AdminDashboard; daily: DailyCardData }) {
  return (
    <MySettingsMenu
      tabs={[
        {
          value: "general",
          label: "General",
          content: (
            <>
              <SettingRow
                title="Time zone"
                htmlFor="admin-time-zone"
                description="Today, Due this week, Meetings today and Done today follow it."
              >
                <AdminTimeZone zone={dashboard.zone} />
              </SettingRow>
              <SettingRow title="City for the weather" description="The Daily card's sky shows the weather there.">
                <DailyCityField city={daily.settings.city} />
              </SettingRow>
              {/* Beside the weather it shows, since Daily card holds only the card's layout and
                  habits (Tyler's drawing of that tab, 6 Nov 2026). */}
              <DailySkySetting daily={daily} />
            </>
          ),
        },
        {
          value: "notifications",
          label: "Notifications",
          content: (
            <div className="px-4 py-3">
              <MyNoticeSwitches
                off={dashboard.noticesOff}
                siteAdmin
                routineTimes={<RoutineReminderTimes reminders={daily.settings.reminders} />}
              />
            </div>
          ),
        },
        {
          value: "daily",
          label: "Daily card",
          content: (
            <>
              <DailySectionsSetting daily={daily} />
              <DailyHabitsSetting daily={daily} />
            </>
          ),
        },
      ]}
    />
  )
}

/** The site admin's own zone, saved the moment it is picked. */
function AdminTimeZone({ zone }: { zone: string }) {
  const router = useRouter()
  const [saveState, track] = useSaveLine()
  return (
    <div className="grid gap-2">
      <TimeZoneSelect
        id="admin-time-zone"
        value={zone}
        disabled={saveState === "saving"}
        onChange={(timeZone) =>
          void track(() => saveAdminTimeZone({ timeZone })).then((ok) => (ok ? router.invalidate() : undefined))
        }
      />
      <SaveLine state={saveState} className="empty:hidden" />
    </div>
  )
}
