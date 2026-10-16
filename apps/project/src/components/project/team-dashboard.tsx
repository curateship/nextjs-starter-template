import * as React from "react"
import { Link, useNavigate, useRouter } from "@tanstack/react-router"
import {
  ChartColumnIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleAlertIcon,
  HeartIcon,
  ListFilterIcon,
  MegaphoneIcon,
  PartyPopperIcon,
  PlusIcon,
  SettingsIcon,
  UsersIcon,
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
import { TeamFiguresGrid, TeamPhoto } from "@/components/project/team-figures"
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
import { DashboardCardHeader, DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Meter } from "@/components/ui/meter"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  showDueDatesOnCalendar,
  type AwayDay,
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
  type InviteForMe,
  type SentInvite,
  type TeamDashboard as TeamDashboardData,
  type TeamFigures,
  type TeamInviteRow,
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
import { TEAM_ROLE_LABEL, runsTheTeam } from "@/lib/project/rules"
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
  invites,
  search,
}: {
  data: TeamDashboardData | null
  checkins: { month: TeamMonth; day: TeamDay } | null
  meetings: TeamMeetings | null
  figures: TeamFigures | null
  invites: InviteForMe[]
  search: TeamSearch
}) {
  if (!data || !checkins || !meetings || !figures) return <TeamStart invites={invites} />
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
            day={day}
            onDay={(next) => go({ day: next, month: next.slice(0, 7) })}
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
  const router = useRouter()
  const [settingsOpen, setSettingsOpen] = React.useState(false)
  const [inviting, setInviting] = React.useState(false)
  const [trendsOpen, setTrendsOpen] = React.useState(false)
  // A teammate's page, and handing over all of someone's tasks from it.
  const [viewing, setViewing] = React.useState<TeamMemberRow | null>(null)
  const [handingOver, setHandingOver] = React.useState<TeamMemberRow | null>(null)
  const [resent, setResent] = React.useState<{ sent: SentInvite; email: string } | null>(null)
  const [run, busy] = useAsyncAction(getProjectErrorMessage)

  /** The same resend as the Members page: a fresh link, the old one stops working. */
  async function resend(invite: TeamInviteRow) {
    let sent: SentInvite | null = null
    const ok = await run(async () => {
      sent = await resendTeamInvite(invite.id)
    })
    if (!ok || !sent) return
    setResent({ sent, email: invite.email })
    await router.invalidate()
  }

  return (
    <>
      <DashboardCardTitleHeader
        icon={<UsersIcon className="size-4" />}
        title="Team"
        action={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Team settings"
            onClick={() => setSettingsOpen(true)}
          >
            <SettingsIcon className="size-4" />
          </Button>
        }
      />
      <ScrollArea className="min-h-0 flex-1" viewportClassName="h-full">
        {/* The check-in schedule is in Team settings (the cog), so it isn't repeated here (Tyler, 14 Oct 2026). */}
        <div className="grid gap-3 p-3">
          <TeamPhoto teamName={team.name} photoUrl={team.photoUrl} canEdit={canRun} />
          <div className="grid gap-0.5 px-1 pb-1">
            <h3 className="text-lg font-semibold break-words">{team.name}</h3>
            <p className="text-sm text-muted-foreground">
              Created {formatDate(team.createdAt)} · {zoneCity(team.timeZone)}
            </p>
          </div>
          <PanelCard storageId="project-team-this-week" title="This week">
            <TeamFiguresGrid figures={figures} />
            <Button type="button" variant="outline" size="sm" className="bg-background" onClick={() => setTrendsOpen(true)}>
              <ChartColumnIcon className="size-4" />
              Trends, last 12 weeks
            </Button>
          </PanelCard>
          <PanelCard storageId="project-team-members" title="Members" meta={data.members.length}>
            {/* min-w-0: in a narrow panel the names shorten rather than pushing Owner and Resend out of the card. */}
            <ul className="grid min-w-0 gap-1">
              {data.members.map((member) => (
                <li key={member.userId}>
                  <button
                    type="button"
                    onClick={() => setViewing(member)}
                    className="flex w-full items-center gap-3 rounded-md py-1 text-left text-sm hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <PersonAvatar name={member.name} avatarUrl={member.avatarUrl} size="default" />
                    <span className="grid min-w-0 flex-1">
                      <span className="truncate font-medium">
                        {member.name}
                        {member.userId === data.myUserId ? " (you)" : ""}
                      </span>
                      {member.title ? (
                        <span className="truncate text-xs text-muted-foreground">{member.title}</span>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">{TEAM_ROLE_LABEL[member.role]}</span>
                  </button>
                </li>
              ))}
              {/* Only the owner and admins are sent the pending invites. */}
              {data.invites.map((invite) => (
                <li key={invite.id} className="flex items-center gap-3 py-1 text-sm">
                  <span aria-hidden className="size-8 shrink-0 rounded-full border border-dashed" />
                  <span className="grid min-w-0 flex-1">
                    <span className="truncate text-muted-foreground">{invite.email}</span>
                    <span className="text-xs text-muted-foreground">{invite.expired ? "Invite ran out" : "Pending invite"}</span>
                  </span>
                  <Button type="button" variant="ghost" size="sm" className="-mr-2" disabled={busy} onClick={() => void resend(invite)}>
                    Resend
                  </Button>
                </li>
              ))}
            </ul>
            {/* Side by side where they fit; Manage drops under Invite member in a narrow panel. */}
            <div className="flex min-w-0 flex-wrap gap-2">
              {canRun ? (
                <Button type="button" size="sm" className="flex-1" onClick={() => setInviting(true)}>
                  <PlusIcon className="size-4" />
                  Invite member
                </Button>
              ) : null}
              <Button asChild variant="outline" size="sm" className="flex-1 bg-background">
                <Link to="/team/members">Manage</Link>
              </Button>
            </div>
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
                    <DayNumber date={date} today={month.today} />
                    {/* A phone's squares are too narrow for words: "4/6" and a mark with the number. */}
                    {holiday ? (
                      <span className="flex max-w-full items-center gap-0.5 rounded bg-muted px-1 py-0.5 text-muted-foreground sm:px-1.5">
                        <PartyPopperIcon className="size-3 shrink-0" aria-hidden />
                        <span className="truncate max-sm:hidden">{holiday}</span>
                      </span>
                    ) : null}
                    {counts && counts.expected ? (
                      <span className="w-full rounded bg-muted px-1 py-0.5 sm:px-1.5">
                        <span className="sm:hidden">
                          {counts.checkedIn}/{counts.expected}
                        </span>
                        <span className="max-sm:hidden">
                          {counts.checkedIn} of {counts.expected} in
                        </span>
                      </span>
                    ) : null}
                    {counts?.blocked ? (
                      <span className="flex w-full items-center gap-0.5 rounded bg-destructive/10 px-1 py-0.5 text-destructive sm:px-1.5">
                        <CircleAlertIcon className="size-3 shrink-0 sm:hidden" aria-hidden />
                        {counts.blocked}
                        <span className="max-sm:hidden">&nbsp;blocked</span>
                      </span>
                    ) : null}
                    <AwayChip away={away} />
                    <MeetingChips meetings={dayMeetings} />
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
  day,
  onDay,
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
  day: TeamDay
  onDay: (day: string) => void
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
      <DashboardCardHeader>
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">{longDayLabel(day.day)}</h2>
        <Button type="button" variant="ghost" size="icon" aria-label="The day before" onClick={() => onDay(addDays(day.day, -1))}>
          <ChevronLeftIcon className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="The day after"
          disabled={day.day >= day.today}
          onClick={() => onDay(addDays(day.day, 1))}
        >
          <ChevronRightIcon className="size-4" />
        </Button>
      </DashboardCardHeader>
      <div className="flex h-11 shrink-0 border-b px-4">
        <UnderlineTabs
          value={tab}
          onValueChange={(value) => setTab(value as RightTab)}
          className="my-0 self-stretch"
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
                          <span className="rounded-full bg-destructive/10 px-1.5 text-xs text-destructive tabular-nums">
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
      </div>
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
 * The day's check-ins as a card: "1 of 1 checked in" with its bar, then each
 * person with when they checked in, Late or Blocked, and their notes.
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
  return (
    <TeamSideCard
      title="Check-ins"
      aside={
        day.expected ? (
          <>
            {day.checkedIn} of {day.expected} checked in
            {day.blocked ? ` · ${day.blocked} blocked` : ""}
          </>
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
            : day.people.every((row) => row.state === "no_record")
              ? "Nothing was saved for this day."
              : "A day off for the team."}
        </p>
      ) : (
        <Meter
          value={day.checkedIn}
          max={day.expected}
          label="People checked in"
          valueText={`${day.checkedIn} of ${day.expected}`}
          size="sm"
        />
      )}
      <ul className="grid gap-3">
        {day.people.map((row) => (
          <PersonCheckin
            key={row.person.id}
            row={row}
            viewerZone={day.viewerZone}
            isMe={row.person.id === myUserId}
            people={people}
          />
        ))}
      </ul>
    </TeamSideCard>
  )
}

/**
 * The check-in time reads in the viewer's clock, like meetings do. Only the
 * time moves: late is still judged on the person's own clock by the server.
 */
function stateLine(row: TeamDayPerson, viewerZone: string) {
  switch (row.state) {
    case "checked_in":
      // Late is a badge at the row's end, as Tyler drew it.
      return `Checked in ${row.checkedInAt ? clockIn(row.checkedInAt, viewerZone) : ""}`
    case "not_yet":
      return "No check-in yet"
    case "missed":
      return "Didn't check in"
    case "day_off":
      return "Day off"
    case "away":
      return "Away"
    case "no_record":
      return "Nothing saved for this day"
  }
}

/**
 * One person's day: their notes under the team's words for that day, their
 * picks, each blocker with its replies and a Reply button, and the thanks
 * they got that day in one small line.
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
  const { questions } = row
  return (
    <li className="flex gap-3">
      <PersonAvatar name={row.person.name} avatarUrl={row.person.avatarUrl} size="default" />
      <div className="grid min-w-0 flex-1 gap-2">
        <div className="flex items-start justify-between gap-2">
          <div className="grid min-w-0">
            <span className="truncate text-sm font-medium">
              {row.person.name}
              {isMe ? " (you)" : ""}
            </span>
            <span className="text-xs text-muted-foreground">{stateLine(row, viewerZone)}</span>
          </div>
          <span className="flex shrink-0 gap-1">
            {row.state === "checked_in" && row.late ? (
              <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                Late
              </span>
            ) : null}
            {row.blocked ? <Badge variant="destructive">Blocked</Badge> : null}
          </span>
        </div>
        <NoteLine label={questions.yesterday} note={row.notes?.yesterday ?? null} tasks={row.before} people={people} />
        <NoteLine label={questions.today} note={row.notes?.today ?? null} tasks={row.picked} people={people} />
        {row.notes?.blocker ? (
          <div className="grid gap-1">
            <p className="text-sm break-words text-destructive">
              {questions.blocker} · <TaggedWords body={row.notes.blocker} people={people} />
            </p>
            <BlockerReplies
              replies={row.noteReplies}
              checkinId={row.checkinId}
              taskId={null}
              blockedName={row.person.name}
              canReply
            />
          </div>
        ) : null}
        {row.blockers.map((blocker, index) => (
          <div key={blocker.taskId ?? index} className="grid gap-1">
            <p className="text-sm break-words text-destructive">
              {questions.blocker} ·{" "}
              {blocker.title ?? (blocker.personal ? "a personal task" : "a task in another project")}
              {blocker.reason ? `: ${blocker.reason}` : ""}
            </p>
            {/* Only someone who can open the task replies about it; its title is private to them. */}
            <BlockerReplies
              replies={blocker.replies}
              checkinId={row.checkinId}
              taskId={blocker.taskId}
              blockedName={row.person.name}
              canReply={Boolean(blocker.taskId)}
            />
          </div>
        ))}
        {row.thanks.length ? (
          <p className="flex items-start gap-1.5 text-xs break-words text-muted-foreground">
            <HeartIcon className="mt-0.5 size-3 shrink-0" aria-hidden />
            <span>
              Thanked by{" "}
              {row.thanks
                .map((line) => `${line.fromName} for ${line.taskTitle ?? "a task"}`)
                .join(", ")}
            </span>
          </p>
        ) : null}
      </div>
    </li>
  )
}

/**
 * "Today · Work on members table" in the person's own words, with the tasks
 * they picked in a small grey line under it (Tyler's choice, 11 Oct 2026).
 * With no note, the picked tasks are the line, as before notes existed.
 */
function NoteLine({
  label,
  note,
  tasks,
  people,
}: {
  label: string
  note: string | null
  tasks: TeamDayTask[]
  people: { id: string; name: string }[]
}) {
  if (!note) return tasks.length ? <TaskLine label={label} tasks={tasks} /> : null
  return (
    <div className="grid gap-0.5">
      <p className="text-sm break-words">
        <span className="text-muted-foreground">{label} · </span>
        <TaggedWords body={note} people={people} />
      </p>
      {tasks.length ? <TaskLine tasks={tasks} quiet /> : null}
    </div>
  )
}

/**
 * "Today · Brief, Logo, 1 task in another project, 1 personal task". `quiet`
 * is the small grey line under a note, with no label.
 */
function TaskLine({
  label,
  tasks,
  quiet = false,
}: {
  label?: string
  tasks: TeamDayTask[]
  quiet?: boolean
}) {
  const seen = tasks.filter((task) => task.title !== null)
  const personal = tasks.filter((task) => task.personal).length
  const hidden = tasks.length - seen.length - personal
  const unnamed = [
    hidden ? (hidden === 1 ? "1 task in another project" : `${hidden} tasks in other projects`) : null,
    personal ? (personal === 1 ? "1 personal task" : `${personal} personal tasks`) : null,
  ].filter(Boolean)
  return (
    <p className={cn("break-words", quiet ? "text-xs text-muted-foreground" : "text-sm")}>
      {label ? <span className="text-muted-foreground">{label} · </span> : null}
      {seen.map((task, index) => (
        <React.Fragment key={task.taskId ?? `${task.title}-${index}`}>
          {index ? ", " : null}
          {task.taskId ? (
            <Link
              to="/team"
              search={(previous: TeamSearch) => ({ ...previous, task: task.taskId ?? undefined })}
              className="hover:underline focus-visible:underline focus-visible:outline-none"
            >
              {task.title}
            </Link>
          ) : (
            <span>{task.title} (deleted)</span>
          )}
        </React.Fragment>
      ))}
      {unnamed.length ? (
        <span className="text-muted-foreground">
          {seen.length ? ", " : ""}
          {unnamed.join(", ")}
        </span>
      ) : null}
    </p>
  )
}
