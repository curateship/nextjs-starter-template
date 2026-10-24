import * as React from "react"
import { useNavigate, useRouter } from "@tanstack/react-router"
import { SettingsIcon } from "lucide-react"

import { AdminCards } from "@/components/project/admin-cards"
import { InboxCard, type InboxPage } from "@/components/project/inbox-card"
import { MyNoticeSwitches } from "@/components/project/my-notice-switches"
import { MyTasksPanel } from "@/components/project/my-tasks-panel"
import { OptionCard } from "@/components/project/option-card"
import { PersonPages } from "@/components/project/person-pages"
import { SaveLine } from "@/components/project/save-line"
import { PersonAvatar } from "@/components/project/task-bits"
import { TaskSidePanel } from "@/components/project/task-side-panel"
import { ThreePanels } from "@/components/project/three-panels"
import { TimeZoneSelect } from "@/components/project/time-zone-select"
import { DashboardCardHeader } from "@/components/shared/dashboard-card-header"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { saveAdminStatusOrder, saveAdminTimeZone, type AdminDashboard } from "@/lib/api/project/admin-dashboard"
import { useTaskAddress } from "@/lib/hooks/use-task-address"
import { adminProjectColumn } from "@/lib/project/admin-projects"
import { browserTimeZone } from "@/lib/project/days"
import { ADMIN_DASHBOARD_PANEL_LAYOUT_KEY, ADMIN_OPEN_TASK_KEY } from "@/lib/project/panel-keys"
import type { TaskFilters } from "@/lib/project/task-filters"
import { TeamScope } from "@/lib/project/team-scope"
import { useRememberedTask } from "@/lib/project/use-remembered-task"
import { useSaveLine } from "@/lib/project/use-save-line"
import { cn } from "@/lib/utils"

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
  inbox,
  search,
}: {
  dashboard: AdminDashboard
  inbox: InboxPage
  search: AdminDashboardSearch
}) {
  const navigate = useNavigate()
  const router = useRouter()
  const taskAddress = useTaskAddress()
  const [rows, setRows] = React.useState<string[] | null>(null)
  const quietTask = useRememberedTask({ storageKey: ADMIN_OPEN_TASK_KEY, taskId: search.task, ids: rows })
  useFirstZone(dashboard.savedZone)

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
  const taskLoaded = (taskId: string) => {
    if (dashboard.tasks.some((task) => task.id === taskId && task.unread > 0)) void router.invalidate()
  }

  return (
    <ThreePanels
      layoutKey={ADMIN_DASHBOARD_PANEL_LAYOUT_KEY}
      // A task opened on arrival leaves a narrow screen on the list.
      showRightFor={search.task === quietTask ? undefined : search.task}
      left={{
        label: "Me",
        showLabel: "Show my cards",
        content: <AdminPanel dashboard={dashboard} inbox={inbox} onOpenTask={taskAddress.open} />,
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

/** The left panel: me with My settings behind the cog, the ten cards, then my inbox. */
function AdminPanel({
  dashboard,
  inbox,
  onOpenTask,
}: {
  dashboard: AdminDashboard
  inbox: InboxPage
  onOpenTask: (taskId: string) => void
}) {
  const { me } = dashboard
  return (
    <>
      <DashboardCardHeader>
        <PersonAvatar name={me.name} avatarUrl={me.avatarUrl} size="default" />
        <div className="grid min-w-0 flex-1">
          <span className="truncate text-sm font-medium">{me.name}</span>
          <span className="truncate text-xs text-muted-foreground">Site admin</span>
        </div>
        <AdminSettingsMenu dashboard={dashboard} />
      </DashboardCardHeader>
      <ScrollArea className="min-h-0 flex-1" viewportClassName="h-full">
        <div className="grid gap-3 p-3">
          <AdminCards cards={dashboard.cards} zone={dashboard.zone} onOpenTask={onOpenTask} />
          <InboxCard inbox={inbox} />
        </div>
      </ScrollArea>
    </>
  )
}

/** My settings for the site admin: their time zone and bell notices, as flat rows that fold open. */
function AdminSettingsMenu({ dashboard }: { dashboard: AdminDashboard }) {
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
