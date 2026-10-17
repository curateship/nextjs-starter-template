import * as React from "react"

import { ClientFilterSelect } from "@/components/project/client-filter-select"
import { PersonAvatar } from "@/components/project/task-bits"
import { TeamSideCard } from "@/components/project/team-side-card"
import { ErrorRow } from "@/components/ui/error-row"
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

/**
 * Each kind's card, in the order and words Tyler drew on 16 Oct 2026
 * (`workspace/docs/assets/pasted-image-1792198368279821000.png`). Stuck reads
 * "Blocked", as on the calendar. `after` is the short "how long" at a row's
 * end; overdue's is red.
 */
const ATTENTION_GROUPS: {
  kind: AttentionKind
  label: string
  dot: string
  chip: string
  after: (days: number) => string
}[] = [
  {
    kind: "overdue",
    label: "Overdue",
    dot: "bg-red-600",
    chip: "bg-red-500/10 text-red-600 dark:text-red-400",
    after: (days) => plural(days, "day"),
  },
  {
    kind: "stuck",
    label: "Blocked",
    dot: "bg-amber-700 dark:bg-amber-500",
    chip: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    after: (days) => (days ? `Stuck ${plural(days, "day")}` : "Stuck today"),
  },
  {
    kind: "not_accepted",
    label: "Handed over, not accepted",
    dot: "bg-blue-600",
    chip: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    after: (days) => plural(days, "work day"),
  },
  {
    kind: "review_waiting",
    label: "Waiting for review",
    dot: "bg-sky-700 dark:bg-sky-500",
    chip: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
    after: (days) => plural(days, "work day"),
  },
  {
    kind: "picked_many",
    label: "Picked on 3+ days",
    dot: "bg-violet-600",
    chip: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    after: (days) => plural(days, "day"),
  },
]

function plural(count: number, one: string) {
  return `${count} ${one}${count === 1 ? "" : "s"}`
}

/**
 * Every task that needs help, for the site admin: a card per kind with its
 * count, each task a row with whose it is and how long, which opens it. Stuck
 * counts from the day it's marked, not accepted and waiting for review after
 * a work day, picked on 3+ days and not Done, and overdue. The numbers for
 * the morning are in the bell; this gives the names.
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
  if (rows.length === 0) {
    return (
      <TeamSideCard>
        <p className="text-sm text-muted-foreground">
          Nothing needs attention: no task is stuck, unanswered, waiting for review, dragging or overdue.
        </p>
      </TeamSideCard>
    )
  }
  return (
    <>
      {ATTENTION_GROUPS.map((group) => {
        const mine = rows.filter((row) => row.kind === group.kind)
        if (mine.length === 0) return null
        return (
          <section
            key={group.kind}
            aria-label={`${group.label}, ${mine.length}`}
            className="min-w-0 overflow-hidden rounded-lg border bg-muted/40"
          >
            <div className="flex items-center gap-3 border-b px-4 py-3">
              <span aria-hidden className={cn("size-2 shrink-0 rounded-full", group.dot)} />
              <h3 className="min-w-0 flex-1 truncate text-[15px] font-semibold">{group.label}</h3>
              <span className={cn("shrink-0 rounded-full px-2 text-xs font-medium tabular-nums", group.chip)}>
                {mine.length}
              </span>
            </div>
            <ul className="divide-y">
              {mine.map((row) => (
                <AttentionLine
                  key={`${row.kind}-${row.taskId}`}
                  row={row}
                  after={group.after(row.days)}
                  late={group.kind === "overdue"}
                  onOpen={() => onOpenTask(row.taskId)}
                />
              ))}
            </ul>
          </section>
        )
      })}
    </>
  )
}

/** The task's title, then whose it is ("Ben → Sam" for a review) and how long; opens the task. */
function AttentionLine({
  row,
  after,
  late,
  onOpen,
}: {
  row: AttentionRow
  after: string
  late: boolean
  onOpen: () => void
}) {
  const who = row.reviewerName
    ? `${row.personName ?? "Nobody"} → ${row.reviewerName}`
    : (row.personName ?? "Nobody")
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${row.title}, ${who}, ${row.howLong}`}
        className="grid w-full gap-0.5 px-4 py-3 text-left hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
      >
        <span className="text-sm break-words">{row.title}</span>
        <span className="flex min-w-0 items-baseline justify-between gap-3 text-xs">
          <span className="min-w-0 truncate text-muted-foreground">{who}</span>
          <span className={cn("shrink-0 tabular-nums", late ? "text-red-600 dark:text-red-400" : "text-muted-foreground")}>
            {after}
          </span>
        </span>
      </button>
    </li>
  )
}

/** Each figure's word under it, and what a screen reader hears ("2 due this week"). */
const BUCKETS: { bucket: WorkloadBucket; label: string; spoken: string }[] = [
  { bucket: "open", label: "Open", spoken: "open" },
  { bucket: "doing", label: "Doing", spoken: "doing" },
  { bucket: "stuck", label: "Stuck", spoken: "stuck" },
  { bucket: "overdue", label: "Overdue", spoken: "overdue" },
  { bucket: "week", label: "This week", spoken: "due this week" },
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
  // As Tyler drew it on 16 Oct 2026 (`workspace/docs/assets/pasted-image-1792198613454502000.png`).
  return (
    <section aria-label="Workload" className="min-w-0 overflow-hidden rounded-lg border bg-muted/40">
      <div className="flex min-w-0 items-center justify-between gap-3 border-b px-4 py-3">
        <h3 className="shrink-0 text-[15px] font-semibold">Workload</h3>
        {clients.length || client ? (
          <ClientFilterSelect
            id="workload-client"
            aria-label="Client"
            value={client}
            clients={clients}
            onChange={onClient}
            className="w-fit min-w-0 bg-background"
          />
        ) : null}
      </div>
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
    </section>
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
      <div className="flex min-w-0 items-center gap-3">
        <PersonAvatar name={row.person.name} avatarUrl={row.person.avatarUrl} size="default" />
        <div className="grid min-w-0">
          <span className="truncate text-sm font-medium">{row.person.name}</span>
          {row.person.title ? (
            <span className="truncate text-xs text-muted-foreground">{row.person.title}</span>
          ) : null}
        </div>
      </div>
      {/* Five figures in one white strip; pressing one lists those tasks under it. */}
      <div className="grid grid-cols-5 overflow-hidden rounded-lg border bg-background">
        {BUCKETS.map(({ bucket, label, spoken }) => {
          const count = row.counts[bucket]
          const bad = count > 0 && (bucket === "stuck" || bucket === "overdue")
          return (
            <button
              key={bucket}
              type="button"
              aria-pressed={openBucket === bucket}
              aria-label={`${row.person.name}: ${count} ${spoken}`}
              onClick={() => onBucket(bucket)}
              className={cn(
                "grid min-w-0 content-start justify-items-center gap-0.5 px-0 py-1.5 hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset",
                openBucket === bucket && "bg-accent"
              )}
            >
              <span
                className={cn(
                  "text-base font-semibold tabular-nums",
                  bad ? "text-red-600 dark:text-red-400" : count === 0 ? "text-muted-foreground/50" : "text-foreground"
                )}
              >
                {count}
              </span>
              <span className="max-w-full text-center text-[11px] leading-tight text-muted-foreground">{label}</span>
            </button>
          )
        })}
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
