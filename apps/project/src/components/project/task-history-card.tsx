import { Link } from "@tanstack/react-router"

import { StatusBadge } from "@/components/project/task-bits"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { TaskDetail } from "@/lib/api/project/tasks"
import { dayLabel, shortDayLabel, shortDayTimeLabel } from "@/lib/project/days"
import { readDueMove } from "@/lib/project/due-moves"
import { clockTotal, readClockFix, readClockPause } from "@/lib/project/clock"
import { isTaskStatus } from "@/lib/project/rules"

type Entry = TaskDetail["history"][number]

/**
 * The task's whole life on one line, oldest first: every day someone picked
 * it with its status when their day ended, every drop with its reason, and
 * every hand-over. Read from rows saved as things happened.
 */
export function TaskHistoryCard({ detail }: { detail: TaskDetail }) {
  const { history } = detail
  const days = detail.task.pickedDays
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>
          History{days ? ` · picked on ${days} ${days === 1 ? "day" : "days"}` : ""}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nobody has picked this task on a check-in yet, and it hasn't changed hands.
          </p>
        ) : (
          <ol className="grid gap-3">
            {history.map((entry, index) => (
              <li key={index} className="grid gap-1 text-sm sm:grid-cols-[8.5rem_1fr] sm:gap-3">
                <span className="text-muted-foreground">{whenOf(entry)}</span>
                <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <EntryText entry={entry} />
                </span>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}

function whenOf(entry: Entry) {
  return "day" in entry ? shortDayLabel(entry.day) : shortDayTimeLabel(entry.at)
}

function EntryText({ entry }: { entry: Entry }) {
  switch (entry.kind) {
    case "picked":
      return (
        <>
          <span>
            {entry.personName} {entry.carriedOver ? "carried it over" : "picked it"}
          </span>
          {entry.endStatus ? (
            <>
              <span className="text-muted-foreground">· ended the day</span>
              <StatusBadge status={entry.endStatus} />
            </>
          ) : entry.liveStatus ? (
            <>
              <span className="text-muted-foreground">· today, so far</span>
              <StatusBadge status={entry.liveStatus} />
            </>
          ) : null}
        </>
      )
    case "dropped":
      return (
        <span className="break-words">
          {entry.personName} dropped it: {entry.reason}
        </span>
      )
    case "handed_over":
      return (
        <span className="break-words">
          {entry.actorName} handed it to {entry.targetName ?? "someone who has left"}
          {/* The hand-over's note, kept after the task is accepted. */}
          {entry.reason ? `: ${entry.reason}` : ""}
        </span>
      )
    case "accepted":
      return <span>{entry.actorName} accepted it</span>
    case "handed_back":
      return (
        <span className="break-words">
          {entry.actorName} handed it back
          {entry.targetName ? ` to ${entry.targetName}` : ""}: {entry.reason}
        </span>
      )
    case "became_task":
      return (
        <span className="break-words">
          {entry.actorName} made the step "{entry.reason}" its own task
          {entry.relatedTask ? (
            <>
              : <RelatedTaskLink task={entry.relatedTask} />
            </>
          ) : null}
        </span>
      )
    case "from_step":
      return (
        <span className="break-words">
          {entry.actorName} made this from a step in{" "}
          {entry.relatedTask ? <RelatedTaskLink task={entry.relatedTask} /> : "another task"}
        </span>
      )
    case "moved":
      return (
        <span className="break-words">
          {entry.actorName} moved it here from {entry.fromProjectName ?? "another project"}
        </span>
      )
    case "created":
      return <span>{entry.actorName} made it</span>
    case "status_changed":
      return isTaskStatus(entry.reason) ? (
        <>
          <span>{entry.actorName} marked it</span>
          <StatusBadge status={entry.reason} />
        </>
      ) : (
        <span>{entry.actorName} changed its status</span>
      )
    case "deleted":
      return <span>{entry.actorName} put it in the bin</span>
    case "restored":
      return <span>{entry.actorName} brought it back from the bin</span>
    case "review_confirmed":
      return <span>{entry.actorName} confirmed the review</span>
    case "sent_back":
      return (
        <span className="break-words">
          {entry.actorName} sent it back
          {entry.targetName ? ` to ${entry.targetName}` : ""}: {entry.reason}
        </span>
      )
    case "due_moved": {
      const move = readDueMove(entry.reason)
      return (
        <span>
          {entry.actorName} moved the due date
          {move ? ` from ${dayLabel(move.from)} to ${dayLabel(move.to)}` : ""}
        </span>
      )
    }
    case "took":
      return <span>{entry.actorName} took it</span>
    case "clock_started":
      return <span>{entry.actorName} started the clock</span>
    case "clock_paused": {
      const pause = readClockPause(entry.reason)
      if (pause?.midnight) return <span>The clock paused itself at midnight after {clockTotal(pause.seconds)}</span>
      return (
        <span>
          {entry.actorName} paused the clock{pause ? ` after ${clockTotal(pause.seconds)}` : ""}
        </span>
      )
    }
    case "clock_fixed": {
      const fix = readClockFix(entry.reason)
      return (
        <span>
          {entry.actorName} changed the time
          {fix ? ` from ${clockTotal(fix.from)} to ${clockTotal(fix.to)}` : ""}
        </span>
      )
    }
    case "commented":
      return null
  }
}

/** The other task a history line points at, opened in its own project. */
function RelatedTaskLink({ task }: { task: { id: string; projectId: string; title: string } }) {
  return (
    <Link
      to="/projects/$projectId"
      params={{ projectId: task.projectId }}
      search={{ task: task.id }}
      className="font-medium underline-offset-4 hover:underline"
    >
      {task.title}
    </Link>
  )
}
