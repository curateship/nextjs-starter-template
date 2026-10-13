import * as React from "react"
import { useNavigate, useRouter } from "@tanstack/react-router"
import {
  BellIcon,
  CalendarCheckIcon,
  CheckCheckIcon,
  LayoutDashboardIcon,
  ListChecksIcon,
  MoonIcon,
  PlaneIcon,
} from "lucide-react"
import { toast } from "sonner"

import { CheckinDialog, StatusLine } from "@/components/project/checkin-dialog"
import { CheckoutDialog } from "@/components/project/checkout-dialog"
import { MyWeekSection } from "@/components/project/my-week-card"
import { MyCheckinTime } from "@/components/project/my-checkin-time"
import { MyNoticeSwitches } from "@/components/project/my-notice-switches"
import { SaveLine } from "@/components/project/save-line"
import { SavedViewsControls } from "@/components/project/saved-views"
import { PersonPages } from "@/components/project/person-pages"
import { PersonAvatar } from "@/components/project/task-bits"
import { TaskFiltersBar } from "@/components/project/task-filters-bar"
import { TaskInPlace } from "@/components/project/task-in-place"
import { TaskList } from "@/components/project/task-list"
import { TeamStart } from "@/components/project/team-start"
import { ThreePanels } from "@/components/project/three-panels"
import { TimeOffSection } from "@/components/project/time-off-card"
import { NotificationRow } from "@/components/shared/notification-row"
import { useShellRuntime } from "@/components/shell/shell-layout"
import {
  DashboardCardTabsHeader,
  DashboardCardTitleHeader,
} from "@/components/shared/dashboard-card-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsCount, TabsTrigger } from "@/components/ui/tabs"
import { orderMyPicks, type MyDashboard as MyDashboardData } from "@/lib/api/project/checkins"
import { acceptTasks } from "@/lib/api/project/tasks"
import { markNotificationRead, type NotificationItem } from "@/lib/api/notification"
import { saveMemberTitle } from "@/lib/api/project/team-running"
import type { InviteForMe } from "@/lib/api/project/teams"
import { formatDate } from "@/lib/format/format-time"
import { plural } from "@/lib/format/plural"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useAppNotificationDetails } from "@/lib/hooks/use-app-notification-details"
import { useSyncedDraft } from "@/lib/hooks/use-synced-draft"
import { useTaskAddress } from "@/lib/hooks/use-task-address"
import { notificationAction } from "@/lib/notification-action"
import { MY_DASHBOARD_PANEL_LAYOUT_KEY } from "@/lib/project/panel-keys"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { clockIn } from "@/lib/project/days"
import { LIMITS, TEAM_ROLE_LABEL, runsTheTeam } from "@/lib/project/rules"
import {
  DUE_GROUPS,
  dueGroupOf,
  filterTasks,
  hasTaskFilters,
  type TaskFilters,
} from "@/lib/project/task-filters"
import { todaysPicks } from "@/lib/project/todays-picks"
import { useReloadAfterReading } from "@/lib/project/use-reload-after-reading"
import { useSaveLine } from "@/lib/project/use-save-line"
import { showErrorToast } from "@/lib/toast/error-toast"

export type MyDashboardSearch = Omit<TaskFilters, "person"> & {
  /** The task open in the middle panel. */
  task?: string
  /** Opens the check-in window, which is where the bell's reminder goes. */
  checkin?: true
  /** Opens the optional evening check-out. */
  checkout?: true
}

type TaskTab = "today" | "open" | "done"

/**
 * My dashboard: me on the left with today's check-in, my tasks in the middle,
 * and my inbox on the right. A task opens in the middle panel in my tasks'
 * place. The check-in opens as a window from here.
 */
export function MyDashboardScreen({
  dashboard,
  invites,
  notifications,
  search,
}: {
  dashboard: MyDashboardData | null
  invites: InviteForMe[]
  notifications: NotificationItem[]
  search: MyDashboardSearch
}) {
  if (!dashboard) return <TeamStart invites={invites} />
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
  useReloadAfterReading(
    search.task,
    dashboard.tasks,
    React.useCallback(() => void router.invalidate(), [router])
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
        showMiddleFor={search.task}
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
            <TaskInPlace taskId={search.task} onBack={taskAddress.back}>
              <MyTasksPanel
                dashboard={dashboard}
                filters={{ q: search.q, status: search.status, label: search.label, type: search.type }}
                onFilters={(patch) => go(patch, { replace: true })}
                onOpenTask={taskAddress.open}
              />
            </TaskInPlace>
          ),
        }}
        right={{
          label: "Inbox",
          showLabel: "Show my inbox",
          content: <InboxPanel notifications={notifications} />,
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
  return (
    <>
      <DashboardCardTitleHeader icon={<LayoutDashboardIcon className="size-4" />} title="My dashboard" />
      <ScrollArea className="min-h-0 flex-1" viewportClassName="h-full">
        <div className="grid gap-5 p-4">
          <div className="flex items-center gap-3">
            <PersonAvatar name={me.name} avatarUrl={me.avatarUrl} size="default" className="size-12" />
            <div className="grid min-w-0">
              <span className="truncate font-medium">{me.name}</span>
              <span className="truncate text-sm text-muted-foreground">{me.email}</span>
            </div>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Team</dt>
            <dd className="min-w-0 truncate">{me.teamName}</dd>
            <dt className="text-muted-foreground">Role</dt>
            <dd>{TEAM_ROLE_LABEL[me.role]}</dd>
            <dt className="text-muted-foreground">Joined</dt>
            <dd>{formatDate(me.joinedAt)}</dd>
          </dl>
          <MyJobTitle title={me.title} />
          <Separator />
          <section className="grid gap-3" aria-labelledby="my-today-heading">
            <h3 id="my-today-heading" className="flex items-center gap-2 text-sm font-medium">
              <CalendarCheckIcon className="size-4 text-muted-foreground" aria-hidden />
              Today's check-in
            </h3>
            <p className="text-sm text-muted-foreground">
              <StatusLine page={checkin} />
            </p>
            {dashboard.record.of ? (
              // Only I see this; it is never shown to the owner.
              <p className="text-sm">
                On time {dashboard.record.onTime} of the last {dashboard.record.of} work{" "}
                {dashboard.record.of === 1 ? "day" : "days"}
              </p>
            ) : null}
            {checkin.checkout?.at ? (
              <p className="text-sm text-muted-foreground">
                You checked out at {clockIn(checkin.checkout.at, checkin.clock.zone)}.
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant={checkin.checkin ? "outline" : "default"} onClick={onCheckIn}>
                <CalendarCheckIcon className="size-4" />
                {checkin.checkin ? "Change today's picks" : "Check in"}
              </Button>
              {/* Optional, so it never nags: a plain button once checked in, nothing more. */}
              {checkin.checkin ? (
                <Button type="button" variant="outline" onClick={onCheckOut}>
                  <MoonIcon className="size-4" />
                  {checkin.checkout?.at ? "Change check-out" : "Check out"}
                </Button>
              ) : null}
            </div>
          </section>
          <Separator />
          <MyWeekSection reload={dashboard} />
          <Separator />
          <section className="grid gap-3" aria-labelledby="my-time-off-heading">
            <h3 id="my-time-off-heading" className="flex items-center gap-2 text-sm font-medium">
              <PlaneIcon className="size-4 text-muted-foreground" aria-hidden />
              Time off
            </h3>
            <TimeOffSection idPrefix="my-time-off" />
          </section>
          <Separator />
          <MyCheckinTime clock={checkin.clock} />
          <Separator />
          <MyNoticeSwitches off={dashboard.noticesOff} runsTheTeam={runsTheTeam(me.role)} />
        </div>
      </ScrollArea>
    </>
  )
}

function MyTasksPanel({
  dashboard,
  filters,
  onFilters,
  onOpenTask,
}: {
  dashboard: MyDashboardData
  filters: TaskFilters
  onFilters: (patch: Partial<TaskFilters>) => void
  onOpenTask: (taskId: string) => void
}) {
  const router = useRouter()
  const [run, busy] = useAsyncAction(getProjectErrorMessage)
  const { tasks, checkin } = dashboard
  // Today's picks can include a carried-over task since handed to someone else,
  // so they are read from the check-in rather than from my own tasks. They come
  // in my own order; a drag shows at once and goes back if the save fails.
  const picks = todaysPicks(checkin)
  const savedOrder = picks.map((task) => task.id).join(",")
  const [order, setOrder] = React.useState<{ from: string; ids: string[] } | null>(null)
  const ids = order && order.from === savedOrder ? order.ids : picks.map((task) => task.id)
  const today = ids.flatMap((id, position) => {
    const task = picks.find((pick) => pick.id === id)
    // The list's "order" column reads `position`, so my order rides there.
    return task ? [{ ...task, position }] : []
  })
  // My own day, as in the check-in, so "Today" and a snooze's day mean the same in both.
  const myDay = checkin.today.day
  const notDone = tasks.filter((task) => task.status !== "done")
  // A snoozed task stays out of Open until the morning of its day.
  const open = notDone.filter((task) => !task.snoozedUntil || task.snoozedUntil <= myDay)
  const snoozed = notDone.length - open.length
  const done = tasks.filter((task) => task.status === "done")
  const [tab, setTab] = React.useState<TaskTab>(today.length ? "today" : "open")
  const waitingTasks = open.filter((task) => task.waiting)
  const waiting = waitingTasks.length
  const bulk = { people: checkin.people, projects: [] }

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
  const rows = filterTasks(tab === "today" ? today : tab === "open" ? open : done, filters)
  const filtered = hasTaskFilters(filters)

  return (
    <>
      <Tabs value={tab} onValueChange={(value) => setTab(value as TaskTab)}>
        <DashboardCardTabsHeader>
          <TabsTrigger value="today">
            Today <TabsCount>{today.length}</TabsCount>
          </TabsTrigger>
          <TabsTrigger value="open">
            Open <TabsCount>{open.length}</TabsCount>
          </TabsTrigger>
          <TabsTrigger value="done">
            Done <TabsCount>{done.length}</TabsCount>
          </TabsTrigger>
        </DashboardCardTabsHeader>
      </Tabs>
      <TaskFiltersBar
        filters={filters}
        onChange={onFilters}
        labels={dashboard.labels}
        types={dashboard.taskTypes}
      >
        <SavedViewsControls
          views={dashboard.views}
          filters={filters}
          onChange={onFilters}
          here={{ projectId: null, labels: dashboard.labels, types: dashboard.taskTypes }}
        />
      </TaskFiltersBar>
      {tab === "open" && waiting && !filtered ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2">
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
      {tab === "open" && snoozed ? (
        <p className="border-b px-4 py-2 text-sm text-muted-foreground">
          {snoozed === 1
            ? "1 snoozed task is hidden until its day."
            : `${snoozed} snoozed tasks are hidden until their day.`}
        </p>
      ) : null}
      <TaskList
        // Each tab keeps its own sort: Today starts in my order, the others by due date.
        key={tab}
        tasks={rows}
        readOnly={false}
        showProject
        bulk={bulk}
        onReorder={tab === "today" && !filtered ? (next) => void reorder(next) : undefined}
        orderLabel="my order"
        onOpenTask={(task) => onOpenTask(task.id)}
        groups={tab === "open" ? DUE_GROUPS : undefined}
        groupOf={(task) => dueGroupOf(task, myDay)}
        emptyText={
          filtered
            ? `No tasks match ${filters.q?.trim() ? `"${filters.q.trim()}"` : "these filters"}. Clear the filters to see them all.`
            : tab === "today"
              ? checkin.checkin
                ? "You checked in with nothing picked."
                : "Check in to pick today's tasks."
              : tab === "open"
                ? "Nothing assigned to you right now."
                : "No finished tasks yet."
        }
      />
    </>
  )
}

/**
 * My notices, the same ones the bell holds, with the newest first. Clicking
 * one goes where the bell would take it and marks it read.
 */
function InboxPanel({ notifications }: { notifications: NotificationItem[] }) {
  const navigate = useNavigate()
  const { onOpenFeedbackThread } = useShellRuntime()
  const details = useAppNotificationDetails(notifications)
  const [readHere, setReadHere] = React.useState<Record<string, string>>({})
  const unread = notifications.filter((item) => !item.read_at && !readHere[item.id]).length

  function open(item: NotificationItem) {
    if (!item.read_at && !readHere[item.id]) {
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

  return (
    <>
      <DashboardCardTitleHeader
        icon={<BellIcon className="size-4" />}
        title="Inbox"
        meta={unread ? `${unread} unread` : undefined}
      />
      <ScrollArea className="min-h-0 flex-1" viewportClassName="h-full">
        {notifications.length === 0 ? (
          <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <ListChecksIcon className="size-4" aria-hidden />
            Nothing yet. Tasks handed to you, comments and check-in reminders land here.
          </p>
        ) : (
          <div className="flex flex-col gap-1 p-3">
            {notifications.map((item) => (
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
  const router = useRouter()
  const [draft, setDraft] = useSyncedDraft(title ?? "")
  const [saveState, track] = useSaveLine()

  async function save() {
    const next = draft.trim()
    if (next === (title ?? "")) return
    if (await track(() => saveMemberTitle({ title: next || null }))) {
      await router.invalidate()
    }
  }

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="my-job-title">Job title</Label>
        <SaveLine state={saveState} />
      </div>
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
    </div>
  )
}
