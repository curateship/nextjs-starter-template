import { StatusBadge } from "@/components/project/task-bits"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { TaskDetail } from "@/lib/api/project/tasks"
import { formatDateTime } from "@/lib/format/format-time"
import { shortDayLabel } from "@/lib/project/days"

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
  return "day" in entry ? shortDayLabel(entry.day) : formatDateTime(entry.at)
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
        <span>
          {entry.actorName} handed it to {entry.targetName ?? "someone who has left"}
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
  }
}
