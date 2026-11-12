import * as React from "react"
import { useNavigate, useRouter } from "@tanstack/react-router"

import { useDailyNow } from "@/components/project/daily-card"
import { CityRow } from "@/components/project/daily-city-field"
import { DailyHabitsSetting, DailySectionsSetting } from "@/components/project/daily-settings"
import type { InboxPage } from "@/components/project/inbox-card"
import { MyNoticeSwitches } from "@/components/project/my-notice-switches"
import { RoutineReminderTimes } from "@/components/project/routine-reminder-times"
import { MySettingsMenu } from "@/components/project/my-settings-menu"
import { PickChoicesRow, PickGroup } from "@/components/project/pick-rows"
import { MyTasksPanel } from "@/components/project/my-tasks-panel"
import { PersonPages } from "@/components/project/person-pages"
import { DashboardBlocksProvider } from "@/components/project/notes/dashboard-blocks"
import { AdminPageNotes } from "@/components/project/project-page-notes"
import { PersonAvatar } from "@/components/project/task-bits"
import { TaskSidePanel } from "@/components/project/task-side-panel"
import { ThreePanels } from "@/components/project/three-panels"
import { ZoneChoices } from "@/components/project/time-zone-select"
import type { FilterProject } from "@/components/project/task-filter-popover"
import { SidePanelCollapseButton } from "@/components/shared/three-panels"
import { DashboardCardHeader } from "@/components/shared/dashboard-card-header"
import { CoverRow, LockRow } from "@/components/shared/notes/page-rows"
import { ScrollArea } from "@/components/ui/scroll-area"
import { saveAdminPageCover, saveAdminPageLock, saveAdminStatusOrder, saveAdminTimeZone, type AdminDashboard } from "@/lib/api/project/admin-dashboard"
import type { DailyCard as DailyCardData } from "@/lib/api/project/daily-card"
import { useTaskAddress } from "@/lib/hooks/use-task-address"
import { adminProjectColumn } from "@/lib/project/admin-projects"
import { browserTimeZone } from "@/lib/project/days"
import { ADMIN_DASHBOARD_PANEL_LAYOUT_KEY, ADMIN_OPEN_TASK_KEY } from "@/lib/project/panel-keys"
import type { TaskFilters } from "@/lib/project/task-filters"
import { TeamScope } from "@/lib/project/team-scope"
import { useMyLive } from "@/lib/project/use-my-live"
import { useRememberedTask } from "@/lib/project/use-remembered-task"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { useZoneRows } from "@/lib/project/zone-rows"
import { PANEL_GUTTER } from "@/lib/layout/panel-gutter"
import { readActiveView } from "@/lib/saved-views"
import { cn } from "@/lib/utils"
import { PageCover, RightCoverProvider } from "@/components/shared/notes/page-cover"


/** The route whose data loads again on a live change. */
const DASHBOARD_ROUTE_ID = "/_authenticated/dashboard"

/** The site admin's My dashboard address: filters and the open task, as an employee's. */
export type AdminDashboardSearch = Omit<TaskFilters, "person"> & { task?: string }

/**
 * The site admin's My dashboard (Admin task 03, Tyler, 23 Oct 2026): no
 * check-in or check-out, every task handed to them in any team mixed with
 * their own "Just me" list in the middle, with a Need your attention tab of
 * every task across every team that needs them; their own page with its "/"
 * blocks and the Daily card on the left; and the open task on the right,
 * never empty and with no cross. An employee's is `my-dashboard.tsx`.
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
  // Any change in any team loads the page again, so the Projects blocks and the
  // Need your attention tab never go stale (task "My dashboard/01 Project cards", Tyler's pick).
  useMyLive(
    () => true,
    () => void router.invalidate({ filter: (match) => match.routeId === DASHBOARD_ROUTE_ID })
  )

  // The open task asks its own team's questions (its people), as on its
  // project page. Only the right panel is scoped: New task in the middle offers
  // every team's projects, so it must not borrow the open task's team.
  const taskProjects = React.useMemo(() => {
    const all = [...dashboard.tasks, ...dashboard.attention.tasks]
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
      reopenInHeader
      layoutKey={ADMIN_DASHBOARD_PANEL_LAYOUT_KEY}
      // On a phone the Daily card is the first thing seen (Tyler, 29 Oct 2026).
      narrowStart="left"
      // A task opened on arrival leaves a narrow screen on the list.
      showRightFor={search.task === quietTask ? undefined : search.task}
      // Picking a pinned project on a phone shows its tasks at once.
      showMiddleFor={search.project}
      left={{
        label: "Me",
        showLabel: "Show my page",
        content: (
          <AdminPanel
            dashboard={dashboard}
            daily={daily}
            inbox={inbox}
            pickedProject={search.project}
            onPickProject={pickProject}
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
              views: dashboard.views,
              viewScreen: dashboard.viewScreen,
              statusOrder: dashboard.statusOrder,
              saveStatusOrder: saveAdminStatusOrder,
              myUserId: dashboard.me.id,
              // The site admin may delete any task.
              canDelete: () => true,
              table: { project: projectColumn },
              projects: filterProjects,
              attention: dashboard.attention,
            }}
            openTaskId={search.task}
            filters={{
              q: search.q,
              status: search.status,
              priority: search.priority,
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
              {/* My page's cover carried on behind the task's header. */}
              <RightCoverProvider value={dashboard.cover.url}>
                <TaskSidePanel taskId={search.task} onClose={taskAddress.back} onLoaded={taskLoaded} />
              </RightCoverProvider>
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
    ...dashboard.projects.map((project) => project.id),
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
 * There is no footer: the whole Daily card, greeting, Start day and all, is a
 * block on the page, and Pinned projects and Need your attention became
 * Projects blocks and a tab in My tasks (task "My
 * dashboard/left-panel-blocks", Tyler, 6 Nov 2026). The page's Projects,
 * Daily card and rating blocks draw from the dashboard
 * (`DashboardBlocksProvider`).
 */
function AdminPanel({
  dashboard,
  daily,
  inbox,
  pickedProject,
  onPickProject,
}: {
  dashboard: AdminDashboard
  daily: DailyCardData
  inbox: InboxPage
  /** The project My tasks is filtered to, which a Projects block sets. */
  pickedProject: string | undefined
  onPickProject: (projectId: string | undefined) => void
}) {
  const { me } = dashboard
  const now = useDailyNow(daily)
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* The page's cover behind the header and the top of the page, from the
          shell's Cover photo row in My settings (Tyler, 11 Nov 2026: "Shell row
          exactly"): the drawn sky, a picture or none. */}
      <PageCover url={dashboard.cover.url} />
      {/* The line goes see-through over the cover rather than away, so the header keeps its height. */}
      {/* Wrapped in its own div, so the shell's table line under a header never matches it. */}
      <div className="relative shrink-0">
      <DashboardCardHeader className={cn("relative gap-2", dashboard.cover.url && "border-b-transparent")}>
        <SidePanelCollapseButton side="left" label="Hide my page" />
        <PersonAvatar name={me.name} avatarUrl={me.avatarUrl} size="default" />
        <div className="grid min-w-0 flex-1">
          <span className="truncate text-sm font-medium">{me.name}</span>
          <span className="truncate text-xs text-muted-foreground">Site admin</span>
        </div>
        <AdminSettingsMenu dashboard={dashboard} daily={daily} />
      </DashboardCardHeader>
      </div>
      {/* The page takes the whole panel under the header. Inbox and Look back are
          blocks on it (Tyler, 11 Nov 2026: "turn look back and inbox tabs into
          blocks"); until then the header's tray and graph swapped the page for them. */}
      <ScrollArea className="relative min-h-0 flex-1" viewportClassName="h-full">
          {/* One column that can shrink to the panel: left to grow, it took the
              Daily card's widest row and pushed a counted habit's "+" past the
              panel's edge (Tyler, 31 Oct 2026: "Add the + icon back"). */}
          <div data-side-panel-body="" className={cn("grid grid-cols-[minmax(0,1fr)]", PANEL_GUTTER)}>
            <DashboardBlocksProvider
              value={{
                projects: dashboard.projects,
                projectCards: dashboard.projectCards,
                today: dashboard.today,
                picked: pickedProject,
                onPick: onPickProject,
                daily,
                now,
                inbox,
              }}
            >
              <AdminPageNotes page={dashboard.page} locked={dashboard.pageLocked} />
            </DashboardBlocksProvider>
          </div>
      </ScrollArea>
    </div>
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
          // Grouped rows, as the task's ⋮ General is (Tyler, 6 Nov 2026: "general should
          // have the same grouping ui design too"). The page's cover is the shell's
          // Cover photo row, as on a team's and a project's page (Tyler, 11 Nov 2026:
          // "this is not using standard", then "Shell row exactly").
          content: (
            <div className="grid gap-5 px-4 py-3">
              <PickGroup title="Page">
                <AdminCoverRow cover={dashboard.cover} />
              </PickGroup>
              <PickGroup title="Location">
                <AdminZoneRow zone={dashboard.zone} />
                <CityRow city={daily.settings.city} />
              </PickGroup>
            </div>
          ),
          // The tab's footer, as the shell's left page ⋮ has Lock blocks.
          footer: <PageLockButton locked={dashboard.pageLocked} />,
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

/**
 * Locks their own page so it reads only, blocks and all, until it's unlocked
 * (Tyler, 6 Nov 2026: "lock the notes option is missing"). Drawn as the
 * shell's Lock blocks, the General tab's footer (`LockRow`). The words change at once and
 * the page follows once the save is back; a refused save says why.
 */
function PageLockButton({ locked }: { locked: boolean }) {
  const router = useRouter()
  const [run, busy] = useAsyncAction(getProjectErrorMessage)
  async function toggle() {
    const ok = await run(
      () => saveAdminPageLock(!locked)
    )
    if (ok) await router.invalidate()
  }
  return <LockRow locked={locked} busy={busy} onLock={() => void toggle()} />
}

/** Their page's cover, the shell's Cover photo row: None, the drawn sky, or a picture. */
function AdminCoverRow({ cover }: { cover: AdminDashboard["cover"] }) {
  const router = useRouter()
  const [run, busy] = useAsyncAction(getProjectErrorMessage)
  return (
    <CoverRow
      cover={{
        url: cover.url,
        images: cover.images,
        busy,
        set: ({ url, images }) =>
          void run(() => saveAdminPageCover({ coverUrl: url ?? "", coverImages: images })).then((ok) =>
            ok ? router.invalidate() : undefined
          ),
      }}
    />
  )
}

/**
 * The site admin's own zone, a row that opens straight onto the zones with a
 * search box over them; a pick saves at once. Today, Due this week, Meetings
 * today and Done today follow it.
 */
function AdminZoneRow({ zone }: { zone: string }) {
  const router = useRouter()
  const [run] = useAsyncAction(getProjectErrorMessage)
  const rows = useZoneRows(zone)
  return (
    <PickChoicesRow label="Time zone" value={zone.replaceAll("_", " ")} contentClassName="w-72">
      {(close) => (
        <ZoneChoices
          rows={rows}
          value={zone}
          onPick={(next) => {
            close()
            if (next !== zone) void run(() => saveAdminTimeZone({ timeZone: next })).then((ok) => (ok ? router.invalidate() : undefined))
          }}
        />
      )}
    </PickChoicesRow>
  )
}
