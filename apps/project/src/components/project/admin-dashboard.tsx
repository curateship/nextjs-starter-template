import * as React from "react"
import { useNavigate, useRouter } from "@tanstack/react-router"
import { SettingsIcon } from "lucide-react"

import { AdminCards } from "@/components/project/admin-cards"
import { DailyCard, DailyEditButton, DailyLookBackButton, DailySkyBanner, useDailyNow } from "@/components/project/daily-card"
import { DailyCityField } from "@/components/project/daily-city-field"
import { ProjectsCard } from "@/components/project/admin-project-cards"
import { InboxCard, type InboxPage } from "@/components/project/inbox-card"
import { InboxMorphIcon } from "@/components/project/inbox-morph-icon"
import { MyNoticeSwitches } from "@/components/project/my-notice-switches"
import { MyTasksPanel } from "@/components/project/my-tasks-panel"
import { OptionCard } from "@/components/project/option-card"
import { PersonPages } from "@/components/project/person-pages"
import { SaveLine } from "@/components/project/save-line"
import { PersonAvatar } from "@/components/project/task-bits"
import { TaskSidePanel } from "@/components/project/task-side-panel"
import { ThreePanels } from "@/components/project/three-panels"
import { TimeZoneSelect } from "@/components/project/time-zone-select"
import type { FilterProject } from "@/components/project/task-filter-popover"
import { DashboardCardHeader, DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { saveAdminStatusOrder, saveAdminTimeZone, type AdminDashboard } from "@/lib/api/project/admin-dashboard"
import type { DailyCard as DailyCardData } from "@/lib/api/project/daily-card"
import type { TaskCard } from "@/lib/api/project/tasks"
import { useTaskAddress } from "@/lib/hooks/use-task-address"
import { useWideScreen } from "@/lib/layout/wide-screen"
import { adminProjectColumn } from "@/lib/project/admin-projects"
import { browserTimeZone } from "@/lib/project/days"
import { ADMIN_DASHBOARD_PANEL_LAYOUT_KEY, ADMIN_OPEN_TASK_KEY } from "@/lib/project/panel-keys"
import { isOpenStatus, priorityRank } from "@/lib/project/rules"
import type { TaskFilters } from "@/lib/project/task-filters"
import { TeamScope } from "@/lib/project/team-scope"
import { useMyLive } from "@/lib/project/use-my-live"
import { useRememberedTask } from "@/lib/project/use-remembered-task"
import { useSaveLine } from "@/lib/project/use-save-line"
import { PANEL_GUTTER } from "@/lib/project/panel-gutter"
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
  const wide = useWideScreen()
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
  const projectsCard = dashboard.cards.projects.length ? (
    <ProjectsCard
      projects={dashboard.cards.projects}
      extras={dashboard.cards.projectCards}
      today={dashboard.today}
      picked={search.project}
      onPick={(project) => setFilters({ project })}
    />
  ) : null
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
      // Picking a project on a phone's Projects tab shows its tasks at once.
      showMiddleFor={search.project}
      left={{
        label: "Me",
        showLabel: "Show my cards",
        content: (
          <AdminPanel
            dashboard={dashboard}
            daily={daily}
            inbox={inbox}
            projectsCard={wide ? projectsCard : null}
            onOpenTask={taskAddress.open}
          />
        ),
      }}
      narrowTab={
        !wide && projectsCard
          ? {
              label: "Projects",
              content: (
                <>
                  <DashboardCardTitleHeader title="Projects" />
                  <ScrollArea className="min-h-0 flex-1" viewportClassName="h-full">
                    <div className={cn("grid", PANEL_GUTTER)}>{projectsCard}</div>
                  </ScrollArea>
                </>
              ),
            }
          : undefined
      }
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

/**
 * Filter's Project row: every project the Projects card shows and every one
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
 * The left panel: me with my inbox and My settings in the header, then the
 * cards. The inbox icon swaps the cards for the inbox, and again for the
 * cards (Tyler, 25 Oct 2026: "add an inbox icon here with red bubble
 * notification. the inbox open in that tab instead of card"). Both stay
 * mounted, so what was read here keeps the bubble right on the way back.
 */
function AdminPanel({
  dashboard,
  daily,
  inbox,
  projectsCard,
  onOpenTask,
}: {
  dashboard: AdminDashboard
  daily: DailyCardData
  inbox: InboxPage
  /** The Projects card, in the cards on a wide screen; on a phone it has a tab of its own. */
  projectsCard: React.ReactNode
  onOpenTask: (taskId: string) => void
}) {
  const { me } = dashboard
  const [inboxOpen, setInboxOpen] = React.useState(false)
  const [unread, setUnread] = React.useState(() => inbox.notifications.filter((item) => !item.read_at).length)
  const now = useDailyNow(daily)
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {inboxOpen ? null : <DailySkyBanner daily={daily} now={now} />}
      {/* The line goes see-through over the sky rather than away, so the header keeps its height. */}
      <DashboardCardHeader className={cn("relative", !inboxOpen && "border-b-transparent")}>
        <PersonAvatar name={me.name} avatarUrl={me.avatarUrl} size="default" />
        <div className="grid min-w-0 flex-1">
          <span className="truncate text-sm font-medium">{me.name}</span>
          <span className="truncate text-xs text-muted-foreground">Site admin</span>
        </div>
        <DailyLookBackButton />
        <DailyEditButton daily={daily} />
        <InboxButton unread={unread} open={inboxOpen} onToggle={() => setInboxOpen((open) => !open)} />
        <AdminSettingsMenu dashboard={dashboard} city={daily.settings.city} />
      </DashboardCardHeader>
      <ScrollArea className="relative min-h-0 flex-1" viewportClassName="h-full">
        <div className={cn("grid", PANEL_GUTTER, inboxOpen && "hidden")}>
          <DailyCard daily={daily} now={now} deepWork={mostUrgent(dashboard.tasks, dashboard.today)} picks={null} checkin={null} onOpenTask={onOpenTask} />
          <AdminCards
            cards={dashboard.cards}
            zone={dashboard.zone}
            projectsCard={projectsCard}
            onOpenTask={onOpenTask}
          />
        </div>
        <div className={cn("p-4", !inboxOpen && "hidden")}>
          <InboxCard inbox={inbox} bare onUnread={setUnread} />
        </div>
      </ScrollArea>
    </div>
  )
}

/** How many tasks the site admin's Daily card names as deep work. */
const DEEP_WORK_TASKS = 3

/**
 * The site admin's deep work on the Daily card: they have no check-in, so it
 * is their three most urgent open tasks (Tyler, 29 Oct 2026). Overdue first,
 * then soonest due, then High priority; tasks waiting to be accepted wait.
 */
function mostUrgent(tasks: TaskCard[], today: string) {
  const rank = (task: TaskCard) => (task.dueDate && task.dueDate < today ? 0 : task.dueDate ? 1 : 2)
  return tasks
    .filter((task) => isOpenStatus(task.status) && !task.waiting)
    .sort(
      (a, b) =>
        rank(a) - rank(b) ||
        (a.dueDate ?? "").localeCompare(b.dueDate ?? "") ||
        priorityRank(a.priority) - priorityRank(b.priority)
    )
    .slice(0, DEEP_WORK_TASKS)
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

/** My settings for the site admin: their time zone and bell notices, as flat rows that fold open. */
function AdminSettingsMenu({ dashboard, city }: { dashboard: AdminDashboard; city: string | null }) {
  const [open, setOpen] = React.useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="icon" aria-label="My settings" className={cn(open && "bg-muted")}>
              <SettingsIcon className="size-4" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>My settings</TooltipContent>
      </Tooltip>
      <PopoverContent
        align="start"
        collisionPadding={16}
        aria-label="My settings"
        className="w-[min(24rem,calc(100vw-2rem))] gap-0 p-0"
      >
        <ScrollArea className="min-h-0" viewportClassName="max-h-[min(75vh,44rem)]">
          <div className="grid">
            <p className="border-b px-4 py-3 text-sm text-muted-foreground">{dashboard.me.email}</p>
            <OptionCard
              id="admin-settings-zone"
              title="Time zone"
              description="Today, Due this week, Meetings today and Done today follow it."
              summary={dashboard.zone.replaceAll("_", " ")}
            >
              <AdminTimeZone zone={dashboard.zone} />
            </OptionCard>
            <OptionCard
              id="admin-settings-city"
              title="City for the weather"
              description="The Daily card's sky shows the weather there."
              summary={city ?? "None"}
            >
              <DailyCityField city={city} />
            </OptionCard>
            <OptionCard
              id="admin-settings-notices"
              title="Bell notices"
              summary={dashboard.noticesOff.length ? `${dashboard.noticesOff.length} off` : "All on"}
            >
              <MyNoticeSwitches off={dashboard.noticesOff} siteAdmin />
            </OptionCard>
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}

/** The site admin's own zone, saved the moment it is picked. */
function AdminTimeZone({ zone }: { zone: string }) {
  const router = useRouter()
  const [saveState, track] = useSaveLine()
  return (
    <section className="grid gap-2" aria-label="My time zone">
      <SaveLine state={saveState} className="justify-self-end empty:hidden" />
      <Label htmlFor="admin-time-zone">My time zone</Label>
      <TimeZoneSelect
        id="admin-time-zone"
        value={zone}
        disabled={saveState === "saving"}
        onChange={(timeZone) =>
          void track(() => saveAdminTimeZone({ timeZone })).then((ok) => (ok ? router.invalidate() : undefined))
        }
      />
    </section>
  )
}
