import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import {
  BellIcon,
  CalendarCheckIcon,
  LayoutDashboardIcon,
  ListChecksIcon,
} from "lucide-react"

import { CheckinDialog, StatusLine } from "@/components/project/checkin-dialog"
import { MyCheckinTime } from "@/components/project/my-checkin-time"
import { PersonAvatar } from "@/components/project/task-bits"
import { TaskDialog } from "@/components/project/task-dialog"
import { TaskList } from "@/components/project/task-list"
import { TeamStart } from "@/components/project/team-start"
import { ThreePanels } from "@/components/project/three-panels"
import { NotificationRow } from "@/components/shared/notification-row"
import { useShellRuntime } from "@/components/shell/shell-layout"
import {
  DashboardCardTabsHeader,
  DashboardCardTitleHeader,
} from "@/components/shared/dashboard-card-header"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsCount, TabsTrigger } from "@/components/ui/tabs"
import type { MyDashboard as MyDashboardData } from "@/lib/api/project/checkins"
import { markNotificationRead, type NotificationItem } from "@/lib/api/notification"
import type { InviteForMe } from "@/lib/api/project/teams"
import { formatDate } from "@/lib/format/format-time"
import { useAppNotificationDetails } from "@/lib/hooks/use-app-notification-details"
import { notificationAction } from "@/lib/notification-action"
import { MY_DASHBOARD_PANEL_LAYOUT_KEY } from "@/lib/project/panel-keys"
import { TEAM_ROLE_LABEL } from "@/lib/project/rules"

export type MyDashboardSearch = {
  /** The task whose window is open. */
  task?: string
  /** Opens the check-in window, which is where the bell's reminder goes. */
  checkin?: true
}

type TaskTab = "today" | "open" | "done"

/**
 * My dashboard: me on the left with today's check-in, my tasks in the middle,
 * and my inbox on the right. The check-in opens as a window from here.
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
  const go = React.useCallback(
    (patch: Partial<MyDashboardSearch>) =>
      void navigate({
        to: ".",
        search: (previous: Record<string, unknown>) => {
          const next: Record<string, unknown> = { ...previous, ...patch }
          for (const key of Object.keys(next)) if (next[key] === undefined) delete next[key]
          return next
        },
      }),
    [navigate]
  )

  return (
    <ThreePanels
      layoutKey={MY_DASHBOARD_PANEL_LAYOUT_KEY}
      left={{
        label: "Me",
        showLabel: "Show my details",
        content: <MePanel dashboard={dashboard} onCheckIn={() => go({ checkin: true })} />,
      }}
      middle={{
        label: "My tasks",
        content: <MyTasksPanel dashboard={dashboard} onOpenTask={(task) => go({ task })} />,
      }}
      right={{
        label: "Inbox",
        showLabel: "Show my inbox",
        content: <InboxPanel notifications={notifications} />,
      }}
    >
      <TaskDialog taskId={search.task ?? null} onClose={() => go({ task: undefined })} />
      <CheckinDialog
        page={dashboard.checkin}
        open={search.checkin === true}
        onClose={() => go({ checkin: undefined })}
      />
    </ThreePanels>
  )
}

function MePanel({ dashboard, onCheckIn }: { dashboard: MyDashboardData; onCheckIn: () => void }) {
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
          <Separator />
          <section className="grid gap-3" aria-labelledby="my-today-heading">
            <h3 id="my-today-heading" className="flex items-center gap-2 text-sm font-medium">
              <CalendarCheckIcon className="size-4 text-muted-foreground" aria-hidden />
              Today's check-in
            </h3>
            <p className="text-sm text-muted-foreground">
              <StatusLine page={checkin} />
            </p>
            <div>
              <Button type="button" variant={checkin.checkin ? "outline" : "default"} onClick={onCheckIn}>
                <CalendarCheckIcon className="size-4" />
                {checkin.checkin ? "Change today's picks" : "Check in"}
              </Button>
            </div>
          </section>
          <Separator />
          <MyCheckinTime clock={checkin.clock} />
        </div>
      </ScrollArea>
    </>
  )
}

function MyTasksPanel({
  dashboard,
  onOpenTask,
}: {
  dashboard: MyDashboardData
  onOpenTask: (taskId: string) => void
}) {
  const { tasks, checkin } = dashboard
  const picked = new Set(checkin.pickedTaskIds)
  // Today's picks can include a carried-over task since handed to someone else,
  // so they are read from the check-in rather than from my own tasks.
  const today = checkin.groups.flatMap((group) => group.tasks).filter((task) => picked.has(task.id))
  const open = tasks.filter((task) => task.status !== "done")
  const done = tasks.filter((task) => task.status === "done")
  const [tab, setTab] = React.useState<TaskTab>(today.length ? "today" : "open")
  const waiting = open.filter((task) => task.waiting).length
  const rows = tab === "today" ? today : tab === "open" ? open : done

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
      {tab === "open" && waiting ? (
        <p className="border-b px-4 py-2 text-sm">
          {waiting === 1
            ? "1 task is waiting for you to accept it or hand it back."
            : `${waiting} tasks are waiting for you to accept them or hand them back.`}
        </p>
      ) : null}
      <TaskList
        tasks={rows}
        readOnly={false}
        showProject
        onOpenTask={(task) => onOpenTask(task.id)}
        emptyText={
          tab === "today"
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
      void markNotificationRead(item.id)
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
