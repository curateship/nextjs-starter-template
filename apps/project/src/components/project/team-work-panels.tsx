import * as React from "react"
import { CircleAlertIcon } from "lucide-react"

import { ClientFilterSelect } from "@/components/project/client-filter-select"
import { PersonAvatar } from "@/components/project/task-bits"
import { TeamSideCard } from "@/components/project/team-side-card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ErrorRow } from "@/components/ui/error-row"
import { Label } from "@/components/ui/label"
import { LoadingRow } from "@/components/ui/loading-row"
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

/**
 * What needs attention, loaded with the right panel rather than when its tab
 * opens, so the tab can carry the count (Tyler, 14 Oct 2026). Only the owner
 * and admins load it; for anyone else it is an empty list.
 */
export function useAttention(enabled: boolean, reload: unknown) {
  return useLoaded(enabled ? loadAttention : loadNothing, reload)
}
const loadNothing = async (): Promise<AttentionRow[]> => []

/** Each kind's line, in Tyler's words: Stuck reads "blocked", as on the calendar. */
const ATTENTION_GROUPS: { kind: AttentionKind; label: string; tint: string }[] = [
  { kind: "overdue", label: "overdue", tint: "bg-red-500/10 text-red-600 dark:text-red-400" },
  { kind: "stuck", label: "blocked", tint: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  { kind: "not_accepted", label: "handed over, not accepted", tint: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  { kind: "review_waiting", label: "waiting for review", tint: "bg-sky-500/10 text-sky-600 dark:text-sky-400" },
  { kind: "picked_many", label: "picked on 3 days or more", tint: "bg-violet-500/10 text-violet-600 dark:text-violet-400" },
]

/**
 * Every task that needs help, for the owner and admins, as Tyler drew it on
 * 14 Oct 2026: one card with a line per kind, "1 task overdue" by a tinted
 * mark, and under it each task with how long ("test · was due Oct 12"), which
 * opens it. Stuck counts from the day it's marked, not accepted and waiting
 * for review after a work day, picked on 3+ days and not Done, and overdue. The numbers for the
 * morning are in the bell; this gives the names.
 */
export function AttentionPanel({
  attention,
  onOpenTask,
}: {
  attention: ReturnType<typeof useAttention>
  onOpenTask: (taskId: string) => void
}) {
  const { loaded, retry } = attention
  if (loaded.state === "loading") return <LoadingRow label="Loading what needs attention…" />
  if (loaded.state === "error") return <ErrorRow message={loaded.message} onRetry={retry} />
  const rows = loaded.value
  return (
    <TeamSideCard>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing needs attention: no task is stuck, unanswered, waiting for review, dragging or overdue.
        </p>
      ) : (
        <div className="grid gap-4">
          {ATTENTION_GROUPS.map((group) => {
            const mine = rows.filter((row) => row.kind === group.kind)
            if (mine.length === 0) return null
            const heading = `${mine.length} ${mine.length === 1 ? "task" : "tasks"} ${group.label}`
            return (
              <section key={group.kind} className="flex gap-3" aria-label={heading}>
                <span
                  aria-hidden
                  className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", group.tint)}
                >
                  <CircleAlertIcon className="size-4" />
                </span>
                <div className="grid min-w-0 flex-1 gap-0.5">
                  <h4 className="text-sm font-medium">{heading}</h4>
                  <ul className="grid">
                    {mine.map((row) => (
                      <AttentionLine key={`${row.kind}-${row.taskId}`} row={row} onOpen={() => onOpenTask(row.taskId)} />
                    ))}
                  </ul>
                </div>
              </section>
            )
          })}
        </div>
      )}
    </TeamSideCard>
  )
}

/** "test · Admin · was due Oct 12", opening the task. */
function AttentionLine({ row, onOpen }: { row: AttentionRow; onOpen: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="w-full rounded text-left text-sm break-words text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {row.title} · {row.personName ?? "Nobody"} · {row.howLong}
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
  clients,
  client,
  onClient,
}: {
  reload: unknown
  onOpenTask: (taskId: string) => void
  /** The clients of the projects I can see; with none, there is no Client choice. */
  clients: string[]
  client: string | undefined
  onClient: (client: string | undefined) => void
}) {
  const load = React.useCallback(() => loadTeamWorkload(client), [client])
  const { loaded, retry } = useLoaded(load, reload)
  const [open, setOpen] = React.useState<{ person: string; bucket: WorkloadBucket } | null>(null)
  if (loaded.state === "loading") return <LoadingRow label="Loading the workload…" />
  if (loaded.state === "error") return <ErrorRow message={loaded.message} onRetry={retry} />
  return (
    <TeamSideCard>
      {clients.length || client ? (
        <div className="flex items-center gap-3">
          <Label htmlFor="workload-client" className="shrink-0 font-normal text-muted-foreground">
            Client
          </Label>
          <ClientFilterSelect
            id="workload-client"
            value={client}
            clients={clients}
            onChange={onClient}
            className="sm:w-fit sm:min-w-40"
          />
        </div>
      ) : null}
      <ul className="-mx-4 divide-y">
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
    </TeamSideCard>
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
