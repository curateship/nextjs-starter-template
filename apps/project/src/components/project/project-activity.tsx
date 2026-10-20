import * as React from "react"

import { Button } from "@/components/ui/button"
import { ErrorRow } from "@/components/ui/error-row"
import { LoadingRow } from "@/components/ui/loading-row"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ProjectDot } from "@/components/project/task-bits"
import { loadTeamActivityPage } from "@/lib/api/project/finding"
import {
  loadActivity,
  type ActivityEntry,
  type ProjectActivity as ProjectActivityPage,
} from "@/lib/api/project/projects"
import { formatDateTime, formatTimeAgo } from "@/lib/format/format-time"
import { dayLabel } from "@/lib/project/days"
import { readDueMove } from "@/lib/project/due-moves"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { isTaskStatus, PROJECT_HEALTH_LABEL, TASK_STATUS_LABEL } from "@/lib/project/rules"
import { useTeamId } from "@/lib/project/team-scope"

/**
 * The project's Activity tab: who changed what, newest first, 50 at a time.
 * Each line opens its task, unless the task is in the bin. A change to the
 * project's own status has no task to open.
 */
export function ProjectActivity({
  projectId,
  onOpenTask,
}: {
  projectId: string
  onOpenTask: (taskId: string) => void
}) {
  const load = React.useCallback(
    (before?: { at: string; id: string }) => loadActivity(projectId, before),
    [projectId]
  )
  return <ActivityFeed load={load} onOpenTask={onOpenTask} />
}

/**
 * The Team dashboard's Activity tab: the same lines across every project the
 * viewer can see, each naming its project. "Just me" tasks and the bin never
 * show. A line opens its task as a window over the dashboard.
 */
export function TeamActivity({ onOpenTask }: { onOpenTask: (taskId: string) => void }) {
  const teamId = useTeamId()
  const load = React.useCallback(
    (before?: { at: string; id: string }) => loadTeamActivityPage(before, teamId),
    [teamId]
  )
  return <ActivityFeed load={load} onOpenTask={onOpenTask} showProject />
}

function ActivityFeed({
  load,
  onOpenTask,
  showProject = false,
}: {
  load: (before?: { at: string; id: string }) => Promise<ProjectActivityPage>
  onOpenTask: (taskId: string) => void
  /** Name each line's project, for a feed across several. */
  showProject?: boolean
}) {
  const [entries, setEntries] = React.useState<ActivityEntry[]>([])
  const [more, setMore] = React.useState(false)
  const [state, setState] = React.useState<"loading" | "ready" | "error">("loading")
  const [error, setError] = React.useState("")
  const [older, setOlder] = React.useState<{ at: string; id: string } | undefined>()
  const [tries, setTries] = React.useState(0)

  React.useEffect(() => {
    let live = true
    load(older).then(
      (page) => {
        if (!live) return
        setEntries((current) => (older ? [...current, ...page.entries] : page.entries))
        setMore(page.more)
        setState("ready")
      },
      (failure: unknown) => {
        if (!live) return
        setError(getProjectErrorMessage(failure))
        setState("error")
      }
    )
    return () => {
      live = false
    }
  }, [load, older, tries])

  if (state === "error" && entries.length === 0) {
    return <ErrorRow message={error} onRetry={() => setTries((n) => n + 1)} />
  }
  if (state === "loading" && entries.length === 0) return <LoadingRow label="Loading the activity…" />

  // A task made from a step already shows as "made", beside the step's line.
  const shown = entries.filter((entry) => entry.kind !== "from_step")
  return (
    <ScrollArea className="min-h-0 flex-1" viewportClassName="h-full">
      {shown.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">
          Nothing yet. Tasks made, moved between statuses, handed over, commented on, put in the bin
          or brought back, and the project's status changing, show here as they happen.
        </p>
      ) : (
        <ol className="grid gap-1 p-3">
          {shown.map((entry) => (
            <li key={entry.id} className="grid gap-0.5 rounded-lg px-2 py-1.5 text-sm hover:bg-muted/50 sm:grid-cols-[1fr_auto] sm:gap-3">
              <span className="min-w-0 break-words">
                <Line entry={entry} onOpenTask={onOpenTask} showProject={showProject} />
              </span>
              <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground sm:justify-end">
                {showProject ? (
                  <>
                    <ProjectDot color={entry.project.color} className="size-2" />
                    <span className="truncate">{entry.project.name}</span>
                    <span aria-hidden>·</span>
                  </>
                ) : null}
                <time dateTime={entry.at} title={formatDateTime(entry.at)} className="shrink-0">
                  {formatTimeAgo(entry.at)}
                </time>
              </span>
            </li>
          ))}
        </ol>
      )}
      {more && state === "error" ? (
        <ErrorRow
          message={error}
          className="py-4"
          onRetry={() => {
            setState("loading")
            setTries((n) => n + 1)
          }}
        />
      ) : more ? (
        <div className="px-5 pb-4">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={state === "loading"}
            onClick={() => {
              setState("loading")
              const last = entries[entries.length - 1]
              setOlder(last ? { at: last.at, id: last.id } : undefined)
            }}
          >
            Show older
          </Button>
        </div>
      ) : null}
    </ScrollArea>
  )
}

function Line({
  entry,
  onOpenTask,
  showProject,
}: {
  entry: ActivityEntry
  onOpenTask: (taskId: string) => void
  showProject: boolean
}) {
  if (entry.kind === "health_set") {
    const who = <span className="text-muted-foreground">{entry.actorName}</span>
    return entry.health ? (
      <>
        {who} set the project's status to {PROJECT_HEALTH_LABEL[entry.health]}
        {entry.note ? `: ${entry.note}` : ""}
      </>
    ) : (
      <>{who} took the project's status off</>
    )
  }
  const task = entry.task.inBin ? (
    <span className="font-medium">{entry.task.title}</span>
  ) : (
    <button
      type="button"
      className="font-medium underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none"
      onClick={() => onOpenTask(entry.task.id)}
    >
      {entry.task.title}
    </button>
  )
  const who = <span className="text-muted-foreground">{entry.actorName}</span>
  switch (entry.kind) {
    case "created":
      return <>{who} made {task}</>
    case "status_changed":
      return isTaskStatus(entry.reason) ? (
        <>
          {who} marked {task} {TASK_STATUS_LABEL[entry.reason]}
        </>
      ) : (
        <>
          {who} changed the status of {task}
        </>
      )
    case "handed_over":
      return (
        <>
          {who} handed {task} to {entry.targetName ?? "someone who has left"}
          {entry.reason ? `: ${entry.reason}` : ""}
        </>
      )
    case "accepted":
      return <>{who} accepted {task}</>
    case "handed_back":
      return (
        <>
          {who} handed {task} back{entry.targetName ? ` to ${entry.targetName}` : ""}: {entry.reason}
        </>
      )
    case "commented":
      return <>{who} commented on {task}</>
    case "deleted":
      return <>{who} put {task} in the bin</>
    case "restored":
      return <>{who} brought {task} back from the bin</>
    case "became_task":
      return <>{who} made the step "{entry.reason}" in {task} its own task</>
    case "moved":
      // Across projects "here" would be unclear; the line names its project already.
      return (
        <>
          {who} moved {task} {showProject ? "" : "here "}from {entry.fromProjectName ?? "another project"}
        </>
      )
    case "review_confirmed":
      return <>{who} confirmed the review of {task}</>
    case "due_moved": {
      const move = readDueMove(entry.reason)
      return (
        <>
          {who} moved the due date of {task}
          {move ? ` from ${dayLabel(move.from)} to ${dayLabel(move.to)}` : ""}
        </>
      )
    }
    case "sent_back":
      return (
        <>
          {who} sent {task} back{entry.targetName ? ` to ${entry.targetName}` : ""}: {entry.reason}
        </>
      )
    default:
      return <>{who} changed {task}</>
  }
}
