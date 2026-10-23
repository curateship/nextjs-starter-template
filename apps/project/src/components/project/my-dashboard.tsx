import * as React from "react"
import { useNavigate, useRouter } from "@tanstack/react-router"
import { SettingsIcon } from "lucide-react"

import { CheckinDialog, StatusLine } from "@/components/project/checkin-dialog"
import { CheckoutDialog } from "@/components/project/checkout-dialog"
import { InboxCard, type InboxPage } from "@/components/project/inbox-card"
import { MyTasksPanel } from "@/components/project/my-tasks-panel"
import { MyWeekSection } from "@/components/project/my-week-card"
import { MyCheckinTime } from "@/components/project/my-checkin-time"
import { MyNoticeSwitches } from "@/components/project/my-notice-switches"
import { SaveLine } from "@/components/project/save-line"
import { OptionCard } from "@/components/project/option-card"
import { PanelCard } from "@/components/project/panel-card"
import { PersonPages } from "@/components/project/person-pages"
import { PersonAvatar, TintChip } from "@/components/project/task-bits"
import { TaskSidePanel } from "@/components/project/task-side-panel"
import { TeamStart } from "@/components/project/team-start"
import { ThreePanels } from "@/components/project/three-panels"
import { TimeOffSection } from "@/components/project/time-off-card"
import { DashboardCardHeader } from "@/components/shared/dashboard-card-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { orderMyPicks, saveMyStatusOrder, type MyDashboard as MyDashboardData } from "@/lib/api/project/checkins"
import { saveMemberTitle } from "@/lib/api/project/team-running"
import { formatDate } from "@/lib/format/format-time"
import { useSyncedDraft } from "@/lib/hooks/use-synced-draft"
import { useTaskAddress } from "@/lib/hooks/use-task-address"
import { MY_DASHBOARD_PANEL_LAYOUT_KEY, MY_OPEN_TASK_KEY } from "@/lib/project/panel-keys"
import { clockIn, clockLabel } from "@/lib/project/days"
import { LIMITS } from "@/lib/project/rules"
import type { TaskFilters } from "@/lib/project/task-filters"
import { todaysPicks } from "@/lib/project/todays-picks"
import { useSaveLine } from "@/lib/project/use-save-line"
import { useMyLive } from "@/lib/project/use-my-live"
import { useRememberedTask } from "@/lib/project/use-remembered-task"
import { cn } from "@/lib/utils"
import { useTeamId } from "@/lib/project/team-scope"

export type MyDashboardSearch = Omit<TaskFilters, "person"> & {
  /** The task open in the right panel. */
  task?: string
  /** Opens the check-in window, which is where the bell's reminder goes. */
  checkin?: true
  /** Opens the optional evening check-out. */
  checkout?: true
}


/**
 * My dashboard: me on the left with today's check-in and my inbox, my tasks
 * in the middle, and the open task on the right, as on the project page
 * (Tyler, 13 Oct 2026), never empty and with no cross (23 Oct 2026). The
 * check-in opens as a window from here.
 */
const MY_DASHBOARD_ROUTE_ID = "/_authenticated/dashboard"

export function MyDashboardScreen({
  dashboard,
  inbox,
  search,
}: {
  dashboard: MyDashboardData | null
  inbox: InboxPage
  search: MyDashboardSearch
}) {
  if (!dashboard) return <TeamStart />
  return <Dashboard dashboard={dashboard} inbox={inbox} search={search} />
}

function Dashboard({
  dashboard,
  inbox,
  search,
}: {
  dashboard: MyDashboardData
  inbox: InboxPage
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
  const [rows, setRows] = React.useState<string[] | null>(null)
  const quietTask = useRememberedTask({ storageKey: MY_OPEN_TASK_KEY, taskId: search.task, ids: rows })

  return (
    <PersonPages>
      <ThreePanels
        layoutKey={MY_DASHBOARD_PANEL_LAYOUT_KEY}
        // A task opened on arrival leaves a narrow screen on the list.
        showRightFor={search.task === quietTask ? undefined : search.task}
        left={{
          label: "Me",
          showLabel: "Show my details",
          content: (
            <MePanel
              dashboard={dashboard}
              inbox={inbox}
              onCheckIn={() => go({ checkin: true })}
              onCheckOut={() => go({ checkout: true })}
            />
          ),
        }}
        middle={{
          label: "My tasks",
          content: (
            <MyTasksPanel
              source={{
                tasks: dashboard.tasks,
                picks: todaysPicks(dashboard.checkin),
                orderPicks: orderMyPicks,
                today: dashboard.checkin.today.day,
                people: dashboard.checkin.people,
                labels: dashboard.labels,
                taskTypes: dashboard.taskTypes,
                views: dashboard.views,
                viewScreen: dashboard.viewScreen,
                statusOrder: dashboard.statusOrder,
                saveStatusOrder: saveMyStatusOrder,
                myUserId: dashboard.me.id,
                // A task is deleted by whoever made it.
                canDelete: (task) => task.createdByUserId === dashboard.me.id,
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
              onFilters={(patch) => go(patch, { replace: true })}
              onOpenTask={taskAddress.open}
              onRows={setRows}
            />
          ),
        }}
        right={{
          label: "Task",
          showLabel: "Show the task",
          content: <TaskSidePanel taskId={search.task} onClose={taskAddress.back} onLoaded={taskLoaded} />,
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
  inbox,
  onCheckIn,
  onCheckOut,
}: {
  dashboard: MyDashboardData
  inbox: InboxPage
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
          <InboxCard inbox={inbox} />
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
