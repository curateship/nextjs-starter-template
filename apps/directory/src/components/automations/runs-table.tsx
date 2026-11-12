import { Chip, CrmTable, CrmTableRow, Dot, OpenBar } from "@/components/crm/crm-table"
import { LoadMoreButton } from "@/components/shared/load-more-button"
import type { TableHeaderColumn } from "@/components/shared/sortable-table-header"
import { TableCell } from "@/components/ui/table"
import type { AutomationRunItem } from "@/lib/api/automations/automation-runs"
import { automationRunStatusLabel, type AutomationRunStatus } from "@/lib/automations/run"
import { formatDateTime } from "@/lib/format/format-time"
import { plural } from "@/lib/format/plural"

type Column = "run" | "flow" | "who" | "step" | "deadline" | "steps"

/** A run's dot: blue going, amber waiting on you, green done, red failed, grey stopped. */
const STATUS_DOT: Record<AutomationRunStatus, string> = {
  active: "bg-blue-500",
  waiting_approval: "bg-amber-500",
  completed: "bg-emerald-500",
  failed: "bg-red-500",
  rejected: "bg-muted-foreground/40",
  canceled: "bg-muted-foreground/40",
}

const THIS_YEAR = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
const OTHER_YEAR = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
})

/** "Aug 11, 2:14 PM", with the year only when it is not this one. */
function runTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return (date.getFullYear() === new Date().getFullYear() ? THIS_YEAR : OTHER_YEAR).format(date)
}

/** Who a run was about, in a table cell. */
function runWho(run: AutomationRunItem) {
  return run.subject_label ?? (run.trigger_name ? "Nobody in particular" : "Started by hand")
}

/**
 * The runs as the CRM's one table shape, for the Automations dashboard.
 *
 * Each line starts with when the run started and how it ended, "Aug 11,
 * 2:14 PM · Failed", so two runs of one flow never look alike, even in a
 * narrow middle where the other columns have dropped out (Tyler, 9 Nov 2026,
 * picked "When and how it ended" after "The 2 runs panel is really
 * confusing").
 *
 * - **A flow's Runs tab** (`mode="flow"`): the line, Who, Steps.
 * - **Waiting on you** (`mode="waiting"`): the line, Flow, Who, Step waiting,
 *   Deadline, the closest deadline first.
 *
 * The server keeps the order, so no column sorts.
 */
export function RunsTable({
  mode,
  runs,
  total,
  openId,
  loadingMore,
  onOpen,
  onLoadMore,
  empty,
}: {
  mode: "flow" | "waiting"
  runs: AutomationRunItem[]
  total: number
  openId: string | undefined
  loadingMore: boolean
  onOpen: (runId: string) => void
  onLoadMore: () => void
  /** Drawn in place of the rows when there are none. */
  empty: React.ReactNode
}) {
  const waiting = mode === "waiting"
  const columns: TableHeaderColumn<Column>[] = [
    // No 20rem floor, so the table fits a narrow middle: the line gives way
    // last, cut short with "…".
    { key: "run", label: "Run", sortable: false, column: "main", className: "!min-w-0" },
    ...(waiting
      ? [{ key: "flow" as const, label: "Flow", sortable: false, column: "preview" as const, className: "hidden md:hidden @xl:table-cell" }]
      : []),
    { key: "who", label: "Who", sortable: false, column: "preview", className: "hidden md:hidden @2xl:table-cell" },
    ...(waiting
      ? [
          { key: "step" as const, label: "Step waiting", sortable: false, column: "preview" as const, className: "hidden md:hidden @4xl:table-cell" },
          { key: "deadline" as const, label: "Deadline", sortable: false, column: "meta" as const, className: "hidden md:hidden @md:table-cell" },
        ]
      : [{ key: "steps" as const, label: "Steps", sortable: false, column: "meta" as const, className: "hidden md:hidden @md:table-cell" }]),
  ]

  return (
    <CrmTable<Column>
      columns={columns}
      sort={"run" as Column}
      direction="desc"
      onSort={() => {}}
      select={null}
      actions={false}
      empty={runs.length > 0 ? null : empty}
      after={
        runs.length < total ? (
          <div className="px-4 py-3">
            <LoadMoreButton loading={loadingMore} onClick={onLoadMore} />
          </div>
        ) : null
      }
    >
      {runs.map((run) => {
        const status = automationRunStatusLabel(run.status, run.approval_decision)
        const line = `${runTime(run.started_at)} · ${status}`
        return (
          <CrmTableRow
            key={run.id}
            open={run.id === openId}
            label={`${line}, ${run.automation_name}`}
            tick={null}
            onOpen={() => onOpen(run.id)}
          >
            <TableCell column="main" className="!min-w-0 max-w-0">
              <span className="flex min-w-0 items-center gap-2">
                <OpenBar />
                <Dot className={STATUS_DOT[run.status]} label={status} />
                <span data-row-name="" className="truncate font-medium">
                  {line}
                </span>
                {run.is_test ? <Chip muted>Test</Chip> : null}
              </span>
            </TableCell>
            {waiting ? (
              <TableCell column="preview" className="hidden md:hidden @xl:table-cell">
                <span className="block max-w-56 truncate text-muted-foreground">{run.automation_name}</span>
              </TableCell>
            ) : null}
            <TableCell column="preview" className="hidden md:hidden @2xl:table-cell">
              <span className="block max-w-64 truncate text-muted-foreground">{runWho(run)}</span>
            </TableCell>
            {waiting ? (
              <>
                <TableCell column="preview" className="hidden md:hidden @4xl:table-cell">
                  <span className="block max-w-56 truncate text-muted-foreground">
                    {run.approval_step_name ?? "Approval"}
                  </span>
                </TableCell>
                <TableCell column="mutedMeta" className="hidden md:hidden @md:table-cell">
                  <span className="whitespace-nowrap">
                    {run.approval_deadline_at ? formatDateTime(run.approval_deadline_at) : "None"}
                  </span>
                </TableCell>
              </>
            ) : (
              <TableCell column="mutedMeta" className="hidden md:hidden @md:table-cell">
                <span className="whitespace-nowrap tabular-nums">
                  {run.step_count} {plural(run.step_count, "step", "steps")}
                </span>
              </TableCell>
            )}
          </CrmTableRow>
        )
      })}
    </CrmTable>
  )
}
