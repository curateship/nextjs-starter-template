import * as React from "react"
import { ChevronDown } from "lucide-react"

import { RunDetailBody } from "@/components/automations/run-record"
import { Badge } from "@/components/ui/badge"
import { LoadMoreButton } from "@/components/shared/load-more-button"
import { ErrorRow } from "@/components/ui/error-row"
import { EmptyRow } from "@/components/shared/feed-card"
import { LoadingRow } from "@/components/ui/loading-row"
import {
  getAutomationRun,
  getAutomationRunErrorMessage,
  listRunsForAutomation,
  type AutomationRunDetailItem,
  type AutomationRunItem,
} from "@/lib/api/automations/automation-runs"
import { automationRunStatusLabel, finalAutomationRunStatuses } from "@/lib/automations/run"
import { plural } from "@/lib/format/plural"
import { focusRingInset } from "@/lib/layout/focus-ring"
import { formatDateTime, formatRelativeTime } from "@/lib/format/format-time"
import { cn } from "@/lib/utils"

/** How often an unfinished run is read again while it is open. */
const STILL_GOING_MS = 3_000

/**
 * One flow's runs as a short list of rows that open in place, for the Runs
 * tab of an automation email's ⋮ (`send-email-editor.tsx`), where there is no
 * room for a table and a right panel. Everywhere else a run is a row of the
 * Automations dashboard's runs table, opened on the right (`run-record.tsx`).
 */
export function AutomationRunsPanel({
  automationId,
  active = true,
}: {
  automationId: string
  /** False while it is out of sight, which stops the reads. */
  active?: boolean
}) {
  const [runs, setRuns] = React.useState<AutomationRunItem[] | null>(null)
  const [total, setTotal] = React.useState(0)
  const [error, setError] = React.useState<string | null>(null)
  const [expandedId, setExpandedId] = React.useState<string | null>(null)
  const [loadingMore, setLoadingMore] = React.useState(false)

  const read = React.useCallback(async () => {
    try {
      const page = await listRunsForAutomation(automationId, 0)
      setRuns(page.runs)
      setTotal(page.total)
      setError(null)
      // The newest open on arrival: the panel answers "what did that just do".
      setExpandedId((current) => current ?? page.runs[0]?.id ?? null)
    } catch (readError) {
      setError(getAutomationRunErrorMessage(readError))
    }
  }, [automationId])

  React.useEffect(() => {
    void read()
  }, [read])

  async function loadMore() {
    if (loadingMore || !runs) return
    setLoadingMore(true)
    try {
      const next = await listRunsForAutomation(automationId, runs.length)
      setRuns((current) => {
        const seen = new Set((current ?? []).map((run) => run.id))
        return [...(current ?? []), ...next.runs.filter((run) => !seen.has(run.id))]
      })
      setTotal(next.total)
    } catch (loadError) {
      setError(getAutomationRunErrorMessage(loadError))
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <div className="grid gap-2 p-3">
      {error ? <ErrorRow message={error} onRetry={() => void read()} /> : null}
      {!runs && !error ? <LoadingRow label="Reading the runs…" /> : null}
      {runs && runs.length === 0 ? <EmptyRow>This flow has not run yet.</EmptyRow> : null}
      {runs?.map((run) => (
        <RunRow
          key={run.id}
          run={run}
          expanded={expandedId === run.id}
          active={active}
          onToggle={() => setExpandedId((current) => (current === run.id ? null : run.id))}
        />
      ))}
      {runs && runs.length < total ? (
        <LoadMoreButton className="justify-self-start" loading={loadingMore} onClick={() => void loadMore()} />
      ) : null}
    </div>
  )
}

/** One run: shut, its status and when; open, what it did, read again while it runs. */
function RunRow({
  run,
  expanded,
  active,
  onToggle,
}: {
  run: AutomationRunItem
  expanded: boolean
  active: boolean
  onToggle: () => void
}) {
  const [detail, setDetail] = React.useState<AutomationRunDetailItem | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const load = React.useCallback(async () => {
    try {
      setDetail(await getAutomationRun(run.id))
      setError(null)
    } catch (readError) {
      setError(getAutomationRunErrorMessage(readError))
    }
  }, [run.id])

  // Open, the row's own reading is the newer one.
  const current = expanded && detail ? detail : run
  React.useEffect(() => {
    if (expanded && active) void load()
  }, [expanded, active, load])
  React.useEffect(() => {
    if (!expanded || !active || finalAutomationRunStatuses.has(current.status)) return
    const timer = window.setInterval(() => void load(), STILL_GOING_MS)
    return () => window.clearInterval(timer)
  }, [expanded, active, load, current.status])

  return (
    <div className="min-w-0 rounded-lg border bg-muted/20">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={onToggle}
        className={cn(
          "flex w-full min-w-0 flex-wrap items-center gap-x-2 gap-y-1 rounded-lg px-3 py-2 text-left",
          focusRingInset
        )}
      >
        <ChevronDown
          className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", !expanded && "-rotate-90")}
        />
        {current.is_test ? (
          <Badge variant="outline" className="shrink-0">
            Test
          </Badge>
        ) : null}
        <Badge variant={current.status === "failed" ? "destructive" : "secondary"} className="shrink-0">
          {automationRunStatusLabel(current.status, current.approval_decision)}
        </Badge>
        {run.subject_label ? (
          <span className="min-w-0 truncate text-xs text-muted-foreground">{run.subject_label}</span>
        ) : null}
        <span className="shrink-0 text-xs text-muted-foreground">
          {run.step_count} {plural(run.step_count, "step", "steps")}
        </span>
        <span className="ml-auto shrink-0 text-xs text-muted-foreground">
          {formatRelativeTime(run.started_at, formatDateTime)}
        </span>
      </button>
      {expanded ? (
        <div className="grid min-w-0 gap-3 border-t p-3">
          {error ? <ErrorRow message={error} onRetry={() => void load()} /> : <RunDetailBody detail={detail} active={active} />}
        </div>
      ) : null}
    </div>
  )
}
