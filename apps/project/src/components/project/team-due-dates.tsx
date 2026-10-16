import { Link } from "@tanstack/react-router"
import { BriefcaseIcon, FlagIcon, ListTodoIcon } from "lucide-react"

import { StatusBadge } from "@/components/project/task-bits"
import { TeamSideCard } from "@/components/project/team-side-card"
import type { TeamDeadline, TeamDueTask } from "@/lib/api/project/checkins"
import { plural } from "@/lib/format/plural"
import { PROJECT_COLOR_DOT } from "@/lib/project/rules"
import { cn } from "@/lib/utils"

/** Due tasks named in one calendar square before "+4 more". */
const NAMED_PER_DAY = 2
/** Milestones and projects named in one square before "+1 more". */
const DEADLINES_PER_DAY = 1

/**
 * A month square's due tasks: the first two by name with their project's
 * colour, then "+4 more". A phone's square has room for "3 due" only. The
 * square is a button, so nothing in it opens a task: the list under the
 * calendar does.
 */
export function DueChips({ tasks }: { tasks: readonly TeamDueTask[] }) {
  if (tasks.length === 0) return null
  const hidden = tasks.length - NAMED_PER_DAY
  return (
    <>
      <span className="flex max-w-full items-center gap-0.5 rounded border px-1 py-0.5 text-muted-foreground sm:hidden">
        <ListTodoIcon className="size-3 shrink-0" aria-hidden />
        {tasks.length}
      </span>
      {tasks.slice(0, NAMED_PER_DAY).map((task) => (
        <span
          key={task.id}
          className="flex w-full min-w-0 items-center gap-1 rounded border px-1.5 py-0.5 max-sm:hidden"
        >
          <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", PROJECT_COLOR_DOT[task.projectColor])} />
          <span className="truncate">{task.title}</span>
        </span>
      ))}
      {hidden > 0 ? <span className="px-1.5 text-muted-foreground max-sm:hidden">+{hidden} more</span> : null}
    </>
  )
}

/**
 * A month square's milestones and projects due that day, drawn apart from
 * the tasks: a filled chip with a flag (a milestone) or a case (a whole
 * project). A phone's square has room for the flag and a count only.
 */
export function DeadlineChips({ deadlines }: { deadlines: readonly TeamDeadline[] }) {
  if (deadlines.length === 0) return null
  const hidden = deadlines.length - DEADLINES_PER_DAY
  return (
    <>
      <span className="flex max-w-full items-center gap-0.5 rounded bg-muted px-1 py-0.5 text-muted-foreground sm:hidden">
        <FlagIcon className="size-3 shrink-0" aria-hidden />
        {deadlines.length}
      </span>
      {deadlines.slice(0, DEADLINES_PER_DAY).map((deadline) => (
        <span
          key={`${deadline.kind}-${deadline.id}`}
          className="flex w-full min-w-0 items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-medium max-sm:hidden"
        >
          <DeadlineIcon kind={deadline.kind} />
          <span className="truncate">{deadline.name}</span>
        </span>
      ))}
      {hidden > 0 ? <span className="px-1.5 text-muted-foreground max-sm:hidden">+{hidden} more</span> : null}
    </>
  )
}

function DeadlineIcon({ kind, className }: { kind: TeamDeadline["kind"]; className?: string }) {
  const Icon = kind === "milestone" ? FlagIcon : BriefcaseIcon
  return <Icon className={cn("size-3 shrink-0 text-muted-foreground", className)} aria-hidden />
}

/**
 * While "Due dates" is on: the chosen day's milestones and projects due,
 * each opening its project, then its due tasks, each opening its task
 * window, as a card in the right panel under its meetings.
 */
export function DayDueTasks({
  tasks,
  deadlines,
  onOpenTask,
}: {
  tasks: readonly TeamDueTask[]
  deadlines: readonly TeamDeadline[]
  onOpenTask: (taskId: string) => void
}) {
  return (
    <TeamSideCard
      title="Due this day"
      aside={tasks.length ? `${tasks.length} ${plural(tasks.length, "task")}` : null}
    >
      {deadlines.length ? (
        <ul className="grid gap-2">
          {deadlines.map((deadline) => (
            <li key={`${deadline.kind}-${deadline.id}`}>
              <Link
                to="/projects/$projectId"
                params={{ projectId: deadline.projectId }}
                className="flex w-full min-w-0 items-center gap-3 rounded-lg border bg-background p-3 text-left hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <span aria-hidden className={cn("h-9 w-1 shrink-0 rounded-full", PROJECT_COLOR_DOT[deadline.projectColor])} />
                <span className="grid min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-1.5 font-medium">
                    <DeadlineIcon kind={deadline.kind} className="size-3.5" />
                    <span className="truncate">{deadline.name}</span>
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {deadline.kind === "milestone" ? `Milestone · ${deadline.projectName}` : "The whole project is due"}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      {tasks.length ? (
        <ul className="grid gap-2">
          {tasks.map((task) => (
            <li key={task.id}>
              <button
                type="button"
                onClick={() => onOpenTask(task.id)}
                className="flex w-full min-w-0 items-center gap-3 rounded-lg border bg-background p-3 text-left hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <span aria-hidden className={cn("h-9 w-1 shrink-0 rounded-full", PROJECT_COLOR_DOT[task.projectColor])} />
                <span className="grid min-w-0 flex-1">
                  <span className="truncate font-medium">{task.title}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {task.projectName} · {task.assigneeName ?? "Nobody assigned"}
                  </span>
                </span>
                <StatusBadge status={task.status} />
              </button>
            </li>
          ))}
        </ul>
      ) : deadlines.length ? null : (
        <p className="text-sm text-muted-foreground">Nothing due.</p>
      )}
    </TeamSideCard>
  )
}
