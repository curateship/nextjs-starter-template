import * as React from "react"

import { ClientFilterSelect } from "@/components/project/client-filter-select"
import { PersonAvatar } from "@/components/project/task-bits"
import { TileHeading } from "@/components/project/notes/project-block-card"
import { TeamSideCard } from "@/components/project/team-side-card"
import { SideRows } from "@/components/shared/notes/side-rows"
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
import { useTeamId } from "@/lib/project/team-scope"

type Loaded<T> = { state: "loading" } | { state: "error"; message: string } | { state: "ready"; value: T }

/**
 * Loads when its block shows, with a retry on failure, and again whenever
 * `reload` changes, such as another task opening on the right. The old rows stay on
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
 * What needs attention, for the Attention block on the team's page, whose
 * heading carries the count. Only the site admin loads it; for anyone else
 * it is an empty list.
 */
export function useAttention(enabled: boolean, reload: unknown) {
  const teamId = useTeamId()
  const load = React.useCallback(() => (enabled ? loadAttention(teamId) : loadNothing()), [enabled, teamId])
  return useLoaded(load, reload)
}
const loadNothing = async (): Promise<AttentionRow[]> => []

/**
 * Each kind's card, in the order and words Tyler drew on 16 Oct 2026
 * (`workspace/docs/assets/pasted-image-1792198368279821000.png`). Stuck reads
 * "Blocked", as on the calendar. `after` is the short "how long" in a row's
 * pill.
 */
const ATTENTION_GROUPS: {
  kind: AttentionKind
  label: string
  dot: string
  after: (days: number) => string
}[] = [
  {
    kind: "overdue",
    label: "Overdue",
    dot: "bg-red-600",
    after: (days) => plural(days, "day"),
  },
  {
    kind: "stuck",
    label: "Blocked",
    dot: "bg-amber-700 dark:bg-amber-500",
    after: (days) => (days ? `Stuck ${plural(days, "day")}` : "Stuck today"),
  },
  {
    kind: "not_accepted",
    label: "Handed over, not accepted",
    dot: "bg-blue-600",
    after: (days) => plural(days, "work day"),
  },
  {
    kind: "review_waiting",
    label: "Waiting for review",
    dot: "bg-sky-700 dark:bg-sky-500",
    after: (days) => plural(days, "work day"),
  },
  {
    kind: "picked_many",
    label: "Picked on 3+ days",
    dot: "bg-violet-600",
    after: (days) => plural(days, "day"),
  },
  {
    kind: "untouched",
    label: "Untouched",
    dot: "bg-slate-500",
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
 * a work day, picked on 3+ days and not Done, overdue, and untouched for 14
 * days (Seven features, part 6). The numbers for
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
          Nothing needs attention: no task is stuck, unanswered, waiting for review, dragging, overdue or forgotten.
        </p>
      </TeamSideCard>
    )
  }
  // One white tile, a grey heading per kind, then its tasks as the shell's
  // one-line rows (task "Shell look/three-panel-shell-look", 9 Nov 2026).
  return (
    <>
      {ATTENTION_GROUPS.map((group) => {
        const mine = rows.filter((row) => row.kind === group.kind)
        if (mine.length === 0) return null
        return (
          <section key={group.kind} aria-label={`${group.label}, ${mine.length}`} className="grid min-w-0 border-t first:border-t-0">
            <TileHeading count={mine.length}>
              <span className="flex min-w-0 items-center gap-2">
                <span aria-hidden className={cn("size-2 shrink-0 rounded-full", group.dot)} />
                <span className="truncate">{group.label}</span>
              </span>
            </TileHeading>
            <SideRows
              empty=""
              rows={mine.map((row) => ({
                key: `${row.kind}-${row.taskId}`,
                name: row.title,
                line: row.reviewerName
                  ? `${row.personName ?? "Nobody"} → ${row.reviewerName}`
                  : (row.personName ?? "Nobody"),
                value: group.after(row.days),
                onPress: () => onOpenTask(row.taskId),
              }))}
            />
          </section>
        )
      })}
    </>
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
  const teamId = useTeamId()
  const load = React.useCallback(() => loadTeamWorkload(client, teamId), [client, teamId])
  const { loaded, retry } = useLoaded(load, reload)
  const [open, setOpen] = React.useState<{ person: string; bucket: WorkloadBucket } | null>(null)
  if (loaded.state === "loading") return <LoadingRow label="Loading the workload…" />
  if (loaded.state === "error") return <ErrorRow message={loaded.message} onRetry={retry} />
  // With nobody on the team there is no one to count, rather than an empty box.
  if (loaded.value.length === 0 && !client) {
    return (
      <TeamSideCard>
        <p className="text-sm text-muted-foreground">Nobody on the team yet, so there's no work to weigh.</p>
      </TeamSideCard>
    )
  }
  // As Tyler drew it on 16 Oct 2026 (`workspace/docs/assets/pasted-image-1792198613454502000.png`).
  return (
    // The Workload block's white tile, which the block carries (Tyler, 7 Nov 2026).
    <section aria-label="Workload" className="min-w-0">
      {clients.length || client ? (
        <div className="flex min-w-0 items-center justify-end gap-3 border-b px-3 py-2">
          <ClientFilterSelect
            id="workload-client"
            aria-label="Client"
            value={client}
            clients={clients}
            onChange={onClient}
            className="w-fit min-w-0"
          />
        </div>
      ) : null}
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
        <div className="grid min-w-0 flex-1">
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
