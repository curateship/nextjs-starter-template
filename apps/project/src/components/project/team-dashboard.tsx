import * as React from "react"
import { useNavigate, useRouter } from "@tanstack/react-router"
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleAlertIcon,
  ListFilterIcon,
  MegaphoneIcon,
  PartyPopperIcon,
  PlusIcon,
} from "lucide-react"

import { HandOverDialog } from "@/components/project/hand-over-dialog"
import { InviteDialog } from "@/components/project/invite-dialog"
import { MeetingDialog } from "@/components/project/meeting-dialog"
import { MemberDialog } from "@/components/project/member-dialog"
import { MeetingWindow, type NoteLineToMake } from "@/components/project/meeting-window"
import { NewTaskDialog } from "@/components/project/new-task-dialog"
import { DayNumber, MonthGrid } from "@/components/project/month-grid"
import { TeamActivity } from "@/components/project/project-activity"
import { AnnouncementCard, AnnouncementDialog } from "@/components/project/team-announcement"
import { TeamBlocksProvider } from "@/components/project/notes/team-blocks"
import { PersonPages } from "@/components/project/person-pages"
import { TeamPageNotes } from "@/components/project/project-page-notes"
import { TaskSidePanel } from "@/components/project/task-side-panel"
import { TeamTasksTab } from "@/components/project/team-tasks-tab"
import { ClientFilterSelect } from "@/components/project/client-filter-select"
import { AwayChip } from "@/components/project/team-away"
import { DayDueTasks, DeadlineChips, DueChips } from "@/components/project/team-due-dates"
import { MeetingChips, MeetingsCard } from "@/components/project/team-meetings"
import { InviteResentDialog } from "@/components/project/team-members"
import { DashboardTabs } from "@/components/shared/dashboard-tabs"
import { TeamMenu } from "@/components/project/team-menu"
import { TeamStart } from "@/components/project/team-start"
import { TeamTrendsDialog } from "@/components/project/team-trends-dialog"
import { TeamWeek } from "@/components/project/team-week"
import { ThreePanels } from "@/components/project/three-panels"
import { PanelReopenButton, SidePanelCollapseButton } from "@/components/shared/three-panels"
import { DashboardCardHeader } from "@/components/shared/dashboard-card-header"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  showDueDatesOnCalendar,
  type AwayDay,
  type TeamDay,
  type TeamDeadline,
  type TeamDueTask,
  type TeamMonth,
} from "@/lib/api/project/checkins"
import {
  linkNoteLineToTask,
  type Meeting,
  type MeetingOccurrence,
  type TeamMeetings,
} from "@/lib/api/project/meetings"
import { loadNewTaskProjects, type NewTaskProject } from "@/lib/api/project/tasks"
import {
  resendTeamInvite,
  type SentInvite,
  type TeamDashboard as TeamDashboardData,
  type TeamFigures,
  type TeamMemberRow,
  type TeamTasks,
} from "@/lib/api/project/teams"
import { formatMonthAndYear } from "@/lib/format/format-time"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useSyncedDraft } from "@/lib/hooks/use-synced-draft"
import { addDays, dayLabel, longDayLabel } from "@/lib/project/days"
import { matchesClient } from "@/lib/project/clients"
import { useMyLive } from "@/lib/project/use-my-live"
import { useRememberedTask } from "@/lib/project/use-remembered-task"
import { useTaskAddress } from "@/lib/hooks/use-task-address"
import { PANEL_GUTTER } from "@/lib/project/panel-gutter"
import type { TaskFilters } from "@/lib/project/task-filters"
import { getProjectErrorMessage } from "@/lib/project/errors"
import {
  awayWords,
  deadlineWords,
  dueByDay,
  dueWords,
} from "@/lib/project/due-days"
import {
  dayCellClassName,
  meetingWords,
  meetingsByDay,
  monthGrid,
  nextMeetingColor,
  type DayMeeting,
} from "@/lib/project/meetings"
import { lastProject, rememberProject } from "@/lib/project/new-task-project"
import {
  TEAM_CALENDAR_VIEW_KEY,
  TEAM_MIDDLE_TAB_KEY,
  TEAM_PANEL_LAYOUT_KEY,
  teamOpenTaskKey,
} from "@/lib/project/panel-keys"
import { weekDays } from "@/lib/project/week-view"
import { useRememberedChoice } from "@/lib/remembered-choice"
import { showErrorToast } from "@/lib/toast/error-toast"
import { runsTheTeam } from "@/lib/project/rules"
import { cn } from "@/lib/utils"
import type { TeamSearch } from "@/lib/project/team-route"
import { useTeamId } from "@/lib/project/team-scope"
import { PageCover, RightCoverProvider } from "@/components/shared/notes/page-cover"

/** An employee's own Team dashboard, and one team's for the site admin under Teams. */
const TEAM_ROUTE_IDS = new Set(["/_authenticated/team/", "/_authenticated/teams/$teamId/"])

/**
 * The Team dashboard in the Admin 3 panel design (task "Team
 * dashboard/admin-3-panel-design", Tyler, 7 Nov 2026). Left: the team's name
 * and ⋮ over its cover, then the team's page, whose "/" blocks are Check-ins,
 * Workload, Attention, This week and Members. Middle: Tasks, Calendar and
 * Activity, with the announcement as a bar under the header. Right: the open
 * task, as on a project's page and My dashboard. Picking a day on the
 * calendar sets the day the Check-ins block shows, and lists its meetings
 * under the calendar.
 */
export function TeamDashboardScreen({
  data,
  checkins,
  meetings,
  figures,
  tasks,
  search,
}: {
  data: TeamDashboardData | null
  checkins: { month: TeamMonth; day: TeamDay } | null
  meetings: TeamMeetings | null
  figures: TeamFigures | null
  tasks: TeamTasks | null
  search: TeamSearch
}) {
  if (!data || !checkins || !meetings || !figures || !tasks) return <TeamStart />
  return (
    <Dashboard
      data={data}
      month={checkins.month}
      day={checkins.day}
      meetings={meetings}
      figures={figures}
      tasks={tasks}
      search={search}
    />
  )
}

function Dashboard({
  data,
  month,
  day,
  meetings,
  figures,
  tasks,
  search,
}: {
  data: TeamDashboardData
  month: TeamMonth
  day: TeamDay
  meetings: TeamMeetings
  figures: TeamFigures
  tasks: TeamTasks
  search: TeamSearch
}) {
  const navigate = useNavigate()
  const router = useRouter()
  const teamId = useTeamId()
  const taskAddress = useTaskAddress()
  // Check-ins, meetings, time off and tasks changed by others show without a
  // reload (Features 16 Oct, part 5). Only this page's own data loads again;
  // the open task loads its own.
  // The Workload and Attention blocks load apart from the page, so they count changes too.
  const [liveChanges, setLiveChanges] = React.useState(0)
  useMyLive(
    () => true,
    () => {
      setLiveChanges((n) => n + 1)
      void router.invalidate({ filter: (match) => TEAM_ROUTE_IDS.has(match.routeId) })
    }
  )
  const go = React.useCallback(
    (patch: Partial<TeamSearch>) =>
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
  // Filters change the address in place, as on My dashboard, so Back skips them.
  const setFilters = React.useCallback(
    (patch: Partial<TaskFilters>) =>
      void navigate({
        to: ".",
        replace: true,
        search: (previous: Record<string, unknown>) => {
          const next: Record<string, unknown> = { ...previous, ...patch }
          for (const key of Object.keys(next)) if (next[key] === undefined) delete next[key]
          return next
        },
      }),
    [navigate]
  )
  // The right panel is the open task, as on a project's page and My dashboard
  // (Tyler, 7 Nov 2026: "Right panel now shows task detail like project and my
  // dashboard"): the one last open here, or the Tasks tab's first row.
  const [rows, setRows] = React.useState<string[] | null>(null)
  const quietTask = useRememberedTask({ storageKey: teamOpenTaskKey(teamId), taskId: search.task, ids: rows })
  const selected = search.day ?? month.today
  const meetingDays = React.useMemo(() => meetingsByDay(meetings), [meetings])
  const client = search.client
  const dueDays = React.useMemo(
    () =>
      dueByDay(client ? month.dueDates.tasks.filter((task) => matchesClient(task.projectClient, client)) : month.dueDates.tasks),
    [month.dueDates.tasks, client]
  )
  const deadlineDays = React.useMemo(
    () =>
      dueByDay(
        client
          ? month.dueDates.deadlines.filter((deadline) => matchesClient(deadline.projectClient, client))
          : month.dueDates.deadlines
      ),
    [month.dueDates.deadlines, client]
  )
  const awayOf = React.useMemo(() => new Map(month.away.map((away) => [away.day, away])), [month.away])
  const holidayOf = React.useMemo(() => new Map(month.holidays.map((h) => [h.day, h.name])), [month.holidays])
  // The calendar's New meeting and the Meetings card's "+ Add" open the same windows.
  const meetingWindows = useMeetingWindows({ meetings, data, day: selected < month.today ? month.today : selected })
  const people = React.useMemo(
    () =>
      data.members
        .filter((member) => !member.invited)
        .map((member) => ({ id: member.userId, name: member.name, avatarUrl: member.avatarUrl })),
    [data.members]
  )
  const taskLoaded = (taskId: string) => {
    if (tasks.tasks.some((task) => task.id === taskId && task.unread > 0)) void router.invalidate()
  }

  return (
    <ThreePanels
      reopenInHeader
      layoutKey={TEAM_PANEL_LAYOUT_KEY}
      // A task opened on arrival leaves a narrow screen on the list.
      showRightFor={search.task === quietTask ? undefined : search.task}
      left={{
        label: "Team",
        showLabel: "Show the team",
        content: (
          <TeamPanel
            data={data}
            figures={figures}
            day={day}
            requested={search.day}
            reload={`${search.task ?? ""}:${liveChanges}`}
            client={client}
            onClient={(next) => go({ client: next })}
            onOpenTask={taskAddress.open}
          />
        ),
      }}
      middle={{
        label: "Tasks",
        content: (
          <TeamMiddle
            tasks={tasks}
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
            onRows={setRows}
            people={people}
            month={month}
            selected={selected}
            meetingDays={meetingDays}
            dueDays={dueDays}
            deadlineDays={deadlineDays}
            awayOf={awayOf}
            holidayOf={holidayOf}
            meetings={meetings}
            meetingWindows={meetingWindows}
            data={data}
            client={client}
            onClient={(next) => go({ client: next })}
            // A new month starts on its 1st, or on today in today's month, so
            // the calendar, its meetings and the check-ins name one day.
            onMonth={(next) =>
              go({ month: next, day: next === month.today.slice(0, 7) ? undefined : `${next}-01` })
            }
            onWeek={(next) => go({ day: next, month: next.slice(0, 7) })}
            onToday={() => go({ month: undefined, day: undefined })}
            onSelect={(next) => go({ day: next })}
            onOpenTask={taskAddress.open}
          />
        ),
      }}
      right={{
        label: "Task",
        showLabel: "Show the task",
        content: (
          <PersonPages>
            {/* The team page's cover carried on behind the task's header. */}
            <RightCoverProvider value={data.team.photoUrl}>
              <TaskSidePanel taskId={search.task} onClose={taskAddress.back} onLoaded={taskLoaded} />
            </RightCoverProvider>
          </PersonPages>
        ),
      }}
    >
      {meetingWindows.windows}
    </ThreePanels>
  )
}

/**
 * New meeting, changing one, a meeting's own window, and Make a task from its
 * notes, for the whole page: the calendar and the right panel's Meetings card
 * both open them.
 */
function useMeetingWindows({ meetings, data, day }: { meetings: TeamMeetings; data: TeamDashboardData; day: string }) {
  // The meeting the window shows, null for a new one. It stays set while the
  // window closes, so the window doesn't change under its closing animation.
  const [windowOpen, setWindowOpen] = React.useState(false)
  const [target, setTarget] = React.useState<Meeting | null>(null)
  const opened = useOpenedMeeting(meetings)

  function edit(next: Meeting | "new") {
    setTarget(next === "new" ? null : next)
    setWindowOpen(true)
  }

  return {
    newMeeting: () => edit("new"),
    edit: (meeting: Meeting) => edit(meeting),
    open: opened.open,
    windows: (
      <>
        <MeetingDialog
          open={windowOpen}
          meeting={target}
          day={day}
          color={nextMeetingColor(meetings.meetings)}
          members={data.members}
          myUserId={data.myUserId}
          teamZone={meetings.teamZone}
          onClose={() => setWindowOpen(false)}
        />
        {opened.shown ? (
          <MeetingWindow
            open={opened.isOpen}
            meeting={opened.shown.meeting}
            occurrence={opened.shown.occurrence}
            viewerZone={meetings.viewerZone}
            myUserId={data.myUserId}
            onClose={opened.close}
            onChange={(meeting) => {
              opened.close()
              edit(meeting)
            }}
            onMakeTask={opened.makeTask}
          />
        ) : null}
        {opened.making ? (
          <NewTaskDialog
            projects={opened.making.projects}
            initialProjectId={opened.making.initialProjectId}
            initialTitle={opened.making.line.text}
            open={opened.making.open}
            onClose={opened.taskClosed}
            onCreated={opened.taskMade}
          />
        ) : null}
      </>
    ),
  }
}

/**
 * The left panel (task "Team dashboard/admin-3-panel-design", Tyler, 7 Nov
 * 2026): the team's name and, for the site admin, the ⋮ Team settings menu in
 * the header, with the cover fading behind it; then the team's page, whose "/"
 * blocks are Check-ins, Workload, Attention, This week and Members. No avatar
 * and no "Created" line ("Dont show create data for the left panel. Remove
 * team avatar"). The windows the blocks open belong to the panel, so a block
 * removed while one is open doesn't take the window with it.
 */
function TeamPanel({
  data,
  figures,
  day,
  requested,
  reload,
  client,
  onClient,
  onOpenTask,
}: {
  data: TeamDashboardData
  figures: TeamFigures
  day: TeamDay
  requested: string | undefined
  reload: string
  client: string | undefined
  onClient: (client: string | undefined) => void
  onOpenTask: (taskId: string) => void
}) {
  const teamId = useTeamId()
  const { team } = data
  const canRun = runsTheTeam(data.myRole)
  const [inviting, setInviting] = React.useState(false)
  const [trendsOpen, setTrendsOpen] = React.useState(false)
  // A teammate's page, and handing over all of someone's tasks from it.
  const [viewing, setViewing] = React.useState<TeamMemberRow | null>(null)
  const [handingOver, setHandingOver] = React.useState<TeamMemberRow | null>(null)
  const [resent, setResent] = React.useState<{ sent: SentInvite; email: string } | null>(null)
  const [run, busy] = useAsyncAction(getProjectErrorMessage)

  /** The same resend as the Members page: a fresh link, the old one stops working. */
  async function resend(member: TeamMemberRow) {
    let sent: SentInvite | null = null
    const ok = await run(async () => {
      sent = await resendTeamInvite(member.userId, teamId)
    })
    if (ok && sent) setResent({ sent, email: member.email })
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <PageCover url={team.photoUrl} />
      {/* The line goes see-through over the cover rather than away, so the header keeps its height. */}
      {/* Wrapped in its own div, so the shell's table line under a header never matches it. */}
      <div className="relative shrink-0">
      <DashboardCardHeader className={cn("relative gap-1", team.photoUrl && "border-b-transparent")}>
        <SidePanelCollapseButton side="left" label="Hide the team page" />
        <h2 className="min-w-0 flex-1 truncate pl-1 text-sm font-medium">{team.name}</h2>
        {/* Team settings are the tabbed ⋮ the skill draws, the site admin's alone (Tyler, 7 Nov 2026:
            "the teams settings is not following the skill"). */}
        {canRun ? <TeamMenu data={data} /> : null}
      </DashboardCardHeader>
      </div>
      <ScrollArea className="relative min-h-0 flex-1" viewportClassName="h-full">
        <div className={cn("grid grid-cols-[minmax(0,1fr)]", PANEL_GUTTER)}>
          <TeamBlocksProvider
            value={{
              day,
              requested,
              myUserId: data.myUserId,
              members: data.members,
              figures,
              canRun,
              reload,
              onOpenTask,
              clients: data.clients,
              client,
              onClient,
              busy,
              onOpenMember: setViewing,
              onResend: (member) => void resend(member),
              onInvite: () => setInviting(true),
              onTrends: () => setTrendsOpen(true),
            }}
          >
            <TeamPageNotes page={data.page} locked={data.pageLocked} canWrite={canRun} teamId={teamId} />
          </TeamBlocksProvider>
        </div>
      </ScrollArea>
      <MemberDialog
        member={viewing}
        myRole={data.myRole}
        myUserId={data.myUserId}
        onClose={() => setViewing(null)}
        onHandOver={setHandingOver}
      />
      <HandOverDialog from={handingOver} members={data.members} onClose={() => setHandingOver(null)} />
      <InviteDialog open={inviting} onClose={() => setInviting(false)} />
      <InviteResentDialog resent={resent} onClose={() => setResent(null)} />
      <TeamTrendsDialog open={trendsOpen} onClose={() => setTrendsOpen(false)} />
    </div>
  )
}

const MIDDLE_TABS = ["tasks", "calendar", "activity"] as const
type MiddleTab = (typeof MIDDLE_TABS)[number]
const CALENDAR_VIEWS = ["month", "week"] as const
type CalendarView = (typeof CALENDAR_VIEWS)[number]

/**
 * The middle panel's three tabs (Tyler, 7 Nov 2026: "Middle panel should now
 * show all the tasks from the team. So tasks, calender, activity"): every
 * task in the team's projects, the calendar of check-ins and meetings, and
 * the team's Activity across every project the viewer can see. Each tab
 * brings its own header buttons after the tabs. The announcement is a bar
 * under the header on every tab.
 */
function TeamMiddle({
  tasks,
  openTaskId,
  filters,
  onFilters,
  onRows,
  people,
  data,
  onOpenTask,
  ...calendar
}: {
  tasks: TeamTasks
  /** The task open on the right, whose row shows open. */
  openTaskId: string | undefined
  filters: TaskFilters
  onFilters: (patch: Partial<TaskFilters>) => void
  onRows: (ids: string[]) => void
  people: { id: string; name: string; avatarUrl?: string }[]
  data: TeamDashboardData
  onOpenTask: (taskId: string) => void
} & Omit<CalendarProps, "data" | "tabs" | "tab" | "below" | "onOpenTask" | "onAnnounce">) {
  const teamId = useTeamId()
  const [tab, setTab] = useRememberedChoice<MiddleTab>(TEAM_MIDDLE_TAB_KEY, "tasks", MIDDLE_TABS)
  const [announcing, setAnnouncing] = React.useState(false)
  const canRun = runsTheTeam(data.myRole)
  const tabs = (
    <DashboardTabs
      value={tab}
      onValueChange={(value) => setTab(value as MiddleTab)}
      className="flex-none"
      tabs={[
        { value: "tasks", label: "Tasks" },
        { value: "calendar", label: "Calendar" },
        { value: "activity", label: "Activity" },
      ]}
    />
  )
  const below = data.announcement ? (
    <AnnouncementCard announcement={data.announcement} canRun={canRun} onReplace={() => setAnnouncing(true)} />
  ) : null
  return (
    <>
      {tab === "tasks" ? (
        <TeamTasksTab
          source={tasks}
          tabs={tabs}
          below={below}
          today={calendar.month.today}
          teamId={teamId}
          myUserId={data.myUserId}
          canRun={canRun}
          people={people}
          filters={filters}
          onFilters={onFilters}
          onOpenTask={onOpenTask}
          openTaskId={openTaskId}
          onRows={onRows}
        />
      ) : (
        <CalendarPanel
          {...calendar}
          tab={tab}
          tabs={tabs}
          below={below}
          data={data}
          onOpenTask={onOpenTask}
          onAnnounce={() => setAnnouncing(true)}
        />
      )}
      <AnnouncementDialog open={announcing} replacing={Boolean(data.announcement)} onClose={() => setAnnouncing(false)} />
    </>
  )
}

type CalendarProps = {
  tab: "calendar" | "activity"
  tabs: React.ReactNode
  below: React.ReactNode
  month: TeamMonth
  selected: string
  meetingDays: Map<string, DayMeeting[]>
  dueDays: Map<string, TeamDueTask[]>
  /** Each day's milestones and projects due; empty while "Due dates" is off. */
  deadlineDays: Map<string, TeamDeadline[]>
  awayOf: Map<string, AwayDay>
  holidayOf: Map<string, string>
  meetings: TeamMeetings
  meetingWindows: ReturnType<typeof useMeetingWindows>
  data: TeamDashboardData
  client: string | undefined
  onClient: (client: string | undefined) => void
  onMonth: (month: string) => void
  /** A week's arrow: the same weekday in the week before or after. */
  onWeek: (day: string) => void
  onToday: () => void
  onSelect: (day: string) => void
  onOpenTask: (taskId: string) => void
  onAnnounce: () => void
}

/**
 * The Calendar and Activity tabs. The header holds the tabs, then on the
 * Calendar its view dropdown (Month or Week, and the Due dates switch), the
 * megaphone and New meeting. The month with its arrows and Today sits at the
 * top of the calendar itself (Tyler, 7 Nov 2026: "Move this … inside calender
 * tab"), and under the calendar the picked day's meetings and what is due,
 * which were on the right panel until the right panel became the open task.
 */
function CalendarPanel({
  tab,
  tabs,
  below,
  month,
  selected,
  meetingDays,
  dueDays,
  deadlineDays,
  awayOf,
  holidayOf,
  meetings,
  meetingWindows,
  data,
  client,
  onClient,
  onMonth,
  onWeek,
  onToday,
  onSelect,
  onOpenTask,
  onAnnounce,
}: CalendarProps) {
  const teamId = useTeamId()
  const [view, setView] = useRememberedChoice<CalendarView>(TEAM_CALENDAR_VIEW_KEY, "month", CALENDAR_VIEWS)
  const [year, monthNumber] = month.month.split("-").map(Number)
  const grid = monthGrid(month.month)
  const byDay = new Map(month.days.map((d) => [d.day, d]))
  const canRun = runsTheTeam(data.myRole)
  const week = weekDays(selected)
  const router = useRouter()
  const [run, savingSwitch] = useAsyncAction(getProjectErrorMessage)
  // The switch moves at once, and goes back if the save is refused.
  const [showDue, setShowDue] = useSyncedDraft(month.dueDates.on)

  async function switchDueDates(on: boolean) {
    setShowDue(on)
    const ok = await run(() => showDueDatesOnCalendar(on, teamId))
    if (ok) await router.invalidate()
    else setShowDue(!on)
  }

  const calendar = tab === "calendar"

  return (
    <>
      <DashboardCardHeader className="@container">
        <PanelReopenButton side="left" label="Show the team page" />
        {tabs}
        <span className="flex-1" />
        {calendar ? (
          <div className="flex shrink-0 items-center gap-1">
            <CalendarViewMenu
              view={view}
              onView={setView}
              showDue={showDue}
              savingDue={savingSwitch}
              onShowDue={(on) => void switchDueDates(on)}
              clients={data.clients}
              client={client}
              onClient={onClient}
            />
            {canRun && !data.announcement ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button type="button" variant="ghost" size="icon" aria-label="Post an announcement" onClick={onAnnounce}>
                    <MegaphoneIcon className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Post an announcement</TooltipContent>
              </Tooltip>
            ) : null}
            {/* Words where there is room; an icon with its name in a narrow panel. */}
            <Button
              type="button"
              className="@max-3xl:size-8 @max-3xl:px-0"
              aria-label="New meeting"
              onClick={meetingWindows.newMeeting}
            >
              <PlusIcon className="size-4" />
              <span className="@max-3xl:hidden">New meeting</span>
            </Button>
          </div>
        ) : null}
        <PanelReopenButton side="right" label="Show the task" />
      </DashboardCardHeader>
      {below}
      {!calendar ? (
        <TeamActivity onOpenTask={onOpenTask} />
      ) : (
        <ScrollArea className="min-h-0 flex-1" viewportClassName="h-full">
          <div className="flex min-w-0 items-center gap-1 px-3 py-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={view === "week" ? "Previous week" : "Previous month"}
              onClick={() =>
                view === "week" ? onWeek(addDays(selected, -7)) : onMonth(addDays(grid.first, -1).slice(0, 7))
              }
            >
              <ChevronLeftIcon className="size-4" />
            </Button>
            <h2 className="min-w-0 truncate text-sm font-semibold">
              {view === "week"
                ? `${dayLabel(week[0])} to ${dayLabel(week[6])}`
                : formatMonthAndYear(year, monthNumber)}
            </h2>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={view === "week" ? "Next week" : "Next month"}
              onClick={() =>
                view === "week" ? onWeek(addDays(selected, 7)) : onMonth(addDays(grid.first, 32).slice(0, 7))
              }
            >
              <ChevronRightIcon className="size-4" />
            </Button>
            <Button type="button" variant="secondary" onClick={onToday}>
              Today
            </Button>
          </div>
          {view === "week" ? (
            <TeamWeek
              selected={selected}
              month={month}
              meetingDays={meetingDays}
              holidays={holidayOf}
              dueDays={dueDays}
              deadlineDays={deadlineDays}
              awayOf={awayOf}
              viewerZone={meetings.viewerZone}
              onSelect={onSelect}
            />
          ) : (
            <MonthGrid month={month.month}>
              {({ date, inMonth }) => {
                const counts = inMonth ? byDay.get(date) : undefined
                const dayMeetings = inMonth ? (meetingDays.get(date) ?? []) : []
                const checkinWords = counts?.expected
                  ? `${counts.checkedIn} of ${counts.expected} checked in${counts.blocked ? `, ${counts.blocked} blocked` : ""}`
                  : null
                const holiday = inMonth ? holidayOf.get(date) : undefined
                const dayDue = inMonth ? (dueDays.get(date) ?? []) : []
                const dayDeadlines = inMonth ? (deadlineDays.get(date) ?? []) : []
                const away = inMonth ? awayOf.get(date) : undefined
                const words = [
                  holiday ? `${holiday}, a team holiday` : null,
                  checkinWords,
                  awayWords(away),
                  meetingWords(dayMeetings, meetings.viewerZone),
                  deadlineWords(dayDeadlines),
                  dueWords(dayDue),
                ].filter(Boolean)
                return (
                  <button
                    key={date}
                    type="button"
                    disabled={!inMonth}
                    aria-pressed={date === selected}
                    aria-current={date === month.today ? "date" : undefined}
                    aria-label={`${longDayLabel(date)}${words.length ? `: ${words.join(". ")}` : ""}`}
                    onClick={() => onSelect(date)}
                    className={cn(
                      dayCellClassName(inMonth),
                      "hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:pointer-events-none",
                      date === selected && "ring-2 ring-foreground"
                    )}
                  >
                    {/* As Tyler drew it on 16 Oct 2026: the day and its check-ins in one
                        line, then blocked, meetings and who is away, each its own chip. */}
                    <span className="flex w-full items-center justify-between gap-1">
                      <DayNumber date={date} today={month.today} />
                      {counts && counts.expected ? <CheckinPill counts={counts} /> : null}
                    </span>
                    {holiday ? (
                      <span className="flex w-full items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-muted-foreground">
                        <PartyPopperIcon className="size-3 shrink-0" aria-hidden />
                        <span className="truncate max-sm:hidden">{holiday}</span>
                      </span>
                    ) : null}
                    {counts?.blocked ? (
                      <span className="flex w-full items-center gap-1 rounded-md bg-destructive/10 px-1.5 py-0.5 text-destructive">
                        <CircleAlertIcon className="size-3 shrink-0 sm:hidden" aria-hidden />
                        <span className="truncate">
                          {counts.blocked}
                          <span className="max-sm:hidden"> blocked</span>
                        </span>
                      </span>
                    ) : null}
                    <MeetingChips meetings={dayMeetings} />
                    <AwayChip away={away} />
                    <DeadlineChips deadlines={dayDeadlines} />
                    <DueChips tasks={dayDue} />
                  </button>
                )
              }}
            </MonthGrid>
          )}
          {/* The picked day under the calendar: its meetings and, with Due dates on, what is due. */}
          <div className="grid gap-3 p-3">
            <MeetingsCard
              holiday={holidayOf.get(selected)}
              meetings={meetingDays.get(selected) ?? []}
              viewerZone={meetings.viewerZone}
              onOpen={meetingWindows.open}
              onEdit={meetingWindows.edit}
              onAdd={meetingWindows.newMeeting}
            />
            {month.dueDates.on ? (
              <DayDueTasks
                tasks={dueDays.get(selected) ?? []}
                deadlines={deadlineDays.get(selected) ?? []}
                onOpenTask={onOpenTask}
              />
            ) : null}
          </div>
        </ScrollArea>
      )}
    </>
  )
}

/**
 * "Month" with a filter mark, as Tyler drew it: Month or Week, and the Due
 * dates switch that puts the team's due dates on the calendar (each person's
 * own choice).
 */
/**
 * "4/4" beside the day: grey when everyone checked in, amber when some did,
 * red when nobody did (Tyler's drawing, 16 Oct 2026). The square's own label
 * says it in words for a screen reader.
 */
function CheckinPill({ counts }: { counts: { checkedIn: number; expected: number } }) {
  const tone =
    counts.checkedIn >= counts.expected
      ? "bg-muted text-muted-foreground"
      : counts.checkedIn === 0
        ? "bg-destructive/10 text-destructive"
        : "bg-amber-500/15 text-amber-700 dark:text-amber-400"
  return (
    <span aria-hidden className={cn("shrink-0 rounded-full px-1.5 py-0.5 font-medium tabular-nums", tone)}>
      {counts.checkedIn}/{counts.expected}
    </span>
  )
}

function CalendarViewMenu({
  view,
  onView,
  showDue,
  savingDue,
  onShowDue,
  clients,
  client,
  onClient,
}: {
  view: CalendarView
  onView: (view: CalendarView) => void
  showDue: boolean
  savingDue: boolean
  onShowDue: (on: boolean) => void
  clients: string[]
  client: string | undefined
  onClient: (client: string | undefined) => void
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="secondary" aria-label={`Calendar view: ${view === "week" ? "Week" : "Month"}`}>
          <ListFilterIcon className="size-4" />
          <span className="@max-xl:hidden">{view === "week" ? "Week" : "Month"}</span>
          <ChevronDownIcon className="size-4 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="grid w-56 gap-3 p-3">
        <Tabs value={view} onValueChange={(value) => onView(value as CalendarView)}>
          <TabsList aria-label="Calendar view" className="w-full">
            <TabsTrigger value="month" className="flex-1">
              Month
            </TabsTrigger>
            <TabsTrigger value="week" className="flex-1">
              Week
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="team-calendar-due-dates" className="font-normal">
            Due dates
          </Label>
          <Switch
            id="team-calendar-due-dates"
            checked={showDue}
            disabled={savingDue}
            onCheckedChange={onShowDue}
          />
        </div>
        {showDue && (clients.length || client) ? (
          <div className="grid gap-2">
            <Label htmlFor="team-calendar-client" className="font-normal">
              Client
            </Label>
            <ClientFilterSelect id="team-calendar-client" value={client} clients={clients} onChange={onClient} />
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

type Making = {
  line: NoteLineToMake
  projects: NewTaskProject[]
  initialProjectId: string
  open: boolean
}

/**
 * The meeting window open over the calendar, and Make a task from its notes.
 * Windows never stack, so Make a task closes the meeting, opens New task with
 * the line as its title, links the line to the task once it is made, and
 * opens the meeting again either way.
 */
function useOpenedMeeting(meetings: TeamMeetings) {
  const teamId = useTeamId()
  // Ids, so the window always shows the meeting as last loaded. It stays set
  // while the window closes, so it doesn't change under its closing animation.
  const [target, setTarget] = React.useState<{ meetingId: string; startsAt: string } | null>(null)
  const [isOpen, setIsOpen] = React.useState(false)
  const [making, setMaking] = React.useState<Making | null>(null)
  const linking = React.useRef<Promise<unknown> | null>(null)
  const [run] = useAsyncAction(getProjectErrorMessage)

  const meeting = meetings.meetings.find((m) => m.id === target?.meetingId)
  const occurrence = meetings.occurrences.find(
    (o) => o.meetingId === target?.meetingId && o.startsAt === target?.startsAt
  )
  const shown = meeting && occurrence ? { meeting, occurrence } : null

  async function makeTask(line: NoteLineToMake) {
    let loaded: Awaited<ReturnType<typeof loadNewTaskProjects>>
    try {
      loaded = await loadNewTaskProjects(teamId)
    } catch (error) {
      showErrorToast(getProjectErrorMessage(error))
      return
    }
    const { projects } = loaded
    if (projects.length === 0) {
      showErrorToast("There's no open project to put a task in yet. Make a project first.")
      return
    }
    const remembered = lastProject()
    setIsOpen(false)
    setMaking({
      line,
      projects,
      initialProjectId: projects.find((p) => p.id === remembered)?.id ?? projects[0].id,
      open: true,
    })
  }

  return {
    shown,
    isOpen: isOpen && Boolean(shown),
    making,
    open: (next: Meeting, at: MeetingOccurrence) => {
      setTarget({ meetingId: next.id, startsAt: at.startsAt })
      setIsOpen(true)
    },
    close: () => setIsOpen(false),
    makeTask: (line: NoteLineToMake) => void makeTask(line),
    taskMade: (projectId: string, taskId: string | null) => {
      rememberProject(projectId)
      if (taskId && making) {
        linking.current = run(() => linkNoteLineToTask({ ...making.line, taskId }, teamId))
      }
    },
    taskClosed: () => {
      setMaking((current) => (current ? { ...current, open: false } : null))
      // Back to the meeting once the line is linked, so its notes show the link.
      const pending = linking.current ?? Promise.resolve()
      linking.current = null
      void pending.then(() => setIsOpen(true))
    },
  }
}
