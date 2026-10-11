import * as React from "react"

import { Button } from "@/components/ui/button"
import { ErrorRow } from "@/components/ui/error-row"
import { LoadingRow } from "@/components/ui/loading-row"
import { ScrollArea } from "@/components/ui/scroll-area"
import { loadActivity, type ActivityEntry } from "@/lib/api/project/projects"
import { formatDateTime } from "@/lib/format/format-time"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { isTaskStatus, TASK_STATUS_LABEL } from "@/lib/project/rules"

/**
 * The project's Activity tab: who changed what, newest first, 50 at a time.
 * Each line opens its task, unless the task is in the bin.
 */
export function ProjectActivity({
  projectId,
  onOpenTask,
}: {
  projectId: string
  onOpenTask: (taskId: string) => void
}) {
  const [entries, setEntries] = React.useState<ActivityEntry[]>([])
  const [more, setMore] = React.useState(false)
  const [state, setState] = React.useState<"loading" | "ready" | "error">("loading")
  const [error, setError] = React.useState("")
  const [older, setOlder] = React.useState<{ at: string; id: string } | undefined>()
  const [tries, setTries] = React.useState(0)

  React.useEffect(() => {
    let live = true
    loadActivity(projectId, older).then(
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
  }, [projectId, older, tries])

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
          Nothing yet. Tasks made, moved between statuses, handed over, commented on, deleted or
          brought back show here as they happen.
        </p>
      ) : (
        <ol className="grid gap-1 p-3">
          {shown.map((entry) => (
            <li key={entry.id} className="grid gap-0.5 rounded-lg px-2 py-1.5 text-sm hover:bg-muted/50 sm:grid-cols-[1fr_auto] sm:gap-3">
              <span className="min-w-0 break-words">
                <Line entry={entry} onOpenTask={onOpenTask} />
              </span>
              <span className="text-xs text-muted-foreground sm:text-right">{formatDateTime(entry.at)}</span>
            </li>
          ))}
        </ol>
      )}
      {more ? (
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

function Line({ entry, onOpenTask }: { entry: ActivityEntry; onOpenTask: (taskId: string) => void }) {
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
      return (
        <>
          {who} marked {task} {isTaskStatus(entry.reason) ? TASK_STATUS_LABEL[entry.reason] : "changed"}
        </>
      )
    case "handed_over":
      return <>{who} handed {task} to {entry.targetName ?? "someone who has left"}</>
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
      return <>{who} deleted {task}</>
    case "restored":
      return <>{who} brought back {task}</>
    case "became_task":
      return <>{who} made the step "{entry.reason}" in {task} its own task</>
    case "moved":
      return <>{who} moved {task} here from {entry.fromProjectName ?? "another project"}</>
    default:
      return <>{who} changed {task}</>
  }
}
