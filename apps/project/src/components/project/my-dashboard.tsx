import * as React from "react"
import { useNavigate, useRouter } from "@tanstack/react-router"
import { AlarmClockIcon, CheckCheckIcon, ListChecksIcon, Loader2Icon, PlusIcon, SettingsIcon } from "lucide-react"
import { toast } from "sonner"

import { CatchUpDialog } from "@/components/project/catch-up-dialog"
import { CheckinDialog, StatusLine } from "@/components/project/checkin-dialog"
import { CheckoutDialog } from "@/components/project/checkout-dialog"
import { MyWeekSection } from "@/components/project/my-week-card"
import { MyCheckinTime } from "@/components/project/my-checkin-time"
import { MyNoticeSwitches } from "@/components/project/my-notice-switches"
import { SaveLine } from "@/components/project/save-line"
import { MyTaskRows } from "@/components/project/my-task-rows"
import { OptionCard } from "@/components/project/option-card"
import { NewTaskWithProjectPicker } from "@/components/project/new-task-header"
import { PanelCard } from "@/components/project/panel-card"
import { SaveViewDialog, SavedViewsControls } from "@/components/project/saved-views"
import { PersonPages } from "@/components/project/person-pages"
import { ReasonDialog } from "@/components/project/reason-dialog"
import { TaskBoard } from "@/components/project/task-board"
import { TaskCalendar } from "@/components/project/task-calendar"
import { TaskTimeline } from "@/components/project/task-timeline"
import { PersonAvatar, TintChip } from "@/components/project/task-bits"
import { TaskFilterPopover } from "@/components/project/task-filter-popover"
import { SearchToggle } from "@/components/project/task-header-controls"
import { DashboardTabs } from "@/components/shared/dashboard-tabs"
import { TaskSidePanel } from "@/components/project/task-side-panel"
import { TeamStart } from "@/components/project/team-start"
import { ThreePanels } from "@/components/project/three-panels"
import { TimeOffSection } from "@/components/project/time-off-card"
import { NotificationRow } from "@/components/shared/notification-row"
import { useShellRuntime } from "@/components/shell/shell-layout"
import { DashboardCardHeader } from "@/components/shared/dashboard-card-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { orderMyPicks, saveMyStatusOrder, type MyDashboard as MyDashboardData } from "@/lib/api/project/checkins"
import { acceptTasks, saveTask, setStatus, type TaskCard } from "@/lib/api/project/tasks"
import {
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationItem,
} from "@/lib/api/notification"
import { saveMemberTitle } from "@/lib/api/project/team-running"
import { formatDate } from "@/lib/format/format-time"
import { plural } from "@/lib/format/plural"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useAppNotificationDetails } from "@/lib/hooks/use-app-notification-details"
import { useSyncedDraft } from "@/lib/hooks/use-synced-draft"
import { useTaskAddress } from "@/lib/hooks/use-task-address"
import { notificationAction } from "@/lib/notification-action"
import { clientChoices } from "@/lib/project/clients"
import { MY_DASHBOARD_PANEL_LAYOUT_KEY, MY_TASK_VIEW_KEY } from "@/lib/project/panel-keys"
import { useRememberedChoice } from "@/lib/remembered-choice"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { clockIn, clockLabel } from "@/lib/project/days"
import { LIMITS, type TaskStatus } from "@/lib/project/rules"
import {
  DUE_GROUPS,
  dueGroupOf,
  filterTasks,
  hasTaskFilters,
  type TaskFilters,
} from "@/lib/project/task-filters"
import { todaysPicks } from "@/lib/project/todays-picks"
import { useSaveLine } from "@/lib/project/use-save-line"
import { viewHasFilters } from "@/lib/project/saved-views"
import { useMyLive } from "@/lib/project/use-my-live"
import { cn } from "@/lib/utils"
import { showErrorToast } from "@/lib/toast/error-toast"
import { useTeamId } from "@/lib/project/team-scope"

export type MyDashboardSearch = Omit<TaskFilters, "person"> & {
  /** The task open in the right panel, in the inbox's place. */
  task?: string
  /** Opens the check-in window, which is where the bell's reminder goes. */
  checkin?: true
  /** Opens the optional evening check-out. */
  checkout?: true
}

const MY_VIEWS = ["list", "board", "calendar", "timeline"] as const
type MyView = (typeof MY_VIEWS)[number]

/**
 * My dashboard: me on the left with today's check-in, my tasks in the middle,
 * and my inbox on the right. A task opens in the right panel, as on the
 * project page, and closing it brings the inbox back (Tyler, 13 Oct 2026).
 * The check-in opens as a window from here.
 */
const MY_DASHBOARD_ROUTE_ID = "/_authenticated/dashboard"

export function MyDashboardScreen({
  dashboard,
  notifications,
  search,
}: {
  dashboard: MyDashboardData | null
  notifications: NotificationItem[]
  search: MyDashboardSearch
}) {
  if (!dashboard) return <TeamStart />
  return <Dashboard dashboard={dashboard} notifications={notifications} search={search} />
}

function Dashboard({
  dashboard,
  notifications,
  search,
}: {
  dashboard: MyDashboardData
  notifications: NotificationItem[]
  search: MyDashboardSearch
}) {
  const navigate = useNavigate()
  const router = useRouter()
  const taskAddress = useTaskAddress()
  // Opening a task reads its chat, so its row's "3 new" goes once it has loaded.
  const tasksRef = React.useRef(dashboard.tasks)
  React.useEffect(() => {
    tasksRef.current = dashboard.tasks
  }, [dashboard.tasks])
  const taskLoaded = React.useCallback(
    (taskId: string) => {
      if (tasksRef.current.some((task) => task.id === taskId && task.unread > 0)) void router.invalidate()
    },
    [router]
  )
  // A task handed to me, or changed on a project I'm on, shows without a
  // reload (Features 16 Oct, part 5). Only this page's own data loads again.
  useMyLive(
    (change) => change === "mine",
    () => void router.invalidate({ filter: (match) => match.routeId === MY_DASHBOARD_ROUTE_ID })
  )
  const go = React.useCallback(
    (patch: Partial<MyDashboardSearch>, options: { replace?: boolean } = {}) =>
      void navigate({
        to: ".",
        replace: options.replace,
        search: (previous: Record<string, unknown>) => {
          const next: Record<string, unknown> = { ...previous, ...patch }
          for (const key of Object.keys(next)) if (next[key] === undefined) delete next[key]
          return next
        },
      }),
    [navigate]
  )

  return (
    <PersonPages>
      <ThreePanels
        layoutKey={MY_DASHBOARD_PANEL_LAYOUT_KEY}
        showRightFor={search.task}
        left={{
          label: "Me",
          showLabel: "Show my details",
          content: (
            <MePanel
              dashboard={dashboard}
              onCheckIn={() => go({ checkin: true })}
              onCheckOut={() => go({ checkout: true })}
            />
          ),
        }}
        middle={{
          label: "My tasks",
          content: (
            <MyTasksPanel
              dashboard={dashboard}
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
              onFilters={(patch) => go(patch, { replace: true })}
              onOpenTask={taskAddress.open}
            />
          ),
        }}
        right={{
          label: search.task ? "Task" : "Inbox",
          showLabel: search.task ? "Show the task" : "Show my inbox",
          content: (
            <>
              {search.task ? (
                <TaskSidePanel taskId={search.task} onClose={taskAddress.back} closeButton onLoaded={taskLoaded} />
              ) : null}
              {/* The inbox stays loaded under an open task, so closing the task
                  finds it on the same tab and scrolled to the same spot. */}
              <div
                className={cn("flex min-h-0 flex-1 flex-col", search.task && "hidden")}
                inert={Boolean(search.task)}
              >
                <InboxPanel notifications={notifications} />
              </div>
            </>
          ),
        }}
      >
        <CheckinDialog
          page={dashboard.checkin}
          open={search.checkin === true}
          onClose={() => go({ checkin: undefined })}
        />
        {dashboard.checkin.checkin ? (
          <CheckoutDialog
            page={dashboard.checkin}
            open={search.checkout === true}
            onClose={() => go({ checkout: undefined })}
          />
        ) : null}
      </ThreePanels>
    </PersonPages>
  )
}

/**
 * Me, as Tyler drew it on 13 Oct 2026: my name, role and team along the top
 * with a cog for my own settings, then Today's check-in, My week and Time off
 * as cards that fold.
 */
function MePanel({
  dashboard,
  onCheckIn,
  onCheckOut,
}: {
  dashboard: MyDashboardData
  onCheckIn: () => void
  onCheckOut: () => void
}) {
  const { me, checkin } = dashboard
  const { clock, today } = checkin
  const due = clockLabel(clock.time)
  const badge = checkin.checkin
    ? checkin.checkin.late
      ? { text: "Late", tone: "amber" as const }
      : { text: "On time", tone: "green" as const }
    : today.away
      ? { text: "Away", tone: "slate" as const }
      : today.holiday
        ? { text: "Holiday", tone: "slate" as const }
        : !today.workDay
          ? { text: "Day off", tone: "slate" as const }
          : today.pastDue
            ? { text: "Late", tone: "amber" as const }
            : null
  return (
    <>
      <DashboardCardHeader>
        <PersonAvatar name={me.name} avatarUrl={me.avatarUrl} size="default" />
        <div className="grid min-w-0 flex-1">
          <span className="truncate text-sm font-medium">{me.name}</span>
          <span className="truncate text-xs text-muted-foreground">
            {[me.title, me.teamName].filter(Boolean).join(" · ")}
          </span>
        </div>
        <MySettingsMenu dashboard={dashboard} />
      </DashboardCardHeader>
      <ScrollArea className="min-h-0 flex-1" viewportClassName="h-full">
        <div className="grid gap-3 p-3">
          <PanelCard
            storageId="project-my-checkin"
            title="Today's check-in"
            badge={badge ? <TintChip color={badge.tone}>{badge.text}</TintChip> : null}
          >
            {/* One line a row: the figures never wrap, and a label gives way first. */}
            <dl className="grid grid-cols-[minmax(0,auto)_auto] justify-between gap-x-3 gap-y-2 text-[13px] [&_dd]:whitespace-nowrap [&_dt]:truncate">
              <dt className="text-muted-foreground">Checked in</dt>
              <dd className="text-right">
                {checkin.checkin ? clockIn(checkin.checkin.checkedInAt, clock.zone) : "Not yet"}
                <span className="text-muted-foreground"> · due {due}</span>
              </dd>
              {checkin.checkin ? (
                <>
                  <dt className="text-muted-foreground">Checked out</dt>
                  <dd className="text-right">
                    {checkin.checkout?.at ? clockIn(checkin.checkout.at, clock.zone) : "Not yet"}
                  </dd>
                </>
              ) : null}
              {dashboard.record.of ? (
                // Only I and the site admin see this; teammates never do.
                <>
                  <dt className="text-muted-foreground">On time</dt>
                  <dd className="text-right">
                    {dashboard.record.onTime} of the last {dashboard.record.of} work{" "}
                    {dashboard.record.of === 1 ? "day" : "days"}
                  </dd>
                </>
              ) : null}
            </dl>
            {!checkin.checkin && (today.away || today.holiday || !today.workDay || today.pastDue) ? (
              <p className="text-sm text-muted-foreground">
                <StatusLine page={checkin} />
              </p>
            ) : null}
            <div className="grid gap-2">
              <Button
                type="button"
                variant={checkin.checkin ? "outline" : "default"}
                className="w-full"
                onClick={onCheckIn}
              >
                {checkin.checkin ? "Change today's picks" : "Check in"}
              </Button>
              {/* Optional, so it never nags: a plain button once checked in, nothing more. */}
              {checkin.checkin ? (
                <Button type="button" variant="outline" className="w-full" onClick={onCheckOut}>
                  {checkin.checkout?.at ? "Change check-out" : "Check out"}
                </Button>
              ) : null}
            </div>
          </PanelCard>
          <MyWeekSection reload={dashboard} />
          <PanelCard storageId="project-my-time-off" title="Time off">
            <TimeOffSection idPrefix="my-time-off" compact initial={dashboard.timeOff} />
          </PanelCard>
        </div>
      </ScrollArea>
    </>
  )
}

/**
 * The cog beside my name: my email and the day I joined, my job title, my own
 * check-in time and zone, and which notices reach my bell. Each saves on its
 * own, as before, in a dropdown like a task's cog.
 */
function MySettingsMenu({ dashboard }: { dashboard: MyDashboardData }) {
  const { me, checkin } = dashboard
  const [open, setOpen] = React.useState(false)
  // Leaving a field saves it, so closing first leaves the field being typed in.
  function change(next: boolean) {
    if (!next && document.activeElement instanceof HTMLElement) document.activeElement.blur()
    setOpen(next)
  }
  return (
    <Popover open={open} onOpenChange={change}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="My settings"
              className={cn(open && "bg-muted")}
            >
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
          {/* Each setting a flat row that folds open, its answer on the right (Tyler, 14 and 20 Oct 2026). */}
          <div className="grid">
            <p className="border-b px-4 py-3 text-sm text-muted-foreground">
              {me.email} · joined {formatDate(me.joinedAt)}
            </p>
            <OptionCard
              id="my-settings-title"
              title="Job title"
              description="Shown beside your name to the rest of the team."
              summary={me.title || "None"}
            >
              <MyJobTitle title={me.title} />
            </OptionCard>
            <OptionCard
              id="my-settings-checkin"
              title="Check-in time"
              summary={`${clockLabel(checkin.clock.time)}, ${checkin.clock.zone.replaceAll("_", " ")}`}
            >
              <MyCheckinTime clock={checkin.clock} />
            </OptionCard>
            <OptionCard
              id="my-settings-notices"
              title="Bell notices"
              summary={dashboard.noticesOff.length ? `${dashboard.noticesOff.length} off` : "All on"}
            >
              <MyNoticeSwitches off={dashboard.noticesOff} />
            </OptionCard>
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}

function MyTasksPanel({
  dashboard,
  openTaskId,
  filters,
  onFilters,
  onOpenTask,
}: {
  dashboard: MyDashboardData
  /** The task open in the right panel, whose row is marked. */
  openTaskId: string | undefined
  filters: TaskFilters
  onFilters: (patch: Partial<TaskFilters>) => void
  onOpenTask: (taskId: string) => void
}) {
  const router = useRouter()
  const [run, busy] = useAsyncAction(getProjectErrorMessage)
  const { checkin } = dashboard
  // A status or date changed on the Board, Calendar or Timeline shows at once
  // and is put back if the server refuses it.
  const [tasks, setTasks] = useSyncedDraft(dashboard.tasks)
  // Today's picks can include a carried-over task since handed to someone else,
  // so they are read from the check-in rather than from my own tasks. They come
  // in my own order; a drag shows at once and goes back if the save fails.
  const picks = todaysPicks(checkin)
  const savedOrder = picks.map((task) => task.id).join(",")
  const [order, setOrder] = React.useState<{ from: string; ids: string[] } | null>(null)
  const ids = order && order.from === savedOrder ? order.ids : picks.map((task) => task.id)
  const today = ids.flatMap((id, position) => {
    const task = picks.find((pick) => pick.id === id)
    return task ? [{ ...task, position }] : []
  })
  // My own day, as in the check-in, so "Today" and a snooze's day mean the same in both.
  const myDay = checkin.today.day
  const notDone = tasks.filter((task) => task.status !== "done")
  // A snoozed task stays out of Open until the morning of its day.
  const open = notDone.filter((task) => !task.snoozedUntil || task.snoozedUntil <= myDay)
  const snoozed = notDone.length - open.length
  const done = tasks.filter((task) => task.status === "done")
  const [view, setView] = useRememberedChoice<MyView>(MY_TASK_VIEW_KEY, "list", MY_VIEWS)
  const [statusOrder, setStatusOrder] = useSyncedDraft(dashboard.statusOrder)
  // The task waiting for its Stuck reason, from a Board drop.
  const [stuck, setStuck] = React.useState<TaskCard | null>(null)
  const waitingTasks = open.filter((task) => task.waiting)
  const waiting = waitingTasks.length
  // The same tasks as the List's Overdue group, by my own day.
  const overdueTasks = open.filter((task) => dueGroupOf({ ...task, waiting: false }, myDay) === "overdue")
  const overdue = overdueTasks.length
  const [catchingUp, setCatchingUp] = React.useState(false)
  const [savingView, setSavingView] = React.useState(false)
  // Tasks here come from many projects, so every live type is offered and a
  // project that doesn't offer one refuses it for its own tasks.
  const bulk = {
    people: checkin.people,
    projects: [],
    tags: dashboard.labels,
    types: dashboard.taskTypes.filter((type) => !type.archived),
  }
  const clients = clientChoices([...open, ...done].map((task) => task.projectClient))
  const here = { screen: dashboard.viewScreen, labels: dashboard.labels, types: dashboard.taskTypes, clients }

  async function reorder(next: string[]) {
    setOrder({ from: savedOrder, ids: next })
    const ok = await run(() => orderMyPicks(next))
    if (!ok) setOrder(null)
    else await router.invalidate()
  }

  /** Each waiting task is accepted on its own; one that changed hands is refused alone. */
  async function acceptAll() {
    let result = { accepted: [] as string[], refused: [] as { title: string; reason: string }[] }
    const ok = await run(async () => {
      result = await acceptTasks(waitingTasks.map((task) => task.id))
    })
    if (!ok) return
    const accepted = `${result.accepted.length} accepted`
    if (result.refused.length) {
      const first = result.refused[0]
      showErrorToast(
        `${accepted}, ${result.refused.length} refused. ${first.title ? `"${first.title}": ` : ""}${first.reason}`
      )
    } else {
      toast.success(`${accepted}.`)
    }
    await router.invalidate()
  }

  /** A Board drop in another column: the same status change as on the task. */
  async function changeStatus(task: TaskCard, status: TaskStatus, stuckReason: string | null) {
    if (task.status === status) return true
    const before = tasks
    setTasks((current) => current.map((t) => (t.id === task.id ? { ...t, status, stuckReason } : t)))
    const ok = await run(() => setStatus({ taskId: task.id, status, stuckReason }), status === "stuck" ? "Marked Stuck." : undefined)
    if (!ok) setTasks(before)
    await router.invalidate()
    return ok
  }

  /** A Board column dropped in a new place: my own order, shown at once, put back if refused. */
  async function changeStatusOrder(next: TaskStatus[]) {
    const before = statusOrder
    setStatusOrder(next)
    const ok = await run(() => saveMyStatusOrder(next))
    if (!ok) setStatusOrder(before)
    else await router.invalidate()
  }

  /** A day dropped on the Calendar, or a bar moved on the Timeline: the same save as on the task. */
  async function changeDates(task: TaskCard, dates: { startDate?: string | null; dueDate?: string | null }) {
    const before = tasks
    setTasks((current) => current.map((t) => (t.id === task.id ? { ...t, ...dates } : t)))
    const ok = await run(() => saveTask({ taskId: task.id, ...dates }))
    if (!ok) setTasks(before)
    await router.invalidate()
  }

  function saveView() {
    if (!viewHasFilters(filters)) {
      showErrorToast("Search or pick a filter first, then save it as a view.")
      return
    }
    setSavingView(true)
  }

  const filtered = hasTaskFilters(filters)
  // The List: today's picks first, in my own order, then my open tasks by when
  // they are due, then Done. A pick is listed once, under the picks.
  const picked = new Set(today.map((task) => task.id))
  const listRows = filterTasks(
    [...today, ...open.filter((task) => !picked.has(task.id)).sort(byDueDate), ...done],
    filters
  )
  // The Board, Calendar and Timeline: every task of mine they can show, snoozed ones still hidden.
  const shown = filterTasks([...open, ...done], filters)
  const projects = [...new Map(shown.map((task) => [task.projectId, task.projectName])).entries()].map(
    ([key, label]) => ({ key, label })
  )

  return (
    <>
      {/* The project page's header, copied here (Tyler, 14 Oct 2026): underlined tabs,
          then search, Filter, Views and New task. No members
          dropdown, since every task here is mine. */}
      <DashboardCardHeader className="@container">
        <DashboardTabs
          value={view}
          onValueChange={(value) => setView(value as MyView)}
          tabs={[
            { value: "list", label: "List" },
            { value: "board", label: "Board" },
            { value: "calendar", label: "Calendar" },
            { value: "timeline", label: "Timeline" },
          ]}
        />
        <div className="flex shrink-0 items-center gap-1">
          <SearchToggle value={filters.q ?? ""} onChange={(q) => onFilters({ q: q || undefined })} />
          <TaskFilterPopover
            filters={filters}
            onChange={onFilters}
            labels={dashboard.labels}
            types={dashboard.taskTypes}
            buttonVariant="ghost"
            onSaveView={saveView}
            clients={clients}
          />
          <SavedViewsControls
            views={dashboard.views}
            filters={filters}
            onChange={onFilters}
            here={here}
            saveButton={false}
            buttonVariant="ghost"
          />
          <NewTaskWithProjectPicker align="end">
            {(loading) => (
              // Words where there is room; an icon with its name in a narrow panel.
              <Button
                type="button"
                className="ml-1 @max-3xl:size-8 @max-3xl:px-0"
                aria-label="New task"
                disabled={loading}
              >
                {loading ? <Loader2Icon className="size-4 animate-spin" /> : <PlusIcon className="size-4" />}
                <span className="@max-3xl:hidden">New task</span>
              </Button>
            )}
          </NewTaskWithProjectPicker>
        </div>
      </DashboardCardHeader>
      {overdue && !filtered ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-destructive/10 px-4 py-2 text-destructive">
          <p className="flex items-center gap-2 text-sm">
            <AlarmClockIcon className="size-4 shrink-0" aria-hidden />
            {overdue === 1 ? "1 task is overdue." : `${overdue} tasks are overdue.`}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="bg-background text-destructive hover:text-destructive"
            onClick={() => setCatchingUp(true)}
          >
            Catch up
          </Button>
        </div>
      ) : null}
      {waiting && !filtered ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-4 py-2">
          <p className="text-sm">
            {waiting === 1
              ? "1 task is waiting for you to accept it or hand it back."
              : `${waiting} tasks are waiting for you to accept them or hand them back.`}
          </p>
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void acceptAll()}>
            <CheckCheckIcon className="size-4" />
            Accept all {waiting} {plural(waiting, "task")}
          </Button>
        </div>
      ) : null}
      <CatchUpDialog open={catchingUp} tasks={overdueTasks} onClose={() => setCatchingUp(false)} />
      <SaveViewDialog open={savingView} filters={filters} here={here} onClose={() => setSavingView(false)} />
      {snoozed ? (
        <p className="border-b px-4 py-2 text-sm text-muted-foreground">
          {snoozed === 1
            ? "1 snoozed task is hidden until its day."
            : `${snoozed} snoozed tasks are hidden until their day.`}
        </p>
      ) : null}
      {view !== "list" && filtered && shown.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">
          No tasks match {filters.q?.trim() ? `"${filters.q.trim()}"` : "these filters"}. Clear the filters to see
          them all.
        </p>
      ) : view === "board" ? (
        <TaskBoard
          tasks={shown}
          openTaskId={openTaskId}
          readOnly={busy}
          onOpenTask={onOpenTask}
          onMove={(task, status) => (status === "stuck" ? setStuck(task) : void changeStatus(task, status, null))}
          onReorder={() => undefined}
          cardOrder="due"
          showProject
          statusOrder={statusOrder}
          onStatusOrder={(next) => void changeStatusOrder(next)}
        />
      ) : view === "calendar" ? (
        <TaskCalendar
          tasks={shown}
          readOnly={busy}
          onOpenTask={onOpenTask}
          onDueDate={(task, dueDate) => void changeDates(task, { dueDate })}
        />
      ) : view === "timeline" ? (
        <TaskTimeline
          tasks={shown}
          groups={projects.length > 1 ? projects : undefined}
          groupsOf={(task) => [task.projectId]}
          readOnly={busy}
          onOpenTask={onOpenTask}
          onDates={(task, dates) => void changeDates(task, dates)}
        />
      ) : (
        <MyTaskRows
          openTaskId={openTaskId}
          tasks={listRows}
          bulk={bulk}
          onReorder={filtered ? undefined : (next) => void reorder(next)}
          reorderGroup={PICKED_GROUP}
          onOpenTask={(task) => onOpenTask(task.id)}
          groups={LIST_GROUPS}
          groupOf={(task) => (picked.has(task.id) ? PICKED_GROUP : task.status === "done" ? "done" : dueGroupOf(task, myDay))}
          emptyText={
            filtered
              ? `No tasks match ${filters.q?.trim() ? `"${filters.q.trim()}"` : "these filters"}. Clear the filters to see them all.`
              : "Nothing assigned to you right now."
          }
        />
      )}
      <ReasonDialog
        open={Boolean(stuck)}
        title="Why is it stuck?"
        description={stuck ? `"${stuck.title}" moves to Stuck, and whoever handed it out is told.` : ""}
        label="Reason"
        confirmLabel="Mark Stuck"
        busy={busy}
        onClose={() => setStuck(null)}
        onConfirm={async (reason) => (stuck ? changeStatus(stuck, "stuck", reason) : false)}
      />
    </>
  )
}

const PICKED_GROUP = "picked"

/** The List's groups: today's picks, then when the rest are due, then Done. */
const LIST_GROUPS = [{ key: PICKED_GROUP, label: "Picked for today" }, ...DUE_GROUPS, { key: "done", label: "Done" }]

/** Soonest first; tasks with no date last, then by title. */
function byDueDate(a: TaskCard, b: TaskCard) {
  return (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || a.title.localeCompare(b.title)
}

type InboxTab = "all" | "unread" | "tasks" | "flows" | "news"

/** Which inbox tab a notice belongs to, beside All and Unread. */
function inboxTabOf(item: NotificationItem, categoryId: string | undefined): InboxTab | null {
  if (categoryId === "tasks") return "tasks"
  if (item.type === "automation_approval" || item.type === "automation_failed") return "flows"
  if (item.type === "changelog" || item.type === "announcement") return "news"
  return null
}

/**
 * My notices, the same ones the bell holds, with the newest first, as Tyler
 * drew the panel on 13 Oct 2026: "Inbox · 5 unread" with Mark all read, then
 * All, Unread, Tasks (Project's own notices), Flows (automations waiting or
 * failed) and News (updates and announcements). Clicking one goes where the
 * bell would take it and marks it read.
 */
function InboxPanel({ notifications }: { notifications: NotificationItem[] }) {
  const navigate = useNavigate()
  const router = useRouter()
  const { onOpenFeedbackThread } = useShellRuntime()
  const details = useAppNotificationDetails(notifications)
  const [readHere, setReadHere] = React.useState<Record<string, string>>({})
  const [tab, setTab] = React.useState<InboxTab>("all")
  const [markingAll, setMarkingAll] = React.useState(false)
  const isUnread = (item: NotificationItem) => !item.read_at && !readHere[item.id]
  const unread = notifications.filter(isUnread).length
  const shown = notifications.filter((item) =>
    tab === "all" ? true : tab === "unread" ? isUnread(item) : inboxTabOf(item, details[item.id]?.categoryId) === tab
  )

  function open(item: NotificationItem) {
    if (isUnread(item)) {
      setReadHere((current) => ({ ...current, [item.id]: new Date().toISOString() }))
      // A failed save puts the unread dot back, as the bell does.
      markNotificationRead(item.id).catch((error: unknown) => {
        setReadHere((current) => {
          const rest = { ...current }
          delete rest[item.id]
          return rest
        })
        showErrorToast(getProjectErrorMessage(error))
      })
    }
    // The same places the bell opens: the app's own address first, then the
    // shell's for its own notices.
    const href = details[item.id]?.href
    if (href) {
      void navigate({ href })
      return
    }
    const action = notificationAction(item)
    if (action.kind === "changelog") void navigate({ to: "/changelog/whats-new" })
    else if (action.kind === "billing")
      void navigate({ to: ".", search: (prev) => ({ ...prev, account: "billing" }) })
    else if (action.kind === "automationRun")
      void navigate({
        to: "/admin/automations/$automationId",
        params: { automationId: action.automationId },
        search: { run: action.runId, node: action.nodeId },
      })
    else if (action.kind === "crmThread")
      void navigate({ to: "/admin/crm", search: { open: action.threadId } })
    else if (action.kind === "feedback") onOpenFeedbackThread(action.feedbackId)
  }

  async function markAllRead() {
    if (unread === 0) {
      toast.message("Everything here is read.")
      return
    }
    if (markingAll) return
    setMarkingAll(true)
    try {
      const result = await markAllNotificationsRead()
      setReadHere((current) => {
        const next = { ...current }
        for (const id of result.notificationIds) next[id] = result.readAt
        return next
      })
      await router.invalidate()
    } catch (error) {
      showErrorToast(getProjectErrorMessage(error))
    } finally {
      setMarkingAll(false)
    }
  }

  return (
    <>
      <DashboardCardHeader>
        <h2 className="min-w-0 flex-1 truncate text-sm font-medium">
          Inbox
          {unread ? <span className="ml-2 font-normal text-muted-foreground">{unread} unread</span> : null}
        </h2>
        <Button type="button" variant="secondary" size="sm" disabled={markingAll} onClick={() => void markAllRead()}>
          {markingAll ? <Loader2Icon className="size-4 animate-spin" /> : null}
          Mark all read
        </Button>
      </DashboardCardHeader>
      <Tabs value={tab} onValueChange={(value) => setTab(value as InboxTab)}>
        <ScrollArea className="border-b">
          <div className="px-3 py-2">
            <TabsList className="justify-start">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="unread">Unread</TabsTrigger>
              <TabsTrigger value="tasks">Tasks</TabsTrigger>
              <TabsTrigger value="flows">Flows</TabsTrigger>
              <TabsTrigger value="news">News</TabsTrigger>
            </TabsList>
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </Tabs>
      <ScrollArea className="min-h-0 flex-1" viewportClassName="h-full">
        {notifications.length === 0 ? (
          <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <ListChecksIcon className="size-4" aria-hidden />
            Nothing yet. Tasks handed to you, comments and check-in reminders land here.
          </p>
        ) : shown.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            {tab === "unread" ? "Nothing unread." : "Nothing here yet."}
          </p>
        ) : (
          <div className="flex flex-col gap-1 p-3">
            {shown.map((item) => (
              <NotificationRow
                key={item.id}
                item={readHere[item.id] && !item.read_at ? { ...item, read_at: readHere[item.id] } : item}
                detail={details[item.id]}
                onClick={() => open(item)}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </>
  )
}

/** My job title, which shows beside my name wherever the team sees it. */
function MyJobTitle({ title }: { title: string | null }) {
  const teamId = useTeamId()
  const router = useRouter()
  const [draft, setDraft] = useSyncedDraft(title ?? "")
  const [saveState, track] = useSaveLine()

  async function save() {
    const next = draft.trim()
    if (next === (title ?? "")) return
    if (await track(() => saveMemberTitle({ title: next || null }, teamId))) {
      await router.invalidate()
    }
  }

  return (
    // The card around it is named Job title, so the name is for screen readers only, and
    // nothing sits above the box: an empty row there was a gap (Tyler, 14 Oct 2026).
    <div className="grid gap-2">
      <Label htmlFor="my-job-title" className="sr-only">
        Job title
      </Label>
      <Input
        id="my-job-title"
        value={draft}
        maxLength={LIMITS.memberTitle}
        placeholder="Copywriter, Designer…"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => void save()}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur()
        }}
      />
      <SaveLine state={saveState} className="empty:hidden" />
    </div>
  )
}
