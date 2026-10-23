import * as React from "react"
import { Link, useNavigate, useRouter } from "@tanstack/react-router"
import { ChevronDown } from "lucide-react"
import { toast } from "sonner"

import { PanelCard } from "@/components/project/panel-card"
import { ProjectPaceMark } from "@/components/project/project-pace"
import { ReasonDialog } from "@/components/project/reason-dialog"
import { ProjectDot } from "@/components/project/task-bits"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { AdminDashboard, WaitingAsk } from "@/lib/api/project/admin-dashboard"
import { assignProjectTask, answerMoreTaskTime, type TaskCard } from "@/lib/api/project/tasks"
import { resendTeamInvite } from "@/lib/api/project/teams"
import { plural } from "@/lib/format/plural"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { focusRingInset } from "@/lib/layout/focus-ring"
import { clockIn, dayLabel, localNow } from "@/lib/project/days"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { TEAM_RIGHT_TAB_KEY } from "@/lib/project/panel-keys"
import { countLate, projectPace } from "@/lib/project/project-pace"
import { cn } from "@/lib/utils"

/**
 * The site admin's ten cards on the left of their My dashboard, in Tyler's
 * "act first" order (23 Oct 2026). Each counts across every team, shows its
 * five most urgent rows with "Show all" for the rest, and shrinks to one line
 * when it has nothing. A task in a card opens in the right panel. The Inbox,
 * the tenth, is drawn by the screen.
 */

/** Rows a card shows before "Show all". */
const ROWS = 5

type Cards = AdminDashboard["cards"]

export function AdminCards({
  cards,
  zone,
  onOpenTask,
}: {
  cards: Cards
  /** The site admin's own zone, for meeting times. */
  zone: string
  onOpenTask: (taskId: string) => void
}) {
  return (
    <>
      <WaitingCard asks={cards.waiting} onOpenTask={onOpenTask} />
      <AttentionCard teams={cards.attention} />
      <UnassignedCard tasks={cards.unassigned} onOpenTask={onOpenTask} />
      <InvitesCard invites={cards.invites} />
      <MeetingsCard meetings={cards.meetings} zone={zone} />
      <TaskListCard
        storageId="project-admin-due-week"
        title="Due this week"
        tasks={cards.dueThisWeek}
        line={(task) =>
          [task.projectName, task.dueDate ? dayLabel(task.dueDate) : null, task.assignee?.name ?? "Nobody on it"]
            .filter(Boolean)
            .join(" · ")
        }
        onOpenTask={onOpenTask}
      />
      <LateProjectsCard projects={cards.projects} />
      <MilestonesCard milestones={cards.milestones} />
      <DoneTodayCard people={cards.doneToday} onOpenTask={onOpenTask} />
    </>
  )
}

/** A card's rows, the first five then the rest behind "Show all". */
function Rows<T>({ items, children }: { items: T[]; children: (item: T) => React.ReactNode }) {
  const [all, setAll] = React.useState(false)
  return (
    <div className="grid gap-1">
      <ul className="-mx-2 grid gap-0.5">{(all ? items : items.slice(0, ROWS)).map(children)}</ul>
      {items.length > ROWS ? (
        <Button type="button" variant="ghost" size="sm" className="-ml-2 justify-self-start" onClick={() => setAll(!all)}>
          {all ? "Show fewer" : `Show all ${items.length}`}
        </Button>
      ) : null}
    </div>
  )
}

const ROW_CLASS = "grid w-full min-w-0 gap-0.5 rounded-md px-2 py-1.5 text-left hover:bg-background"

/** A row's title and its muted line under it, as one button. */
function RowButton({ title, line, onClick }: { title: React.ReactNode; line: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" className={cn(ROW_CLASS, focusRingInset)} onClick={onClick}>
      <span className="truncate text-sm">{title}</span>
      <span className="truncate text-xs text-muted-foreground">{line}</span>
    </button>
  )
}

function WaitingCard({ asks, onOpenTask }: { asks: WaitingAsk[]; onOpenTask: (taskId: string) => void }) {
  const router = useRouter()
  const [run, busy] = useAsyncAction(getProjectErrorMessage)
  const [saying, setSaying] = React.useState<WaitingAsk | null>(null)
  if (asks.length === 0) return <PanelCard storageId="project-admin-waiting" title="Waiting on you" meta="None" empty />

  async function answer(work: () => Promise<unknown>, done: string) {
    const ok = await run(work, done)
    if (ok) await router.invalidate()
    return ok
  }

  return (
    <PanelCard storageId="project-admin-waiting" title="Waiting on you" meta={asks.length}>
      <Rows items={asks}>
        {(ask) => (
          <li key={ask.taskId} className="grid gap-1.5 rounded-md px-2 py-1.5">
            <button
              type="button"
              className={cn("min-w-0 truncate rounded-md text-left text-sm hover:underline", focusRingInset)}
              onClick={() => onOpenTask(ask.taskId)}
            >
              {ask.title}
            </button>
            <p className="text-xs text-muted-foreground">
              {ask.askedByName} asks for {dayLabel(ask.day)}
              {ask.dueDate ? ` instead of ${dayLabel(ask.dueDate)}` : ""} · {ask.projectName}
            </p>
            {ask.reason ? <p className="text-xs break-words">{ask.reason}</p> : null}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() =>
                  void answer(
                    () => answerMoreTaskTime({ taskId: ask.taskId, answer: "yes" }),
                    `Yes. It's now due ${dayLabel(ask.day)}.`
                  )
                }
              >
                Yes
              </Button>
              <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => setSaying(ask)}>
                No
              </Button>
            </div>
          </li>
        )}
      </Rows>
      <ReasonDialog
        open={Boolean(saying)}
        title="Keep the date?"
        description={saying ? `${saying.askedByName} is told no, and "${saying.title}" stays due as it is.` : ""}
        label="Why not (optional)"
        confirmLabel="Say no"
        optional
        busy={busy}
        onClose={() => setSaying(null)}
        onConfirm={async (reason) => {
          if (!saying) return false
          const ok = await answer(
            () => answerMoreTaskTime({ taskId: saying.taskId, answer: "no", reason: reason.trim() || null }),
            "No. The date stays."
          )
          if (ok) setSaying(null)
          return ok
        }}
      />
    </PanelCard>
  )
}

function AttentionCard({ teams }: { teams: Cards["attention"] }) {
  const navigate = useNavigate()
  if (teams.length === 0) return <PanelCard storageId="project-admin-attention" title="Needs attention" meta="None" empty />
  // A count opens that team on its Needs attention tab, as the Teams dashboard's numbers do.
  const openAttention = (teamId: string) => {
    try {
      window.localStorage.setItem(TEAM_RIGHT_TAB_KEY, "attention")
    } catch {
      // Without storage the team opens on the tab it last had.
    }
    void navigate({ to: "/teams/$teamId", params: { teamId } })
  }
  return (
    <PanelCard storageId="project-admin-attention" title="Needs attention" meta={teams.length}>
      <Rows items={teams}>
        {(team) => (
          <li key={team.teamId} className="grid gap-1 rounded-md px-2 py-1.5">
            <span className="truncate text-sm">{team.teamName}</span>
            <span className="flex flex-wrap gap-1">
              {(
                [
                  ["Stuck", team.stuck],
                  ["Overdue", team.overdue],
                  ["Untouched", team.untouched],
                ] as const
              )
                .filter(([, n]) => n > 0)
                .map(([label, n]) => (
                  <Button key={label} type="button" variant="outline" size="sm" onClick={() => openAttention(team.teamId)}>
                    {n} {label}
                  </Button>
                ))}
            </span>
          </li>
        )}
      </Rows>
    </PanelCard>
  )
}

function UnassignedCard({ tasks, onOpenTask }: { tasks: Cards["unassigned"]; onOpenTask: (taskId: string) => void }) {
  const router = useRouter()
  const [run, busy] = useAsyncAction(getProjectErrorMessage)
  if (tasks.length === 0) return <PanelCard storageId="project-admin-unassigned" title="No one on it" meta="None" empty />
  return (
    <PanelCard storageId="project-admin-unassigned" title="No one on it" meta={tasks.length}>
      <Rows items={tasks}>
        {(task) => (
          <li key={task.taskId} className="grid gap-1.5">
            <RowButton
              title={task.title}
              line={[task.projectName, task.dueDate ? dayLabel(task.dueDate) : null].filter(Boolean).join(" · ")}
              onClick={() => onOpenTask(task.taskId)}
            />
            <div className="px-2 pb-1">
              <Select
                value=""
                disabled={busy}
                onValueChange={(assigneeUserId) => {
                  const name = task.people.find((person) => person.userId === assigneeUserId)?.name ?? "them"
                  void run(
                    () => assignProjectTask({ taskId: task.taskId, assigneeUserId }),
                    `Handed to ${name}.`
                  ).then((ok) => (ok ? router.invalidate() : undefined))
                }}
              >
                <SelectTrigger aria-label={`Hand "${task.title}" to`} className="w-full">
                  <SelectValue placeholder="Hand to" />
                </SelectTrigger>
                <SelectContent>
                  {task.people.map((person) => (
                    <SelectItem key={person.userId} value={person.userId}>
                      {person.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </li>
        )}
      </Rows>
    </PanelCard>
  )
}

function InvitesCard({ invites }: { invites: Cards["invites"] }) {
  const [run, busy] = useAsyncAction(getProjectErrorMessage)
  if (invites.length === 0) return <PanelCard storageId="project-admin-invites" title="Invites not taken" meta="None" empty />
  return (
    <PanelCard storageId="project-admin-invites" title="Invites not taken" meta={invites.length}>
      <Rows items={invites}>
        {(invite) => (
          <li key={invite.userId} className="flex items-center gap-2 rounded-md px-2 py-1.5">
            <span className="grid min-w-0 flex-1 gap-0.5">
              <span className="truncate text-sm">{invite.name}</span>
              <span className="truncate text-xs text-muted-foreground">
                {invite.email} · {invite.teamName}
              </span>
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const sent = await resendTeamInvite(invite.userId, invite.teamId)
                  // With email off on this server, the link went to the server's log.
                  toast.success(sent.emailed ? `Sent again to ${invite.email}.` : "Made a new link. Email is off here, so it's in the server log.")
                })
              }
            >
              Resend
            </Button>
          </li>
        )}
      </Rows>
    </PanelCard>
  )
}

function MeetingsCard({ meetings, zone }: { meetings: Cards["meetings"]; zone: string }) {
  if (meetings.length === 0) return <PanelCard storageId="project-admin-meetings" title="Meetings today" meta="None" empty />
  return (
    <PanelCard storageId="project-admin-meetings" title="Meetings today" meta={meetings.length}>
      <Rows items={meetings}>
        {(meeting) => {
          const day = localNow(new Date(meeting.startsAt), zone).day
          return (
            <li key={`${meeting.meetingId}-${meeting.startsAt}`}>
              <Link
                to="/teams/$teamId"
                params={{ teamId: meeting.teamId }}
                search={{ month: day.slice(0, 7), day }}
                className={cn(ROW_CLASS, focusRingInset)}
              >
                <span className="flex min-w-0 items-center gap-2 text-sm">
                  <ProjectDot color={meeting.color} />
                  <span className="truncate">{meeting.title}</span>
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {clockIn(meeting.startsAt, zone)} to {clockIn(meeting.endsAt, zone)} · {meeting.teamName}
                </span>
              </Link>
            </li>
          )
        }}
      </Rows>
    </PanelCard>
  )
}

function TaskListCard({
  storageId,
  title,
  tasks,
  line,
  onOpenTask,
}: {
  storageId: string
  title: string
  tasks: TaskCard[]
  line: (task: TaskCard) => string
  onOpenTask: (taskId: string) => void
}) {
  if (tasks.length === 0) return <PanelCard storageId={storageId} title={title} meta="None" empty />
  return (
    <PanelCard storageId={storageId} title={title} meta={tasks.length}>
      <Rows items={tasks}>
        {(task) => (
          <li key={task.id}>
            <RowButton title={task.title} line={line(task)} onClick={() => onOpenTask(task.id)} />
          </li>
        )}
      </Rows>
    </PanelCard>
  )
}

function LateProjectsCard({ projects }: { projects: Cards["projects"] }) {
  // Late is counted on this browser's clock, as the Projects dashboard counts it.
  const late = projects
    .map((project) => {
      const count = countLate(project.dated)
      return { project, late: count, pace: projectPace(count, project) }
    })
    .filter((row) => row.pace !== "on_track")
    .sort((a, b) => b.late - a.late || a.project.name.localeCompare(b.project.name))
  if (late.length === 0) {
    return <PanelCard storageId="project-admin-late" title="Projects running late" meta="None" empty />
  }
  return (
    <PanelCard storageId="project-admin-late" title="Projects running late" meta={late.length}>
      <Rows items={late}>
        {({ project, late: count, pace }) => (
          <li key={project.id}>
            <Link
              to="/projects/$projectId"
              params={{ projectId: project.id }}
              className={cn(ROW_CLASS, focusRingInset)}
            >
              <span className="flex min-w-0 items-center gap-2 text-sm">
                <ProjectDot color={project.color} />
                <span className="truncate">{project.name}</span>
              </span>
              <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                <span className="truncate">{project.team.name} ·</span>
                <ProjectPaceMark pace={pace} late={count} />
              </span>
            </Link>
          </li>
        )}
      </Rows>
    </PanelCard>
  )
}

function MilestonesCard({ milestones }: { milestones: Cards["milestones"] }) {
  if (milestones.length === 0) {
    return <PanelCard storageId="project-admin-milestones" title="Milestones this month" meta="None" empty />
  }
  return (
    <PanelCard storageId="project-admin-milestones" title="Milestones this month" meta={milestones.length}>
      <Rows items={milestones}>
        {(milestone) => (
          <li key={milestone.id}>
            <Link
              to="/projects/$projectId"
              params={{ projectId: milestone.projectId }}
              className={cn(ROW_CLASS, focusRingInset)}
            >
              <span className="truncate text-sm">{milestone.name}</span>
              <span className="truncate text-xs text-muted-foreground">
                {milestone.projectName} · {dayLabel(milestone.dueDate)} ·{" "}
                {milestone.openTasks ? `${milestone.openTasks} ${plural(milestone.openTasks, "task")} left` : "All done"}
              </span>
            </Link>
          </li>
        )}
      </Rows>
    </PanelCard>
  )
}

function DoneTodayCard({ people, onOpenTask }: { people: Cards["doneToday"]; onOpenTask: (taskId: string) => void }) {
  if (people.length === 0) return <PanelCard storageId="project-admin-done" title="Done today" meta="None" empty />
  const total = people.reduce((sum, person) => sum + person.tasks.length, 0)
  return (
    <PanelCard storageId="project-admin-done" title="Done today" meta={total}>
      <Rows items={people}>
        {(person) => (
          <li key={person.userId ?? "nobody"}>
            <Collapsible className="group/person">
              <CollapsibleTrigger asChild>
                <button type="button" className={cn(ROW_CLASS, "flex items-center gap-2", focusRingInset)}>
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {person.name}
                    <span className="text-muted-foreground"> · {person.tasks.length}</span>
                  </span>
                  <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=closed]/person:-rotate-90" />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <ul className="grid gap-0.5 pl-3">
                  {person.tasks.map((task) => (
                    <li key={task.taskId}>
                      <RowButton title={task.title} line={task.projectName} onClick={() => onOpenTask(task.taskId)} />
                    </li>
                  ))}
                </ul>
              </CollapsibleContent>
            </Collapsible>
          </li>
        )}
      </Rows>
    </PanelCard>
  )
}
