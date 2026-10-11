import * as React from "react"
import { Link, useNavigate } from "@tanstack/react-router"
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleAlertIcon,
  ClockIcon,
  PlusIcon,
  SettingsIcon,
  UserPlusIcon,
  UsersIcon,
} from "lucide-react"

import { InviteDialog } from "@/components/project/invite-dialog"
import { MeetingDialog } from "@/components/project/meeting-dialog"
import { PersonAvatar } from "@/components/project/task-bits"
import { TaskDialog } from "@/components/project/task-dialog"
import { TeamFiguresGrid, TeamPhoto } from "@/components/project/team-figures"
import { DayMeetings, MeetingChips } from "@/components/project/team-meetings"
import { AttentionPanel, WorkloadPanel } from "@/components/project/team-work-panels"
import { TeamSettingsDialog } from "@/components/project/team-settings-dialog"
import { TeamStart } from "@/components/project/team-start"
import { ThreePanels } from "@/components/project/three-panels"
import {
  DashboardCardHeader,
  DashboardCardTabsHeader,
  DashboardCardTitleHeader,
  dashboardCardHeadingClassName,
} from "@/components/shared/dashboard-card-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Meter } from "@/components/ui/meter"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsTrigger } from "@/components/ui/tabs"
import type {
  TeamDay,
  TeamDayPerson,
  TeamDayTask,
  TeamMonth,
} from "@/lib/api/project/checkins"
import type { Meeting, TeamMeetings } from "@/lib/api/project/meetings"
import type {
  InviteForMe,
  TeamDashboard as TeamDashboardData,
  TeamFigures,
} from "@/lib/api/project/teams"
import { formatDate, formatMonthAndYear } from "@/lib/format/format-time"
import { addDays, clockIn, clockLabel, longDayLabel, shortDayLabel, zoneCity } from "@/lib/project/days"
import { meetingWords, meetingsByDay, monthGrid, nextMeetingColor } from "@/lib/project/meetings"
import { TEAM_PANEL_LAYOUT_KEY, TEAM_RIGHT_TAB_KEY } from "@/lib/project/panel-keys"
import { useRememberedChoice } from "@/lib/remembered-choice"
import { TEAM_ROLE_LABEL, WEEK_DAYS, runsTheTeam } from "@/lib/project/rules"
import { cn } from "@/lib/utils"

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
}

/**
 * The Team dashboard, from Tyler's mockup: the team, its figures and its
 * people on the left, a month calendar of check-ins and meetings in the
 * middle with the chosen day's meetings under it, and one day's check-ins on
 * the right. Clicking a day in the calendar shows that day in both.
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

  return (
    <ThreePanels
      layoutKey={TEAM_PANEL_LAYOUT_KEY}
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
            selected={search.day ?? month.today}
            meetings={meetings}
            data={data}
            // A new month starts on its 1st, or on today in today's month, so
            // the calendar, its meetings and the check-ins name one day.
            onMonth={(next) =>
              go({ month: next, day: next === month.today.slice(0, 7) ? undefined : `${next}-01` })
            }
            onToday={() => go({ month: undefined, day: undefined })}
            onSelect={(next) => go({ day: next })}
          />
        ),
      }}
      right={{
        label: "Check-ins",
        showLabel: "Show the check-ins",
        content: (
          <RightPanel
            canRun={runsTheTeam(data.myRole)}
            checkins={
              <CheckinsPanel
                day={day}
                requested={search.day}
                myUserId={data.myUserId}
                onDay={(next) => go({ day: next, month: next.slice(0, 7) })}
              />
            }
            openTask={search.task}
            onOpenTask={(taskId) => go({ task: taskId })}
          />
        ),
      }}
    >
      <TaskDialog taskId={search.task ?? null} onClose={() => go({ task: undefined })} />
    </ThreePanels>
  )
}

function TeamPanel({ data, figures }: { data: TeamDashboardData; figures: TeamFigures }) {
  const { team } = data
  const canRun = runsTheTeam(data.myRole)
  const [settingsOpen, setSettingsOpen] = React.useState(false)
  const [inviting, setInviting] = React.useState(false)
  const days = WEEK_DAYS.map(({ day, short }) => ({ day, short, on: team.workDays.includes(day) }))
  const workDayNames = days.filter((d) => d.on).map((d) => d.short).join(", ")

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
        <div className="grid gap-5 p-4">
          <TeamPhoto teamName={team.name} photoUrl={team.photoUrl} canEdit={canRun} />
          <div className="grid gap-1">
            <h3 className="text-xl font-semibold break-words">{team.name}</h3>
            <p className="text-sm text-muted-foreground">
              Created {formatDate(team.createdAt)} · {team.timeZone.replaceAll("_", " ")}
            </p>
          </div>
          <TeamFiguresGrid figures={figures} />
          <Separator />
          <section className="grid gap-3" aria-labelledby="team-schedule-heading">
            <h3 id="team-schedule-heading" className="text-sm font-medium">
              Check-in schedule
            </h3>
            <p className="flex items-center gap-2 text-sm">
              <ClockIcon className="size-4 text-muted-foreground" aria-hidden />
              Daily at {clockLabel(team.checkinTime)}, {zoneCity(team.timeZone)} time
            </p>
            <ul className="grid grid-cols-7 gap-1.5" aria-label={`Work days: ${workDayNames}`}>
              {days.map(({ day, short, on }) => (
                <li
                  key={day}
                  aria-hidden
                  className={cn(
                    "flex h-8 items-center justify-center rounded-md text-xs font-medium",
                    on ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  )}
                >
                  {short.charAt(0)}
                </li>
              ))}
            </ul>
          </section>
          <Separator />
          <section className="grid gap-3" aria-labelledby="team-members-heading">
            <div className="flex items-center justify-between gap-2">
              <h3 id="team-members-heading" className="text-sm font-medium">
                Members
              </h3>
              <Link
                to="/team/members"
                className="text-sm text-muted-foreground hover:text-foreground hover:underline"
              >
                Manage
              </Link>
            </div>
            {canRun ? (
              <Button type="button" className="w-full" onClick={() => setInviting(true)}>
                <UserPlusIcon className="size-4" />
                Invite member
              </Button>
            ) : null}
            <ul className="grid gap-2">
              {data.members.map((member) => (
                <li key={member.userId} className="flex items-center gap-3 text-sm">
                  <PersonAvatar name={member.name} avatarUrl={member.avatarUrl} size="default" />
                  <span className="grid min-w-0 flex-1">
                    <span className="truncate">
                      {member.name}
                      {member.userId === data.myUserId ? " (you)" : ""}
                    </span>
                    {member.title ? (
                      <span className="truncate text-xs text-muted-foreground">{member.title}</span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-muted-foreground">{TEAM_ROLE_LABEL[member.role]}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </ScrollArea>
      <TeamSettingsDialog
        team={team}
        labels={data.labels}
        joinLink={data.joinLink}
        canEdit={canRun}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
      <InviteDialog open={inviting} onClose={() => setInviting(false)} />
    </>
  )
}

function CalendarPanel({
  month,
  selected,
  meetings,
  data,
  onMonth,
  onToday,
  onSelect,
}: {
  month: TeamMonth
  selected: string
  meetings: TeamMeetings
  data: TeamDashboardData
  onMonth: (month: string) => void
  onToday: () => void
  onSelect: (day: string) => void
}) {
  const [year, monthNumber] = month.month.split("-").map(Number)
  // Weeks start on Monday, the way the team's work days are listed.
  const grid = monthGrid(month.month)
  const byDay = new Map(month.days.map((d) => [d.day, d]))
  const meetingDays = React.useMemo(() => meetingsByDay(meetings), [meetings])
  // The meeting the window shows, null for a new one. It stays set while the
  // window closes, so the window doesn't change under its closing animation.
  const [windowOpen, setWindowOpen] = React.useState(false)
  const [target, setTarget] = React.useState<Meeting | null>(null)

  function edit(next: Meeting | "new") {
    setTarget(next === "new" ? null : next)
    setWindowOpen(true)
  }

  return (
    <>
      <DashboardCardHeader className="gap-2">
        <h2 className={cn("min-w-0 truncate", dashboardCardHeadingClassName)}>
          {formatMonthAndYear(year, monthNumber)}
        </h2>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Previous month"
          onClick={() => onMonth(addDays(grid.first, -1).slice(0, 7))}
        >
          <ChevronLeftIcon className="size-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Next month"
          onClick={() => onMonth(addDays(grid.first, 32).slice(0, 7))}
        >
          <ChevronRightIcon className="size-4" />
        </Button>
        <Button type="button" variant="outline" onClick={onToday}>
          Today
        </Button>
        {/* Words from 640px up; on a phone the month's name needs the room. */}
        <Button
          type="button"
          variant="outline"
          className="ml-auto max-sm:size-8 max-sm:px-0"
          aria-label="New meeting"
          onClick={() => edit("new")}
        >
          <PlusIcon className="size-4" />
          <span className="max-sm:hidden">New meeting</span>
        </Button>
      </DashboardCardHeader>
      <ScrollArea className="min-h-0 flex-1" viewportClassName="h-full">
        <div className="grid grid-cols-7 gap-1.5 p-3">
          {WEEK_DAYS.map(({ day, short }) => (
            <div key={day} aria-hidden className="pb-1 text-center text-xs text-muted-foreground">
              {short}
            </div>
          ))}
          {Array.from({ length: grid.cells }, (_, index) => {
            const date = addDays(grid.start, index)
            const inMonth = date.startsWith(month.month)
            const counts = inMonth ? byDay.get(date) : undefined
            const dayMeetings = inMonth ? (meetingDays.get(date) ?? []) : []
            const checkinWords = counts?.expected
              ? `${counts.checkedIn} of ${counts.expected} checked in${counts.blocked ? `, ${counts.blocked} blocked` : ""}`
              : null
            const words = [checkinWords, meetingWords(dayMeetings, meetings.viewerZone)].filter(Boolean)
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
                  "flex min-h-20 min-w-0 flex-col items-start gap-1 rounded-md border p-1.5 text-left text-xs hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:pointer-events-none sm:p-2",
                  !inMonth && "border-transparent bg-muted/60 text-muted-foreground",
                  date === selected && "ring-2 ring-ring"
                )}
              >
                <span
                  className={cn(
                    "flex size-6 items-center justify-center rounded-full text-sm",
                    date === month.today && "bg-primary font-semibold text-primary-foreground"
                  )}
                >
                  {Number(date.slice(8))}
                </span>
                {/* A phone's squares are too narrow for words: "4/6" and a mark with the number. */}
                {counts && counts.expected ? (
                  <span className="max-w-full rounded bg-muted px-1 py-0.5 sm:px-1.5">
                    <span className="sm:hidden">
                      {counts.checkedIn}/{counts.expected}
                    </span>
                    <span className="max-sm:hidden">
                      {counts.checkedIn} of {counts.expected} in
                    </span>
                  </span>
                ) : null}
                {counts?.blocked ? (
                  <span className="flex max-w-full items-center gap-0.5 rounded bg-destructive/10 px-1 py-0.5 text-destructive sm:px-1.5">
                    <CircleAlertIcon className="size-3 shrink-0 sm:hidden" aria-hidden />
                    {counts.blocked}
                    <span className="max-sm:hidden">&nbsp;blocked</span>
                  </span>
                ) : null}
                <MeetingChips meetings={dayMeetings} />
              </button>
            )
          })}
        </div>
        <DayMeetings
          day={selected}
          meetings={meetingDays.get(selected) ?? []}
          viewerZone={meetings.viewerZone}
          onEdit={edit}
        />
      </ScrollArea>
      <MeetingDialog
        open={windowOpen}
        meeting={target}
        day={selected < month.today ? month.today : selected}
        color={nextMeetingColor(meetings.meetings)}
        members={data.members}
        myUserId={data.myUserId}
        teamZone={meetings.teamZone}
        onClose={() => setWindowOpen(false)}
      />
    </>
  )
}

const RIGHT_TABS = ["checkins", "workload", "attention"] as const
type RightTab = (typeof RIGHT_TABS)[number]

/**
 * The right panel's three tabs: one day's check-ins, everyone's workload, and,
 * for the owner and admins, the tasks that need attention (Tyler's choice: a
 * tab here rather than a page of its own).
 */
function RightPanel({
  canRun,
  checkins,
  openTask,
  onOpenTask,
}: {
  canRun: boolean
  checkins: React.ReactNode
  /** The task whose window is open: the lists load again when it closes, so a fixed task leaves them. */
  openTask: string | undefined
  onOpenTask: (taskId: string) => void
}) {
  const [chosen, setTab] = useRememberedChoice<RightTab>(TEAM_RIGHT_TAB_KEY, "checkins", RIGHT_TABS)
  const tab = chosen === "attention" && !canRun ? "checkins" : chosen
  return (
    <>
      <Tabs value={tab} onValueChange={(value) => setTab(value as RightTab)}>
        <DashboardCardTabsHeader>
          <TabsTrigger value="checkins">Check-ins</TabsTrigger>
          <TabsTrigger value="workload">Workload</TabsTrigger>
          {/* "Attention" rather than "Needs attention", so three tabs fit the panel. */}
          {canRun ? <TabsTrigger value="attention">Attention</TabsTrigger> : null}
        </DashboardCardTabsHeader>
      </Tabs>
      {tab === "checkins" ? (
        checkins
      ) : tab === "workload" ? (
        <WorkloadPanel reload={openTask} onOpenTask={onOpenTask} />
      ) : (
        <AttentionPanel reload={openTask} onOpenTask={onOpenTask} />
      )}
    </>
  )
}

function CheckinsPanel({
  day,
  requested,
  myUserId,
  onDay,
}: {
  day: TeamDay
  /** The day picked on the calendar; a day still to come shows today instead. */
  requested: string | undefined
  myUserId: string
  onDay: (day: string) => void
}) {
  return (
    <>
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{shortDayLabel(day.day)}</span>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="The day before"
          onClick={() => onDay(addDays(day.day, -1))}
        >
          <ChevronLeftIcon className="size-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="The day after"
          disabled={day.day >= day.today}
          onClick={() => onDay(addDays(day.day, 1))}
        >
          <ChevronRightIcon className="size-4" />
        </Button>
      </div>
      <div className="grid gap-2 border-b px-4 py-3">
        {requested && requested > day.today ? (
          <p className="text-sm">{shortDayLabel(requested)} hasn't happened yet. Showing today.</p>
        ) : null}
        {day.expected === 0 ? (
          <p className="text-sm text-muted-foreground">A day off for the team.</p>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
              <span>
                {day.checkedIn} of {day.expected} checked in
              </span>
              {day.blocked ? <span>{day.blocked} blocked</span> : null}
            </div>
            <Meter
              value={day.checkedIn}
              max={day.expected}
              label="People checked in"
              valueText={`${day.checkedIn} of ${day.expected}`}
              size="sm"
            />
          </>
        )}
      </div>
      <ScrollArea className="min-h-0 flex-1" viewportClassName="h-full">
        <ul className="divide-y">
          {day.people.map((row) => (
            <PersonCheckin
              key={row.person.id}
              row={row}
              viewerZone={day.viewerZone}
              isMe={row.person.id === myUserId}
            />
          ))}
        </ul>
      </ScrollArea>
    </>
  )
}

/**
 * The check-in time reads in the viewer's clock, like meetings do. Only the
 * time moves: late is still judged on the person's own clock by the server.
 */
function stateLine(row: TeamDayPerson, viewerZone: string) {
  switch (row.state) {
    case "checked_in":
      return `Checked in ${row.checkedInAt ? clockIn(row.checkedInAt, viewerZone) : ""}${row.late ? " · late" : ""}`
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

function PersonCheckin({
  row,
  viewerZone,
  isMe,
}: {
  row: TeamDayPerson
  viewerZone: string
  isMe: boolean
}) {
  return (
    <li className="flex gap-3 px-4 py-4">
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
          {row.blocked ? <Badge variant="destructive">Blocked</Badge> : null}
        </div>
        <NoteLine label="Yesterday" note={row.notes?.yesterday ?? null} tasks={row.before} />
        <NoteLine label="Today" note={row.notes?.today ?? null} tasks={row.picked} />
        {row.notes?.blocker ? (
          <p className="text-sm break-words text-destructive">Blocker · {row.notes.blocker}</p>
        ) : null}
        {row.blockers.map((blocker, index) => (
          <p key={blocker.taskId ?? index} className="text-sm break-words text-destructive">
            Blocker ·{" "}
            {blocker.title ?? (blocker.personal ? "a personal task" : "a task in another project")}
            {blocker.reason ? `: ${blocker.reason}` : ""}
          </p>
        ))}
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
}: {
  label: string
  note: string | null
  tasks: TeamDayTask[]
}) {
  if (!note) return tasks.length ? <TaskLine label={label} tasks={tasks} /> : null
  return (
    <div className="grid gap-0.5">
      <p className="text-sm break-words">
        <span className="text-muted-foreground">{label} · </span>
        {note}
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
