import * as React from "react"
import { Link, useNavigate, useRouter } from "@tanstack/react-router"
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleAlertIcon,
  HeartIcon,
  ListFilterIcon,
  MegaphoneIcon,
  PartyPopperIcon,
  PlusIcon,
  RefreshCwIcon,
} from "lucide-react"

import { BlockerReplies } from "@/components/project/blocker-replies"
import { HandOverDialog } from "@/components/project/hand-over-dialog"
import { InviteDialog } from "@/components/project/invite-dialog"
import { MeetingDialog } from "@/components/project/meeting-dialog"
import { MemberDialog } from "@/components/project/member-dialog"
import { MeetingWindow, type NoteLineToMake } from "@/components/project/meeting-window"
import { NewTaskDialog } from "@/components/project/new-task-dialog"
import { DayNumber, MonthGrid } from "@/components/project/month-grid"
import { TeamActivity } from "@/components/project/project-activity"
import { AnnouncementCard, AnnouncementDialog } from "@/components/project/team-announcement"
import { TaggedWords } from "@/components/project/tag-textarea"
import { PersonAvatar } from "@/components/project/task-bits"
import { TaskDialog } from "@/components/project/task-dialog"
import { TeamCover, TeamFiguresGrid } from "@/components/project/team-figures"
import { ClientFilterSelect } from "@/components/project/client-filter-select"
import { AwayChip } from "@/components/project/team-away"
import { DayDueTasks, DeadlineChips, DueChips } from "@/components/project/team-due-dates"
import { MeetingChips, MeetingsCard } from "@/components/project/team-meetings"
import { InviteResentDialog } from "@/components/project/team-members"
import { PanelCard } from "@/components/project/panel-card"
import { UnderlineTabs } from "@/components/project/task-header-controls"
import { TeamSideCard } from "@/components/project/team-side-card"
import { AttentionPanel, WorkloadPanel, useAttention } from "@/components/project/team-work-panels"
import { TeamSettingsDialog } from "@/components/project/team-settings-dialog"
import { TeamStart } from "@/components/project/team-start"
import { TeamTrendsDialog } from "@/components/project/team-trends-dialog"
import { TeamWeek } from "@/components/project/team-week"
import { ThreePanels } from "@/components/project/three-panels"
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
  type BlockerReply,
  type TeamDay,
  type TeamDayPerson,
  type TeamDayTask,
  type TeamDeadline,
  type TeamDueTask,
  type TeamMonth,
} from "@/lib/api/project/checkins"
import { linkNoteLineToTask, type Meeting, type MeetingOccurrence, type TeamMeetings } from "@/lib/api/project/meetings"
import { loadNewTaskProjects, type NewTaskProject } from "@/lib/api/project/tasks"
import {
  resendTeamInvite,
  type SentInvite,
  type TeamDashboard as TeamDashboardData,
  type TeamFigures,
  type TeamMemberRow,
} from "@/lib/api/project/teams"
import { formatDate, formatMonthAndYear } from "@/lib/format/format-time"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useSyncedDraft } from "@/lib/hooks/use-synced-draft"
import { addDays, clockIn, dayLabel, longDayLabel, shortDayLabel, zoneCity } from "@/lib/project/days"
import { matchesClient } from "@/lib/project/clients"
import { useMyLive } from "@/lib/project/use-my-live"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { awayWords, deadlineWords, dueByDay, dueWords } from "@/lib/project/due-days"
import {
  dayCellClassName,
  meetingWords,
  meetingsByDay,
  monthGrid,
  nextMeetingColor,
  type DayMeeting,
} from "@/lib/project/meetings"
import { lastProject, rememberProject } from "@/lib/project/new-task-project"
import type { TaskType } from "@/lib/project/task-types"
import {
  TEAM_CALENDAR_VIEW_KEY,
  TEAM_MIDDLE_TAB_KEY,
  TEAM_PANEL_LAYOUT_KEY,
  TEAM_RIGHT_TAB_KEY,
} from "@/lib/project/panel-keys"
import { weekDays } from "@/lib/project/week-view"
import { useRememberedChoice } from "@/lib/remembered-choice"
import { showErrorToast } from "@/lib/toast/error-toast"
import { runsTheTeam } from "@/lib/project/rules"
import { cn } from "@/lib/utils"

const TEAM_ROUTE_ID = "/_authenticated/team/"

export type TeamSearch = {
  /** "YYYY-MM" shown in the calendar. Left out, the current month. */
  month?: string
  /**
   * "YYYY-MM-DD" chosen on the calendar: its meetings show under it, and its
   * check-ins on the right (today's, for a day still to come). Left out, today.
   */
  day?: string
  /** The task whose window is open. */
  task?: string
  /**
   * A client's name, or "No client": the calendar's due dates and Workload
   * show only that client's projects (Features 16 Oct, part 9).
   */
  client?: string
}

/**
 * The Team dashboard, as Tyler redrew it on 14 Oct 2026
 * (`workspace/docs/assets/pasted-image-1792017230135278000.png`): the team,
 * its week and its members on the left; the calendar of check-ins and
 * meetings in the middle with the announcement as a bar under its header; and
 * on the right the chosen day, with Check-ins, Workload and Attention as tabs
 * over that day's Meetings. Clicking a day in the calendar shows that day on
 * the right.
 */
export function TeamDashboardScreen({
  data,
  checkins,
  meetings,
  figures,
  search,
}: {
  data: TeamDashboardData | null
  checkins: { month: TeamMonth; day: TeamDay } | null
  meetings: TeamMeetings | null
  figures: TeamFigures | null
  search: TeamSearch
}) {
  if (!data || !checkins || !meetings || !figures) return <TeamStart />
  return (
    <Dashboard
      data={data}
      month={checkins.month}
      day={checkins.day}
      meetings={meetings}
      figures={figures}
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
  search,
}: {
  data: TeamDashboardData
  month: TeamMonth
  day: TeamDay
  meetings: TeamMeetings
  figures: TeamFigures
  search: TeamSearch
}) {
  const navigate = useNavigate()
  const router = useRouter()
  // Check-ins, meetings, time off and tasks changed by others show without a
  // reload (Features 16 Oct, part 5). Only this page's own data loads again;
  // an open task window loads its own.
  // Attention and Workload load apart from the page, so they count changes too.
  const [liveChanges, setLiveChanges] = React.useState(0)
  useMyLive(
    () => true,
    () => {
      setLiveChanges((n) => n + 1)
      void router.invalidate({ filter: (match) => match.routeId === TEAM_ROUTE_ID })
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
  // On a phone, picking a day on the calendar shows that day's panel.
  const [dayPicks, setDayPicks] = React.useState(0)
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
  // The calendar's New meeting and the right panel's "+ Add" open the same windows.
  const meetingWindows = useMeetingWindows({ meetings, data, day: selected < month.today ? month.today : selected })

  return (
    <ThreePanels
      layoutKey={TEAM_PANEL_LAYOUT_KEY}
      showRightFor={dayPicks ? String(dayPicks) : undefined}
      left={{
        label: "Team",
        showLabel: "Show the team",
        content: <TeamPanel data={data} figures={figures} />,
      }}
      middle={{
        label: "Calendar",
        content: (
          <CalendarPanel
            month={month}
            selected={selected}
            meetingDays={meetingDays}
            dueDays={dueDays}
            deadlineDays={deadlineDays}
            awayOf={awayOf}
            holidayOf={holidayOf}
            viewerZone={meetings.viewerZone}
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
            onSelect={(next) => {
              go({ day: next })
              setDayPicks((n) => n + 1)
            }}
            onOpenTask={(taskId) => go({ task: taskId })}
            onNewMeeting={meetingWindows.newMeeting}
          />
        ),
      }}
      right={{
        // "Day", so the phone's tab doesn't sit over the panel's own Check-ins tab.
        label: "Day",
        showLabel: "Show the day",
        content: (
          <RightPanel
            canRun={runsTheTeam(data.myRole)}
            checkins={
              <CheckinsCard
                day={day}
                requested={search.day}
                myUserId={data.myUserId}
                members={data.members}
              />
            }
            meetings={
              <MeetingsCard
                holiday={holidayOf.get(day.day)}
                meetings={meetingDays.get(day.day) ?? []}
                viewerZone={meetings.viewerZone}
                onOpen={meetingWindows.open}
                onEdit={meetingWindows.edit}
                onAdd={meetingWindows.newMeeting}
              />
            }
            due={
              month.dueDates.on ? (
                <DayDueTasks
                  tasks={dueDays.get(day.day) ?? []}
                  deadlines={deadlineDays.get(day.day) ?? []}
                  onOpenTask={(taskId) => go({ task: taskId })}
                />
              ) : null
            }
            openTask={search.task}
            liveChanges={liveChanges}
            onOpenTask={(taskId) => go({ task: taskId })}
            clients={data.clients}
            client={client}
            onClient={(next) => go({ client: next })}
          />
        ),
      }}
    >
      <TaskDialog taskId={search.task ?? null} onClose={() => go({ task: undefined })} />
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
            types={opened.making.types}
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

function TeamPanel({ data, figures }: { data: TeamDashboardData; figures: TeamFigures }) {
  const { team } = data
  const canRun = runsTheTeam(data.myRole)
  const [settingsOpen, setSettingsOpen] = React.useState(false)
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
      sent = await resendTeamInvite(member.userId)
    })
    if (ok && sent) setResent({ sent, email: member.email })
  }

  return (
    <>
      <ScrollArea className="min-h-0 flex-1" viewportClassName="h-full">
        {/* The check-in schedule is in Team settings (the cog), so it isn't repeated here (Tyler, 14 Oct 2026). */}
        <TeamCover
          team={team}
          created={`Created ${formatDate(team.createdAt)} · ${zoneCity(team.timeZone)}`}
          canEdit={canRun}
          // Team settings are the site admin's alone, so nobody else sees the cog.
          onSettings={canRun ? () => setSettingsOpen(true) : null}
        />
        <div className="grid gap-3 px-3 pb-3">
          <PanelCard
            storageId="project-team-this-week"
            title="This week"
            action={
              <Button type="button" variant="ghost" size="sm" onClick={() => setTrendsOpen(true)}>
                Trends
              </Button>
            }
          >
            <TeamFiguresGrid figures={figures} />
          </PanelCard>
          <PanelCard
            storageId="project-team-members"
            title="Members"
            meta={data.members.length}
            action={
              <Button asChild variant="ghost" size="sm">
                <Link to="/team/members">Manage</Link>
              </Button>
            }
          >
            <MemberGroups
              members={data.members}
              myUserId={data.myUserId}
              canRun={canRun}
              busy={busy}
              onOpen={setViewing}
              onResend={(member) => void resend(member)}
            />
            {canRun ? (
              <Button type="button" className="w-full" onClick={() => setInviting(true)}>
                <PlusIcon className="size-4" />
                Invite people
              </Button>
            ) : null}
          </PanelCard>
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
      <TeamSettingsDialog
        team={team}
        labels={data.labels}
        stepLists={data.stepLists}
        templates={data.templates}
        joinLink={data.joinLink}
        holidays={data.holidays}
        canEdit={canRun}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
      <InviteDialog open={inviting} onClose={() => setInviting(false)} />
      <InviteResentDialog resent={resent} onClose={() => setResent(null)} />
      <TeamTrendsDialog open={trendsOpen} onClose={() => setTrendsOpen(false)} />
    </>
  )
}

/**
 * The Members card's two groups, as Tyler drew them on 16 Oct 2026: Active,
 * then Invited (not signed in yet) under a line, each invited person with a
 * dashed photo and Resend for the site admin. A name opens the person's page.
 */
function MemberGroups({
  members,
  myUserId,
  canRun,
  busy,
  onOpen,
  onResend,
}: {
  members: TeamMemberRow[]
  myUserId: string
  canRun: boolean
  busy: boolean
  onOpen: (member: TeamMemberRow) => void
  onResend: (member: TeamMemberRow) => void
}) {
  const active = members.filter((member) => !member.invited)
  const invited = members.filter((member) => member.invited)
  const row = (member: TeamMemberRow) => (
    <li key={member.userId} className="flex min-w-0 items-center gap-2">
      <button
        type="button"
        onClick={() => onOpen(member)}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-md py-1 text-left text-sm hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <PersonAvatar
          name={member.name}
          avatarUrl={member.avatarUrl}
          size="default"
          className={member.invited ? "after:border-dashed [&_[data-slot=avatar-fallback]]:bg-transparent" : undefined}
        />
        <span className="grid min-w-0 flex-1">
          <span className={cn("truncate", member.invited ? "text-muted-foreground" : "font-medium")}>
            {member.name}
            {member.userId === myUserId ? " (you)" : ""}
          </span>
          {member.title ? <span className="truncate text-xs text-muted-foreground">{member.title}</span> : null}
        </span>
      </button>
      {canRun && member.invited ? (
        <Button type="button" variant="outline" size="sm" className="shrink-0 bg-background" disabled={busy} onClick={() => onResend(member)}>
          Resend
        </Button>
      ) : null}
    </li>
  )
  return (
    <div className="grid min-w-0 gap-4">
      {active.length ? (
        <MemberGroup label={`Active · ${active.length}`}>{active.map(row)}</MemberGroup>
      ) : null}
      {invited.length ? (
        // The line between the groups runs to the card's edges.
        <div className={cn("grid min-w-0", active.length && "-mx-4 border-t px-4 pt-4")}>
          <MemberGroup label={`Invited · ${invited.length}`}>{invited.map(row)}</MemberGroup>
        </div>
      ) : null}
    </div>
  )
}

function MemberGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section aria-label={label} className="grid min-w-0 gap-2">
      <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</h3>
      <ul className="grid min-w-0 gap-1">{children}</ul>
    </section>
  )
}

const MIDDLE_TABS = ["calendar", "activity"] as const
type MiddleTab = (typeof MIDDLE_TABS)[number]
const CALENDAR_VIEWS = ["month", "week"] as const
type CalendarView = (typeof CALENDAR_VIEWS)[number]

/**
 * The middle panel: the Calendar, or the team's Activity across every
 * project the viewer can see (Tyler's choice, 12 Oct 2026). Its header, as
 * Tyler drew it on 14 Oct 2026: Calendar and Activity, the month with its
 * arrows and Today, then a view dropdown (Month or Week, and the Due dates
 * switch) and New meeting. The announcement is a bar under it. The chosen
 * day's meetings are on the right panel now.
 */
function CalendarPanel({
  month,
  selected,
  meetingDays,
  dueDays,
  deadlineDays,
  awayOf,
  holidayOf,
  viewerZone,
  data,
  client,
  onClient,
  onMonth,
  onWeek,
  onToday,
  onSelect,
  onOpenTask,
  onNewMeeting,
}: {
  month: TeamMonth
  selected: string
  meetingDays: Map<string, DayMeeting[]>
  dueDays: Map<string, TeamDueTask[]>
  /** Each day's milestones and projects due; empty while "Due dates" is off. */
  deadlineDays: Map<string, TeamDeadline[]>
  awayOf: Map<string, AwayDay>
  holidayOf: Map<string, string>
  viewerZone: string
  data: TeamDashboardData
  client: string | undefined
  onClient: (client: string | undefined) => void
  onMonth: (month: string) => void
  /** A week's arrow: the same weekday in the week before or after. */
  onWeek: (day: string) => void
  onToday: () => void
  onSelect: (day: string) => void
  onOpenTask: (taskId: string) => void
  onNewMeeting: () => void
}) {
  const [tab, setTab] = useRememberedChoice<MiddleTab>(TEAM_MIDDLE_TAB_KEY, "calendar", MIDDLE_TABS)
  const [view, setView] = useRememberedChoice<CalendarView>(TEAM_CALENDAR_VIEW_KEY, "month", CALENDAR_VIEWS)
  const [year, monthNumber] = month.month.split("-").map(Number)
  const grid = monthGrid(month.month)
  const byDay = new Map(month.days.map((d) => [d.day, d]))
  const [announcing, setAnnouncing] = React.useState(false)
  const canRun = runsTheTeam(data.myRole)
  const week = weekDays(selected)
  const router = useRouter()
  const [run, savingSwitch] = useAsyncAction(getProjectErrorMessage)
  // The switch moves at once, and goes back if the save is refused.
  const [showDue, setShowDue] = useSyncedDraft(month.dueDates.on)

  async function switchDueDates(on: boolean) {
    setShowDue(on)
    const ok = await run(() => showDueDatesOnCalendar(on))
    if (ok) await router.invalidate()
    else setShowDue(!on)
  }

  const calendar = tab === "calendar"

  return (
    <>
      {/* On a phone the month and its arrows take a second row, so the name never squeezes to nothing. */}
      <DashboardCardHeader className="@container flex-wrap">
        <Tabs value={tab} onValueChange={(value) => setTab(value as MiddleTab)}>
          <TabsList>
            <TabsTrigger value="calendar">Calendar</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>
        </Tabs>
        {calendar ? (
          <div className="flex min-w-0 flex-1 items-center gap-1 pl-2 @max-lg:order-last @max-lg:basis-full @max-lg:pl-0">
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
        ) : (
          <span className="flex-1" />
        )}
        <div className="flex shrink-0 items-center gap-1">
          {calendar ? (
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
          ) : null}
          {canRun && !data.announcement ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Post an announcement"
                  onClick={() => setAnnouncing(true)}
                >
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
            onClick={onNewMeeting}
          >
            <PlusIcon className="size-4" />
            <span className="@max-3xl:hidden">New meeting</span>
          </Button>
        </div>
      </DashboardCardHeader>
      {data.announcement ? (
        <AnnouncementCard
          announcement={data.announcement}
          canRun={canRun}
          onReplace={() => setAnnouncing(true)}
        />
      ) : null}
      {!calendar ? (
        <TeamActivity onOpenTask={onOpenTask} />
      ) : (
        <ScrollArea className="min-h-0 flex-1" viewportClassName="h-full">
          {view === "week" ? (
            <TeamWeek
              selected={selected}
              month={month}
              meetingDays={meetingDays}
              holidays={holidayOf}
              dueDays={dueDays}
              deadlineDays={deadlineDays}
              awayOf={awayOf}
              viewerZone={viewerZone}
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
                  meetingWords(dayMeetings, viewerZone),
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
        </ScrollArea>
      )}
      <AnnouncementDialog
        open={announcing}
        replacing={Boolean(data.announcement)}
        onClose={() => setAnnouncing(false)}
      />
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
  types: TaskType[]
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
      loaded = await loadNewTaskProjects()
    } catch (error) {
      showErrorToast(getProjectErrorMessage(error))
      return
    }
    const { projects, types } = loaded
    if (projects.length === 0) {
      showErrorToast("There's no open project to put a task in yet. Make a project first.")
      return
    }
    const remembered = lastProject()
    setIsOpen(false)
    setMaking({
      line,
      projects,
      types,
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
        linking.current = run(() => linkNoteLineToTask({ ...making.line, taskId }))
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

const RIGHT_TABS = ["checkins", "workload", "attention"] as const
type RightTab = (typeof RIGHT_TABS)[number]

/**
 * The right panel, as Tyler drew it on 14 Oct 2026: the chosen day with its
 * arrows on top, then Check-ins, Workload and, for the owner and admins,
 * Attention with its count, as underlined tabs. Under the tab's card sit the
 * day's Meetings and, with Due dates on, what is due that day.
 */
function RightPanel({
  canRun,
  checkins,
  meetings,
  due,
  openTask,
  liveChanges,
  onOpenTask,
  clients,
  client,
  onClient,
}: {
  canRun: boolean
  checkins: React.ReactNode
  meetings: React.ReactNode
  due: React.ReactNode
  /** The task whose window is open: the lists load again when it closes, so a fixed task leaves them. */
  openTask: string | undefined
  /** How many live changes have come in; each one loads Attention and Workload again. */
  liveChanges: number
  onOpenTask: (taskId: string) => void
  clients: string[]
  client: string | undefined
  onClient: (client: string | undefined) => void
}) {
  const [chosen, setTab] = useRememberedChoice<RightTab>(TEAM_RIGHT_TAB_KEY, "checkins", RIGHT_TABS)
  const tab = chosen === "attention" && !canRun ? "checkins" : chosen
  const reload = `${openTask ?? ""}:${liveChanges}`
  const attention = useAttention(canRun, reload)
  const attentionCount = attention.loaded.state === "ready" ? attention.loaded.value.length : 0
  return (
    <>
      {/* The tabs are the header (Tyler, 16 Oct 2026); the day is picked on the calendar.
          px-2 lines the first tab up with the cards and leaves room for all three. */}
      <DashboardCardHeader className="@container px-2">
        <UnderlineTabs
          value={tab}
          onValueChange={(value) => setTab(value as RightTab)}
          tabs={[
            { value: "checkins", label: "Check-ins" },
            { value: "workload", label: "Workload" },
            // "Attention" rather than "Needs attention", so three tabs fit the panel.
            ...(canRun
              ? [
                  {
                    value: "attention",
                    label: (
                      <>
                        Attention
                        {attentionCount ? (
                          <span className="rounded-full bg-destructive/10 px-1 text-xs text-destructive tabular-nums">
                            {attentionCount}
                          </span>
                        ) : null}
                      </>
                    ),
                  },
                ]
              : []),
          ]}
        />
      </DashboardCardHeader>
      <ScrollArea className="min-h-0 flex-1" viewportClassName="h-full">
        <div className="grid gap-3 p-3">
          {tab === "checkins" ? (
            checkins
          ) : tab === "workload" ? (
            <WorkloadPanel
              reload={reload}
              onOpenTask={onOpenTask}
              clients={clients}
              client={client}
              onClient={onClient}
            />
          ) : (
            <AttentionPanel attention={attention} onOpenTask={onOpenTask} />
          )}
          {meetings}
          {due}
        </div>
      </ScrollArea>
    </>
  )
}

/**
 * The day's check-ins, as Tyler drew them on 16 Oct 2026
 * (`workspace/docs/assets/pasted-image-1792198076949402000.png`): a card with
 * "3 of 6 checked in", a bar with one piece per person, and everyone who
 * checked in with their time and notes; then a card of whoever didn't, each
 * with what they picked last time, and one of whoever was away.
 */
function CheckinsCard({
  day,
  requested,
  myUserId,
  members,
}: {
  day: TeamDay
  /** The day picked on the calendar; a day still to come shows today instead. */
  requested: string | undefined
  myUserId: string
  /** The team, so a tag in a note reads as the person's current name. */
  members: TeamDashboardData["members"]
}) {
  const people = React.useMemo(
    () => members.map((member) => ({ id: member.userId, name: member.name })),
    [members]
  )
  const checkedIn = day.people.filter((row) => row.state === "checked_in")
  const missing = day.people.filter(
    (row) => row.state === "not_yet" || row.state === "missed" || row.state === "no_record"
  )
  const away = day.people.filter((row) => row.state === "away" || row.state === "day_off")
  const late = checkedIn.filter((row) => row.late).length
  const nothingSaved = day.people.every((row) => row.state === "no_record")
  return (
    <>
      <TeamSideCard
        title={day.expected ? `${day.checkedIn} of ${day.expected} checked in` : "Check-ins"}
        aside={
          day.blocked || late ? (
            <span className="flex items-center gap-1.5">
              {day.blocked ? (
                <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                  {day.blocked} blocked
                </span>
              ) : null}
              {late ? (
                <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                  {late} late
                </span>
              ) : null}
            </span>
          ) : null
        }
      >
        {requested && requested > day.today ? (
          <p className="text-sm">{shortDayLabel(requested)} hasn't happened yet. Showing today.</p>
        ) : null}
        {day.expected === 0 ? (
          // A day with no saved rows at all (before the team began, or a day
          // the end-of-day job never ran) isn't a day off; it's a day unknown.
          <p className="text-sm text-muted-foreground">
            {day.holiday
              ? `${day.holiday}, a team holiday.`
              : nothingSaved
                ? "Nothing was saved for this day."
                : "A day off for the team."}
          </p>
        ) : (
          <CheckinPieces checkedIn={checkedIn} expected={day.expected} />
        )}
        {checkedIn.length ? (
          <div className="grid min-w-0">
            {/* The lines between people run to the card's edges. */}
            <ul className="-mx-4 divide-y border-t">
              {checkedIn.map((row) => (
                <li key={row.person.id} className="px-4 py-3 last:pb-0">
                  <PersonCheckin
                    row={row}
                    viewerZone={day.viewerZone}
                    isMe={row.person.id === myUserId}
                    people={people}
                  />
                </li>
              ))}
            </ul>
          </div>
        ) : day.expected ? (
          <p className="text-sm text-muted-foreground">Nobody has checked in yet.</p>
        ) : null}
      </TeamSideCard>
      {missing.length && !nothingSaved ? (
        <TeamSideCard title="Didn't check in" aside={missing.length}>
          <ul className="grid gap-3">
            {missing.map((row) => (
              <OffRow
                key={row.person.id}
                row={row}
                isMe={row.person.id === myUserId}
                line={
                  row.state === "no_record"
                    ? "Nothing saved for this day"
                    : row.before.length
                      ? `${row.questions.yesterday}: ${taskWords(row.before)}`
                      : "No recent check-ins"
                }
              />
            ))}
          </ul>
        </TeamSideCard>
      ) : null}
      {away.length ? (
        <TeamSideCard title="Away" aside={away.length}>
          <ul className="grid gap-3">
            {away.map((row) => (
              <OffRow
                key={row.person.id}
                row={row}
                isMe={row.person.id === myUserId}
                line={row.state === "away" ? "Time off" : "Not a work day for them"}
              />
            ))}
          </ul>
        </TeamSideCard>
      ) : null}
    </>
  )
}

/**
 * One piece of the bar per person expected that day: amber for a late
 * check-in, red for someone blocked, the foreground for on time, and an empty
 * piece for each person still to check in.
 */
function CheckinPieces({ checkedIn, expected }: { checkedIn: TeamDayPerson[]; expected: number }) {
  const shown = checkedIn.slice(0, expected)
  const tone = (row: TeamDayPerson) =>
    row.blocked ? "bg-destructive" : row.late ? "bg-amber-500" : "bg-foreground"
  return (
    <div
      role="img"
      aria-label={`${checkedIn.length} of ${expected} checked in`}
      className="flex h-1.5 gap-1"
    >
      {shown.map((row) => (
        <span key={row.person.id} className={cn("flex-1 rounded-full", tone(row))} />
      ))}
      {Array.from({ length: expected - shown.length }, (_, index) => (
        <span key={`empty-${index}`} className="flex-1 rounded-full bg-muted" />
      ))}
    </div>
  )
}

/** Someone who didn't check in or was away: a dashed photo, the name, one line under it. */
function OffRow({ row, isMe, line }: { row: TeamDayPerson; isMe: boolean; line: string }) {
  return (
    <li className="flex min-w-0 items-center gap-3">
      <PersonAvatar
        name={row.person.name}
        size="default"
        className="after:border-dashed [&_[data-slot=avatar-fallback]]:bg-transparent"
      />
      <span className="grid min-w-0">
        <span className="truncate text-sm font-medium">
          {row.person.name}
          {isMe ? " (you)" : ""}
        </span>
        <span className="truncate text-xs text-muted-foreground">{line}</span>
      </span>
    </li>
  )
}

/** "Brief, Logo, 1 personal task": the titles the viewer may see, the rest counted. */
function taskWords(tasks: TeamDayTask[]) {
  const seen = tasks.flatMap((task) => (task.title !== null ? [task.title] : []))
  const personal = tasks.filter((task) => task.personal).length
  const hidden = tasks.length - seen.length - personal
  return [
    ...seen,
    hidden ? (hidden === 1 ? "1 task in another project" : `${hidden} tasks in other projects`) : null,
    personal ? (personal === 1 ? "1 personal task" : `${personal} personal tasks`) : null,
  ]
    .filter(Boolean)
    .join(", ")
}

/**
 * One person who checked in, as Tyler drew it on 16 Oct 2026
 * (`workspace/docs/assets/pasted-image-1792199207802160000.png`): name, the
 * time in the viewer's clock and Late, then under the team's word for
 * "Today" each task they picked as a card of its own. A task carried over
 * from their last check-in says "Since yesterday". A blocked one turns red
 * with its reason and Reply. Their own words, when they wrote any, sit
 * above the cards, and thanks get one small line.
 */
function PersonCheckin({
  row,
  viewerZone,
  isMe,
  people,
}: {
  row: TeamDayPerson
  viewerZone: string
  isMe: boolean
  people: { id: string; name: string }[]
}) {
  const { questions, notes } = row
  const carried = new Set(row.before.flatMap((task) => (task.taskId ? [task.taskId] : [])))
  const blockerOf = (task: TeamDayTask) =>
    task.taskId ? row.blockers.find((blocker) => blocker.taskId === task.taskId) : undefined
  // A blocked task the viewer can't open has no id to match, so it gets a card of its own.
  const unnamedBlockers = row.blockers.filter((blocker) => !blocker.taskId)
  // Those hidden blocked tasks are among the picks too, so the plain cards leave them out.
  const picked = [
    ...row.picked.filter((task) => task.taskId),
    ...row.picked.filter((task) => !task.taskId).slice(unnamedBlockers.length),
  ]
  const empty = !notes?.yesterday && !notes?.today && !notes?.blocker && row.picked.length === 0 && row.blockers.length === 0
  return (
    <div className="grid min-w-0 gap-2">
      <div className="flex min-w-0 items-center gap-3">
        <PersonAvatar name={row.person.name} avatarUrl={row.person.avatarUrl} size="default" />
        {/* In a narrow panel the time and Late drop under the name rather than out of the card. */}
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-x-3 gap-y-1">
          <span className="min-w-0 flex-1 basis-24 truncate text-sm font-medium">
            {row.person.name}
            {isMe ? " (you)" : ""}
          </span>
          <span className="flex min-w-0 flex-wrap items-center justify-end gap-2">
            {row.checkedInAt ? (
              <span className="text-sm text-muted-foreground tabular-nums">
                {clockIn(row.checkedInAt, viewerZone)}
              </span>
            ) : null}
            {row.late ? (
              <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                Late
              </span>
            ) : null}
          </span>
        </div>
      </div>
      <div className="grid min-w-0 gap-3 pl-11">
        {empty ? <p className="text-sm text-muted-foreground">No tasks attached</p> : null}
        {notes?.yesterday ? (
          <BoxSection label={questions.yesterday}>
            <p className="text-sm break-words">
              <TaggedWords body={notes.yesterday} people={people} />
            </p>
          </BoxSection>
        ) : null}
        {notes?.today || picked.length || unnamedBlockers.length || notes?.blocker ? (
          <BoxSection label={questions.today}>
            {notes?.today ? (
              <p className="text-sm break-words">
                <TaggedWords body={notes.today} people={people} />
              </p>
            ) : null}
            {picked.map((task, index) => (
              <PickCard
                key={task.taskId ?? `pick-${index}`}
                task={task}
                carried={Boolean(task.taskId && carried.has(task.taskId))}
                blocker={blockerOf(task)}
                row={row}
              />
            ))}
            {unnamedBlockers.map((blocker, index) => (
              <PickCard key={`hidden-${index}`} task={blocker} carried={false} blocker={blocker} row={row} />
            ))}
            {notes?.blocker ? (
              <BlockedCard
                title={null}
                reason={<TaggedWords body={notes.blocker} people={people} />}
                label={questions.blocker}
                replies={row.noteReplies}
                checkinId={row.checkinId}
                taskId={null}
                blockedName={row.person.name}
                canReply
              />
            ) : null}
          </BoxSection>
        ) : null}
        {row.thanks.length ? (
          <p className="flex items-start gap-1.5 text-xs break-words text-muted-foreground">
            <HeartIcon className="mt-0.5 size-3 shrink-0" aria-hidden />
            <span>
              Thanked by{" "}
              {row.thanks.map((line) => `${line.fromName} for ${line.taskTitle ?? "a task"}`).join(", ")}
            </span>
          </p>
        ) : null}
      </div>
    </div>
  )
}

/** "TODAY" in small capitals, the team's own word, over what goes with it. */
function BoxSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section aria-label={label} className="grid min-w-0 gap-1.5">
      <h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</h4>
      {children}
    </section>
  )
}

/** One picked task as a card; a blocked one is the red card with its reason and Reply. */
function PickCard({
  task,
  carried,
  blocker,
  row,
}: {
  task: TeamDayTask
  carried: boolean
  blocker: (TeamDayTask & { reason: string | null; replies: BlockerReply[] }) | undefined
  row: TeamDayPerson
}) {
  const since = carried ? (
    <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
      <RefreshCwIcon className="size-3" aria-hidden />
      Since yesterday
    </span>
  ) : null
  if (blocker) {
    return (
      <BlockedCard
        title={<TaskTitle task={task} />}
        since={since}
        reason={blocker.reason}
        label="Blocked"
        replies={blocker.replies}
        checkinId={row.checkinId}
        taskId={blocker.taskId}
        blockedName={row.person.name}
        // Only someone who can open the task replies about it; its title is private to them.
        canReply={Boolean(blocker.taskId)}
      />
    )
  }
  return (
    <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-1 rounded-lg border bg-background px-3 py-2.5 text-sm">
      <TaskTitle task={task} />
      {since}
    </div>
  )
}

/** The red card: what is blocked, the word "Blocked", the reason, Reply, and the replies. */
function BlockedCard({
  title,
  since,
  label,
  reason,
  replies,
  checkinId,
  taskId,
  blockedName,
  canReply,
}: {
  title: React.ReactNode
  since?: React.ReactNode
  label: string
  reason: React.ReactNode
  replies: BlockerReply[]
  checkinId: string | null
  taskId: string | null
  blockedName: string
  canReply: boolean
}) {
  const [replying, setReplying] = React.useState(false)
  return (
    <div className="grid min-w-0 gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-sm">
      {title ? (
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-1">
          {title}
          {since}
        </div>
      ) : null}
      <div className="flex min-w-0 items-end justify-between gap-3">
        <div className="grid min-w-0 gap-0.5">
          <span className="text-xs font-medium text-destructive">{label}</span>
          {reason ? <span className="break-words text-destructive">{reason}</span> : null}
        </div>
        {canReply && checkinId && !replying ? (
          <Button type="button" variant="outline" size="sm" className="shrink-0 bg-background" onClick={() => setReplying(true)}>
            Reply
          </Button>
        ) : null}
      </div>
      <BlockerReplies
        replies={replies}
        checkinId={checkinId}
        taskId={taskId}
        blockedName={blockedName}
        canReply={canReply}
        open={replying}
        onOpenChange={setReplying}
        className=""
      />
    </div>
  )
}

/** A task's title, opening it; one the viewer can't see is named for what it is. */
function TaskTitle({ task }: { task: TeamDayTask }) {
  if (task.title === null) {
    return (
      <span className="min-w-0 flex-1 basis-36 text-muted-foreground">
        {task.personal ? "A personal task" : "A task in another project"}
      </span>
    )
  }
  if (!task.taskId) return <span className="min-w-0 flex-1 basis-36 break-words">{task.title} (deleted)</span>
  return (
    <Link
      to="/team"
      search={(previous: TeamSearch) => ({ ...previous, task: task.taskId ?? undefined })}
      className="min-w-0 flex-1 basis-36 break-words hover:underline focus-visible:underline focus-visible:outline-none"
    >
      {task.title}
    </Link>
  )
}
