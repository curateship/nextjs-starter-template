import * as React from "react"

import { PersonAvatar } from "@/components/project/task-bits"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ErrorRow } from "@/components/ui/error-row"
import { LoadingRow } from "@/components/ui/loading-row"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  loadAttention,
  loadTeamWorkload,
  type AttentionKind,
  type AttentionRow,
  type WorkloadBucket,
  type WorkloadRow,
} from "@/lib/api/project/team-running"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { cn } from "@/lib/utils"

type Loaded<T> = { state: "loading" } | { state: "error"; message: string } | { state: "ready"; value: T }

/**
 * Loads when the tab opens, with a retry on failure, and again whenever
 * `reload` changes, such as a task window closing. The old rows stay on
 * screen until the new ones arrive.
 */
function useLoaded<T>(load: () => Promise<T>, reload: unknown) {
  const [loaded, setLoaded] = React.useState<Loaded<T>>({ state: "loading" })
  const [tries, setTries] = React.useState(0)
  React.useEffect(() => {
    let live = true
    load().then(
      (value) => live && setLoaded({ state: "ready", value }),
      (error: unknown) => live && setLoaded({ state: "error", message: getProjectErrorMessage(error) })
    )
    return () => {
      live = false
    }
  }, [load, tries, reload])
  return { loaded, retry: () => setTries((n) => n + 1) }
}

const ATTENTION_GROUPS: { kind: AttentionKind; label: string }[] = [
  { kind: "stuck", label: "Stuck" },
  { kind: "not_accepted", label: "Handed over, not accepted" },
  { kind: "picked_many", label: "Picked on 3 days or more" },
  { kind: "overdue", label: "Overdue" },
]

/**
 * Every task that needs help, for the owner and admins: Stuck (from the day it's marked),
 * not accepted after a work day, picked on 3+ days and not Done, and overdue.
 * The numbers for the morning are in the bell; this gives the names.
 */
export function AttentionPanel({
  reload,
  onOpenTask,
}: {
  reload: unknown
  onOpenTask: (taskId: string) => void
}) {
  const { loaded, retry } = useLoaded(loadAttention, reload)
  if (loaded.state === "loading") return <LoadingRow label="Loading what needs attention…" />
  if (loaded.state === "error") return <ErrorRow message={loaded.message} onRetry={retry} />
  const rows = loaded.value
  return (
    <ScrollArea className="min-h-0 flex-1" viewportClassName="h-full">
      <h2 className="px-5 pt-4 text-sm font-medium">
        Needs attention{rows.length ? ` · ${rows.length}` : ""}
      </h2>
      {rows.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">
          Nothing needs attention: no task is stuck, unanswered, dragging or overdue.
        </p>
      ) : (
        <div className="grid gap-4 p-3">
          {ATTENTION_GROUPS.map((group) => {
            const mine = rows.filter((row) => row.kind === group.kind)
            if (mine.length === 0) return null
            return (
              <section key={group.kind} className="grid gap-1" aria-label={group.label}>
                <h3 className="px-2 text-xs font-medium text-muted-foreground">
                  {group.label} · {mine.length}
                </h3>
                <ul className="grid gap-1">
                  {mine.map((row) => (
                    <AttentionLine key={`${row.kind}-${row.taskId}`} row={row} onOpen={() => onOpenTask(row.taskId)} />
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
      )}
    </ScrollArea>
  )
}

function AttentionLine({ row, onOpen }: { row: AttentionRow; onOpen: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="grid w-full gap-0.5 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <span className="font-medium break-words">{row.title}</span>
        <span className="text-xs text-muted-foreground">
          {row.personName ?? "Nobody"} · {row.projectName} ·{" "}
          <span className={cn(row.kind === "stuck" || row.kind === "overdue" ? "text-destructive" : undefined)}>
            {row.howLong}
          </span>
        </span>
      </button>
    </li>
  )
}

const BUCKETS: { bucket: WorkloadBucket; label: string }[] = [
  { bucket: "open", label: "Open" },
  { bucket: "doing", label: "Doing" },
  { bucket: "stuck", label: "Stuck" },
  { bucket: "overdue", label: "Overdue" },
  { bucket: "week", label: "Due this week" },
]

/**
 * Each person's open work across every project I can see, to see who has
 * room before handing out more. Clicking a number lists those tasks.
 */
export function WorkloadPanel({
  reload,
  onOpenTask,
}: {
  reload: unknown
  onOpenTask: (taskId: string) => void
}) {
  const { loaded, retry } = useLoaded(loadTeamWorkload, reload)
  const [open, setOpen] = React.useState<{ person: string; bucket: WorkloadBucket } | null>(null)
  if (loaded.state === "loading") return <LoadingRow label="Loading the workload…" />
  if (loaded.state === "error") return <ErrorRow message={loaded.message} onRetry={retry} />
  return (
    <ScrollArea className="min-h-0 flex-1" viewportClassName="h-full">
      <ul className="divide-y">
        {loaded.value.map((row) => (
          <WorkloadLine
            key={row.person.id}
            row={row}
            openBucket={open?.person === row.person.id ? open.bucket : null}
            onBucket={(bucket) =>
              setOpen((current) =>
                current?.person === row.person.id && current.bucket === bucket
                  ? null
                  : { person: row.person.id, bucket }
              )
            }
            onOpenTask={onOpenTask}
          />
        ))}
      </ul>
    </ScrollArea>
  )
}

function WorkloadLine({
  row,
  openBucket,
  onBucket,
  onOpenTask,
}: {
  row: WorkloadRow
  openBucket: WorkloadBucket | null
  onBucket: (bucket: WorkloadBucket) => void
  onOpenTask: (taskId: string) => void
}) {
  const listed = openBucket ? row.tasks[openBucket] : []
  return (
    <li className="grid gap-3 px-4 py-3">
      <div className="flex items-center gap-3">
        <PersonAvatar name={row.person.name} avatarUrl={row.person.avatarUrl} />
        <div className="grid min-w-0">
          <span className="truncate text-sm font-medium">{row.person.name}</span>
          {row.person.title ? (
            <span className="truncate text-xs text-muted-foreground">{row.person.title}</span>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {BUCKETS.map(({ bucket, label }) => (
          <Button
            key={bucket}
            type="button"
            variant={openBucket === bucket ? "secondary" : "outline"}
            size="sm"
            aria-pressed={openBucket === bucket}
            aria-label={`${row.person.name}: ${row.counts[bucket]} ${label.toLowerCase()}`}
            onClick={() => onBucket(bucket)}
          >
            {label}
            <Badge
              variant={row.counts[bucket] && (bucket === "stuck" || bucket === "overdue") ? "destructive" : "secondary"}
              className="ml-0.5"
            >
              {row.counts[bucket]}
            </Badge>
          </Button>
        ))}
      </div>
      {openBucket ? (
        listed.length === 0 ? (
          <p className="text-xs text-muted-foreground">None.</p>
        ) : (
          <ul className="grid gap-1">
            {listed.map((task) => (
              <li key={task.id}>
                <button
                  type="button"
                  onClick={() => onOpenTask(task.id)}
                  className="grid w-full rounded-md px-2 py-1 text-left text-sm hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <span className="break-words">{task.title}</span>
                  <span className="text-xs text-muted-foreground">{task.projectName}</span>
                </button>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </li>
  )
}
