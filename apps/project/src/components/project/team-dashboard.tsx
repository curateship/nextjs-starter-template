import * as React from "react"
import { Link, useNavigate } from "@tanstack/react-router"
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  SettingsIcon,
  UserPlusIcon,
  UsersIcon,
} from "lucide-react"

import { InviteDialog } from "@/components/project/invite-dialog"
import { PersonAvatar } from "@/components/project/task-bits"
import { TaskDialog } from "@/components/project/task-dialog"
import { TeamSettingsDialog } from "@/components/project/team-settings-dialog"
import { TeamStart } from "@/components/project/team-start"
import { ThreePanels } from "@/components/project/three-panels"
import {
  DashboardCardHeader,
  DashboardCardTitleHeader,
  dashboardCardHeadingClassName,
} from "@/components/shared/dashboard-card-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Meter } from "@/components/ui/meter"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import type {
  TeamDay,
  TeamDayPerson,
  TeamDayTask,
  TeamMonth,
} from "@/lib/api/project/checkins"
import type { InviteForMe, TeamDashboard as TeamDashboardData } from "@/lib/api/project/teams"
import { formatDate, formatMonthAndYear } from "@/lib/format/format-time"
import { addDays, clockIn, clockLabel, longDayLabel, shortDayLabel, weekdayOf } from "@/lib/project/days"
import { TEAM_PANEL_LAYOUT_KEY } from "@/lib/project/panel-keys"
import { TEAM_ROLE_LABEL, WEEK_DAYS, runsTheTeam } from "@/lib/project/rules"
import { cn } from "@/lib/utils"

export type TeamSearch = {
  /** "YYYY-MM" shown in the calendar. Left out, the current month. */
  month?: string
  /** "YYYY-MM-DD" whose check-ins show on the right. Left out, today. */
  day?: string
  /** The task whose window is open. */
  task?: string
}

/**
 * The Team dashboard: the team and its people on the left, a calendar of the
 * team's check-ins in the middle, and one day's check-ins on the right.
 * Clicking a day in the calendar shows that day on the right.
 */
export function TeamDashboardScreen({
  data,
  checkins,
  invites,
  search,
}: {
  data: TeamDashboardData | null
  checkins: { month: TeamMonth; day: TeamDay } | null
  invites: InviteForMe[]
  search: TeamSearch
}) {
  if (!data || !checkins) return <TeamStart invites={invites} />
  return <Dashboard data={data} month={checkins.month} day={checkins.day} search={search} />
}

function Dashboard({
  data,
  month,
  day,
  search,
}: {
  data: TeamDashboardData
  month: TeamMonth
  day: TeamDay
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
        content: <TeamPanel data={data} />,
      }}
      middle={{
        label: "Calendar",
        content: (
          <CalendarPanel
            month={month}
            selected={day.day}
            onMonth={(next) => go({ month: next })}
            onToday={() => go({ month: undefined, day: undefined })}
            onSelect={(next) => go({ day: next })}
          />
        ),
      }}
      right={{
        label: "Check-ins",
        showLabel: "Show the check-ins",
        content: (
          <CheckinsPanel
            day={day}
            myUserId={data.myUserId}
            onDay={(next) => go({ day: next, month: next.slice(0, 7) })}
          />
        ),
      }}
    >
      <TaskDialog taskId={search.task ?? null} onClose={() => go({ task: undefined })} />
    </ThreePanels>
  )
}

function TeamPanel({ data }: { data: TeamDashboardData }) {
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
          <div className="grid gap-1">
            <h3 className="text-xl font-semibold break-words">{team.name}</h3>
            <p className="text-sm text-muted-foreground">
              Created {formatDate(team.createdAt)} · {team.timeZone.replaceAll("_", " ")}
            </p>
          </div>
          <Separator />
          <section className="grid gap-3" aria-labelledby="team-schedule-heading">
            <h3 id="team-schedule-heading" className="text-sm font-medium">
              Check-in schedule
            </h3>
            <p className="flex items-center gap-2 text-sm">
              <ClockIcon className="size-4 text-muted-foreground" aria-hidden />
              Daily at {clockLabel(team.checkinTime)}
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
                  <span className="min-w-0 flex-1 truncate">
                    {member.name}
                    {member.userId === data.myUserId ? " (you)" : ""}
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
  onMonth,
  onToday,
  onSelect,
}: {
  month: TeamMonth
  selected: string
  onMonth: (month: string) => void
  onToday: () => void
  onSelect: (day: string) => void
}) {
  const [year, monthNumber] = month.month.split("-").map(Number)
  const first = `${month.month}-01`
  // Weeks start on Monday, the way the team's work days are listed.
  const lead = (weekdayOf(first) + 6) % 7
  const gridStart = addDays(first, -lead)
  const daysInMonth = Number(addDays(`${addDays(first, 32).slice(0, 7)}-01`, -1).slice(8))
  const cells = Math.ceil((lead + daysInMonth) / 7) * 7
  const byDay = new Map(month.days.map((d) => [d.day, d]))

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
          onClick={() => onMonth(addDays(first, -1).slice(0, 7))}
        >
          <ChevronLeftIcon className="size-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Next month"
          onClick={() => onMonth(addDays(first, 32).slice(0, 7))}
        >
          <ChevronRightIcon className="size-4" />
        </Button>
        <Button type="button" variant="outline" onClick={onToday}>
          Today
        </Button>
      </DashboardCardHeader>
      <ScrollArea className="min-h-0 flex-1" viewportClassName="h-full">
        <div className="grid grid-cols-7 gap-1.5 p-3">
          {WEEK_DAYS.map(({ day, short }) => (
            <div key={day} aria-hidden className="pb-1 text-center text-xs text-muted-foreground">
              {short}
            </div>
          ))}
          {Array.from({ length: cells }, (_, index) => {
            const date = addDays(gridStart, index)
            const inMonth = date.startsWith(month.month)
            const counts = inMonth ? byDay.get(date) : undefined
            const future = date > month.today
            const words = counts
              ? `${counts.checkedIn} of ${counts.expected} checked in${counts.blocked ? `, ${counts.blocked} blocked` : ""}`
              : null
            return (
              <button
                key={date}
                type="button"
                disabled={!inMonth || future}
                aria-pressed={date === selected}
                aria-current={date === month.today ? "date" : undefined}
                aria-label={`${longDayLabel(date)}${words ? `: ${words}` : ""}`}
                onClick={() => onSelect(date)}
                className={cn(
                  "flex min-h-20 min-w-0 flex-col items-start gap-1 rounded-md border p-2 text-left text-xs hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:pointer-events-none",
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
                {counts && counts.expected ? (
                  <span className="max-w-full rounded bg-muted px-1.5 py-0.5">
                    {counts.checkedIn} of {counts.expected} in
                  </span>
                ) : null}
                {counts?.blocked ? (
                  <span className="max-w-full rounded bg-destructive/10 px-1.5 py-0.5 text-destructive">
                    {counts.blocked} blocked
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
      </ScrollArea>
    </>
  )
}

function CheckinsPanel({
  day,
  myUserId,
  onDay,
}: {
  day: TeamDay
  myUserId: string
  onDay: (day: string) => void
}) {
  return (
    <>
      <DashboardCardHeader className="gap-2">
        <h2 className={cn("min-w-0 flex-1 truncate", dashboardCardHeadingClassName)}>Check-ins</h2>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="The day before"
          onClick={() => onDay(addDays(day.day, -1))}
        >
          <ChevronLeftIcon className="size-4" />
        </Button>
        <span className="shrink-0 text-sm font-medium">{shortDayLabel(day.day)}</span>
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
      </DashboardCardHeader>
      <div className="grid gap-2 border-b px-4 py-3">
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
      </div>
      <ScrollArea className="min-h-0 flex-1" viewportClassName="h-full">
        <ul className="divide-y">
          {day.people.map((row) => (
            <PersonCheckin key={row.person.id} row={row} isMe={row.person.id === myUserId} />
          ))}
        </ul>
      </ScrollArea>
    </>
  )
}

function stateLine(row: TeamDayPerson) {
  switch (row.state) {
    case "checked_in":
      return `Checked in ${row.checkedInAt ? clockIn(row.checkedInAt, row.timeZone) : ""}${row.late ? " · late" : ""}`
    case "not_yet":
      return "No check-in yet"
    case "missed":
      return "Didn't check in"
    case "day_off":
      return "Day off"
    case "no_record":
      return "Nothing saved for this day"
  }
}

function PersonCheckin({ row, isMe }: { row: TeamDayPerson; isMe: boolean }) {
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
            <span className="text-xs text-muted-foreground">{stateLine(row)}</span>
          </div>
          {row.blockers.length ? <Badge variant="destructive">Blocked</Badge> : null}
        </div>
        {row.before.length ? (
          <TaskLine label="Yesterday" tasks={row.before} />
        ) : null}
        {row.picked.length ? (
          <TaskLine label="Today" tasks={row.picked} />
        ) : null}
        {row.blockers.map((blocker, index) => (
          <p key={blocker.taskId ?? index} className="text-sm break-words text-destructive">
            Blocker · {blocker.title ?? "a task in another project"}
            {blocker.reason ? `: ${blocker.reason}` : ""}
          </p>
        ))}
      </div>
    </li>
  )
}

/** "Today · Brief, Logo, 1 task in another project". */
function TaskLine({ label, tasks }: { label: string; tasks: TeamDayTask[] }) {
  const seen = tasks.filter((task) => task.title !== null)
  const hidden = tasks.length - seen.length
  return (
    <p className="text-sm break-words">
      <span className="text-muted-foreground">{label} · </span>
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
      {hidden ? (
        <span className="text-muted-foreground">
          {seen.length ? ", " : ""}
          {hidden === 1 ? "1 task in another project" : `${hidden} tasks in other projects`}
        </span>
      ) : null}
    </p>
  )
}
