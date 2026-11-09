import * as React from "react"
import { ClipboardCheckIcon, PlaneIcon } from "lucide-react"
import { useNavigate, useRouter } from "@tanstack/react-router"

import { CheckinDialog, StatusLine } from "@/components/project/checkin-dialog"
import { CheckoutDialog } from "@/components/project/checkout-dialog"
import { DailyCard, DailySkyBanner, rightSkyCover, useDailyNow } from "@/components/project/daily-card"
import { CityRow } from "@/components/project/daily-city-field"
import { DailyHoursRow } from "@/components/project/daily-settings"
import { InboxCard, type InboxPage } from "@/components/project/inbox-card"
import { MySettingsMenu } from "@/components/project/my-settings-menu"
import { PickGroup, PickRow } from "@/components/project/pick-rows"
import { MyTasksPanel } from "@/components/project/my-tasks-panel"
import { MyWeekSection } from "@/components/project/my-week-card"
import { MyCheckinTime } from "@/components/project/my-checkin-time"
import { MyNoticeSwitches } from "@/components/project/my-notice-switches"
import { SaveLine } from "@/components/project/save-line"
import { PanelCard } from "@/components/project/panel-card"
import { PersonPages } from "@/components/project/person-pages"
import { PersonAvatar, TintChip } from "@/components/project/task-bits"
import { TaskSidePanel } from "@/components/project/task-side-panel"
import { TeamStart } from "@/components/project/team-start"
import { ThreePanels } from "@/components/project/three-panels"
import { TimeOffSection } from "@/components/project/time-off-card"
import { SidePanelCollapseButton } from "@/components/shared/three-panels"
import { DashboardCardHeader } from "@/components/shared/dashboard-card-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { orderMyPicks, saveMyStatusOrder, type MyDashboard as MyDashboardData } from "@/lib/api/project/checkins"
import type { DailyCard as DailyCardData } from "@/lib/api/project/daily-card"
import { saveMemberTitle } from "@/lib/api/project/team-running"
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
import { PANEL_GUTTER } from "@/lib/project/panel-gutter"
import { cn } from "@/lib/utils"
import { useTeamId } from "@/lib/project/team-scope"
import { RightCoverProvider } from "@/components/shared/notes/page-cover"
import { useNow } from "@/lib/project/use-now"

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
  daily,
  inbox,
  search,
}: {
  dashboard: MyDashboardData | null
  daily: DailyCardData | null
  inbox: InboxPage
  search: MyDashboardSearch
}) {
  if (!dashboard || !daily) return <TeamStart />
  return <Dashboard dashboard={dashboard} daily={daily} inbox={inbox} search={search} />
}

function Dashboard({
  dashboard,
  daily,
  inbox,
  search,
}: {
  dashboard: MyDashboardData
  daily: DailyCardData
  inbox: InboxPage
  search: MyDashboardSearch
}) {
  const navigate = useNavigate()
  const router = useRouter()
  const taskAddress = useTaskAddress()
  const nowMs = useNow(daily.loadedAt)
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
        reopenInHeader
        layoutKey={MY_DASHBOARD_PANEL_LAYOUT_KEY}
        // A task opened on arrival leaves a narrow screen on the list.
        showRightFor={search.task === quietTask ? undefined : search.task}
        left={{
          label: "Me",
          showLabel: "Show my details",
          content: (
            <MePanel
              dashboard={dashboard}
              daily={daily}
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
                myOrder: dashboard.myOrder,
                today: dashboard.checkin.today.day,
                people: dashboard.checkin.people,
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
          content: (
            // The sky of my page carried on behind the task's header.
            <RightCoverProvider value={rightSkyCover(daily, nowMs)}>
              <TaskSidePanel taskId={search.task} onClose={taskAddress.back} onLoaded={taskLoaded} />
            </RightCoverProvider>
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
  daily,
  inbox,
  onCheckIn,
  onCheckOut,
}: {
  dashboard: MyDashboardData
  daily: DailyCardData
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
  const now = useDailyNow(daily)
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <DailySkyBanner daily={daily} now={now} />
      {/* The line goes see-through over the sky rather than away, so the header keeps its height. */}
      {/* Wrapped in its own div, so the shell's table line under a header never matches it. */}
      <div className="relative shrink-0">
      <DashboardCardHeader className="relative gap-2 border-b-transparent">
        <SidePanelCollapseButton side="left" label="Hide my page" />
        <PersonAvatar name={me.name} avatarUrl={me.avatarUrl} size="default" />
        <div className="grid min-w-0 flex-1">
          <span className="truncate text-sm font-medium">{me.name}</span>
          <span className="truncate text-xs text-muted-foreground">
            {[me.title, me.teamName].filter(Boolean).join(" · ")}
          </span>
        </div>
        <EmployeeSettingsMenu dashboard={dashboard} daily={daily} />
      </DashboardCardHeader>
      </div>
      <ScrollArea className="relative min-h-0 flex-1" viewportClassName="h-full">
        <div className={cn("grid", PANEL_GUTTER)}>
          <DailyCard
            daily={daily}
            now={now}
            checkin={{ checkedIn: Boolean(checkin.checkin), checkedOut: Boolean(checkin.checkout?.at) }}
            onCheckIn={onCheckIn}
            onCheckOut={onCheckOut}
          />
          <PanelCard
            storageId="project-my-checkin"
            icon={<ClipboardCheckIcon className="size-4" />}
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
          <PanelCard storageId="project-my-time-off" icon={<PlaneIcon className="size-4" />} title="Time off">
            <TimeOffSection idPrefix="my-time-off" compact initial={dashboard.timeOff} />
          </PanelCard>
          <InboxCard inbox={inbox} />
        </div>
      </ScrollArea>
    </div>
  )
}

/**
 * My settings behind the ⋮ beside my name (Tyler, 6 Nov 2026, the same as the
 * site admin's). General: my job title, my own
 * check-in time and zone, my weather city and my hours, which the Daily card's
 * pencil window held until that day. Notifications: which notices reach my
 * bell. Each saves on its own.
 */
function EmployeeSettingsMenu({ dashboard, daily }: { dashboard: MyDashboardData; daily: DailyCardData }) {
  const { me, checkin } = dashboard
  return (
    <MySettingsMenu
      tabs={[
        {
          value: "general",
          label: "General",
          // Grouped rows, as the site admin's General is (Tyler, 6 Nov 2026).
          content: (
            <div className="grid gap-5 px-4 py-3">
              <PickGroup title="You">
                <PickRow label="Job title" empty={!me.title} value={me.title || "None"}>
                  <p className="text-xs text-muted-foreground">Shown beside your name to the rest of the team.</p>
                  <MyJobTitle title={me.title} />
                </PickRow>
                <PickRow
                  label="Check-in time"
                  value={`${clockLabel(checkin.clock.time)}, ${checkin.clock.zone.split("/").pop()!.replaceAll("_", " ")}`}
                >
                  <MyCheckinTime clock={checkin.clock} />
                </PickRow>
              </PickGroup>
              <PickGroup title="Daily card">
                <CityRow city={daily.settings.city} />
                <DailyHoursRow hours={daily.settings.hours} />
              </PickGroup>
            </div>
          ),
        },
        {
          value: "notifications",
          label: "Notifications",
          content: (
            <div className="px-4 py-3">
              <MyNoticeSwitches off={dashboard.noticesOff} />
            </div>
          ),
        },
      ]}
    />
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
