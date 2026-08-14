import * as React from "react"
import { Link } from "@tanstack/react-router"
import {
  CheckIcon,
  ChevronDown,
  HistoryIcon,
  Loader2Icon,
  Trash2Icon,
  UserCheckIcon,
  XIcon,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { ErrorBanner } from "@/components/ui/error-banner"
import { EmptyRow } from "@/components/shared/feed-card"
import {
  WorkspacePanelTab,
  WorkspacePanelTabsHeader,
} from "@/components/shared/workspace-panel-header"
import { LoadingRow } from "@/components/ui/loading-row"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent } from "@/components/ui/tabs"
import {
  decideApproval,
  deleteAutomationRun,
  getAutomationRun,
  getAutomationRunErrorMessage,
  listRunsForAutomation,
  listWaitingRuns,
  type AutomationRunDetailItem,
  type AutomationRunItem,
  type AutomationRunStepItem,
  type AutomationRunsPanelData,
} from "@/lib/api/automations/automation-runs"
import { automationNodeRunResult } from "@/lib/automations/node-registry"
import {
  automationRunStatusLabel,
  automationRunStepStatusLabels,
} from "@/lib/automations/run"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { plural } from "@/lib/format/plural"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { focusRingInset } from "@/lib/layout/focus-ring"
import { formatDateTime, formatRelativeTime } from "@/lib/format/format-time"
import { cn } from "@/lib/utils"
import { AutomationDeliveryHistory } from "@/components/automations/automation-delivery-history"

type PanelTab = "runs" | "waiting"

/**
 * The editor's bottom panel: what this flow has done, and what is waiting on
 * you across all of them.
 *
 * Two tabs because there are two questions, and only one of them is about the
 * flow on screen. A bell notice lands here with its run already open — no
 * separate page, and the flow that produced the decision is right there behind
 * the panel.
 */
export function AutomationRunsPanel({
  automationId,
  initial,
  openRunId,
}: {
  automationId: string
  initial: AutomationRunsPanelData
  /** The run a link asked for, opened once when the panel mounts. */
  openRunId?: string
}) {
  const [tab, setTab] = React.useState<PanelTab>(
    // A link to a run of another flow belongs in Waiting, where it actually is.
    //
    // Judged by whether the run IS in the waiting list, not by whether it is
    // missing from this flow's first page. Pressing Run opens the panel at the
    // brand-new run, and a run created a moment ago is in neither list yet —
    // so "not in Runs" sent every single Run press to Waiting on you, which is
    // the one tab it certainly is not in.
    openRunId && initial.waiting.some((run) => run.id === openRunId)
      ? "waiting"
      : "runs"
  )
  const [runs, setRuns] = React.useState(initial.runs)
  const [total, setTotal] = React.useState(initial.total)
  const [waiting, setWaiting] = React.useState(initial.waiting)
  const [waitingTotal, setWaitingTotal] = React.useState(initial.waiting_total)
  const [expandedId, setExpandedId] = React.useState<string | null>(
    // The newest run open on arrival, unless a link asked for another. The
    // panel exists to answer "what did that just do", and the answer is almost
    // always the run at the top.
    openRunId ?? initial.runs[0]?.id ?? null
  )
  const [loadingMore, setLoadingMore] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<AutomationRunItem | null>(
    null
  )
  const [runDelete, deleting] = useAsyncAction(getAutomationRunErrorMessage)

  const refresh = React.useCallback(async () => {
    setError(null)
    try {
      const [flow, queue] = await Promise.all([
        listRunsForAutomation(automationId, 0),
        listWaitingRuns(),
      ])
      setRuns(flow.runs)
      setTotal(flow.total)
      setWaiting(queue.runs)
      setWaitingTotal(queue.total)
    } catch (refreshError) {
      setError(getAutomationRunErrorMessage(refreshError))
    }
  }, [automationId])

  // A run the address asks for that the list has never heard of.
  //
  // Pressing Run adds `?run=<id>` without the route's loader running again, so
  // the panel is still holding the list from before the run existed — it opened
  // on a run it could not draw, and showed nothing at all. One read puts the
  // new run at the top where it belongs.
  //
  // Once per run id, and no more. A read always hands back a fresh list, so
  // "still not there, read again" is a loop that never ends — and a link to a
  // run of another flow is never in this flow's list, so it would hammer the
  // server for as long as the page stayed open.
  const chased = React.useRef<string | null>(null)
  React.useEffect(() => {
    if (!openRunId) return
    if (runs.some((run) => run.id === openRunId)) return
    if (chased.current === openRunId) return
    chased.current = openRunId
    void refresh()
  }, [openRunId, runs, refresh])

  async function loadMore() {
    if (loadingMore) return
    setLoadingMore(true)
    try {
      const next = await listRunsForAutomation(automationId, runs.length)
      setRuns((current) => [...current, ...next.runs])
      setTotal(next.total)
      setError(null)
    } catch (loadError) {
      setError(getAutomationRunErrorMessage(loadError))
    } finally {
      setLoadingMore(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget || deleting) return
    await runDelete(async () => {
      await deleteAutomationRun(deleteTarget.id)
      setDeleteTarget(null)
      await refresh()
    }, "Run deleted.")
  }

  return (
    <>
      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as PanelTab)}
        className="h-full min-h-0 flex-1 gap-0 overflow-hidden bg-card"
      >
        <WorkspacePanelTabsHeader>
          <WorkspacePanelTab
            value="runs"
            icon={<HistoryIcon className="size-4" />}
            label="Runs"
            count={total}
          />
          <WorkspacePanelTab
            value="waiting"
            icon={<UserCheckIcon className="size-4" />}
            label="Waiting on you"
            count={waitingTotal}
          />
        </WorkspacePanelTabsHeader>

        <TabsContent value="runs" className="min-h-0 flex-1">
          <ScrollArea className="h-full">
            <div className="grid gap-2 p-4 sm:p-5">
              {error ? (
                <ErrorBanner message={error} onRetry={() => void refresh()} />
              ) : null}
              {runs.length === 0 ? (
                <EmptyRow>
                  This flow has not run yet. Press Run above the canvas to try
                  it.
                </EmptyRow>
              ) : (
                runs.map((run) => (
                  <RunRow
                    key={run.id}
                    run={run}
                    expanded={expandedId === run.id}
                    onToggle={() =>
                      setExpandedId((current) =>
                        current === run.id ? null : run.id
                      )
                    }
                    onChanged={() => void refresh()}
                    onDelete={() => setDeleteTarget(run)}
                  />
                ))
              )}
              {runs.length < total ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="justify-self-start"
                  disabled={loadingMore}
                  onClick={() => void loadMore()}
                >
                  {loadingMore ? (
                    <Loader2Icon className="size-3.5 animate-spin" />
                  ) : null}
                  Load more ({total - runs.length} older)
                </Button>
              ) : null}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="waiting" className="min-h-0 flex-1">
          <ScrollArea className="h-full">
            <div className="grid gap-2 p-4 sm:p-5">
              {error ? (
                <ErrorBanner message={error} onRetry={() => void refresh()} />
              ) : null}
              {waiting.length === 0 ? (
                <EmptyRow>
                  Nothing is waiting on you. Runs that stop at an approval
                  checkpoint appear here, from every flow you own.
                </EmptyRow>
              ) : (
                waiting.map((run) => (
                  <RunRow
                    key={run.id}
                    run={run}
                    // Across flows, so each row says which flow it belongs to.
                    showFlow
                    expanded={expandedId === run.id}
                    onToggle={() =>
                      setExpandedId((current) =>
                        current === run.id ? null : run.id
                      )
                    }
                    onChanged={() => void refresh()}
                  />
                ))
              )}
              {waitingTotal > waiting.length ? (
                <p className="text-xs text-muted-foreground">
                  Showing the {waiting.length} closest to their deadline, of{" "}
                  {waitingTotal} waiting.
                </p>
              ) : null}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title="Delete this run?"
        description="The record of what it did goes with it. This cannot be undone."
        confirmLabel="Delete run"
        loading={deleting}
        onConfirm={() => void confirmDelete()}
      />
    </>
  )
}

/** How often an unfinished run is re-read while it is open. */
const STILL_GOING_MS = 3_000

/** Statuses that never change again. Anything else is still moving. */
const finalStatuses = new Set([
  "completed",
  "failed",
  "rejected",
  "canceled",
])

/**
 * One run: a line you can click open. Shut, it is the status and when. Open, it
 * loads its own steps — and, when it is waiting on somebody, the sentence the
 * checkpoint was given and the two buttons.
 */
function RunRow({
  run,
  showFlow,
  expanded,
  onToggle,
  onChanged,
  onDelete,
}: {
  run: AutomationRunItem
  showFlow?: boolean
  expanded: boolean
  onToggle: () => void
  onChanged: () => void
  /** Absent in the Waiting tab: a run still waiting cannot be deleted. */
  onDelete?: () => void
}) {
  const [detail, setDetail] = React.useState<AutomationRunDetailItem | null>(
    null
  )
  const [detailError, setDetailError] = React.useState<string | null>(null)
  const [deciding, setDeciding] = React.useState(false)

  const load = React.useCallback(async () => {
    setDetailError(null)
    try {
      setDetail(await getAutomationRun(run.id))
    } catch (error) {
      setDetail(null)
      setDetailError(getAutomationRunErrorMessage(error))
    }
  }, [run.id])

  /**
   * The run as freshly as this row knows it.
   *
   * Open, the row re-reads itself every few seconds and the list behind it does
   * not, so the row's own reading is the newer one — a run that finishes while
   * it is open still reads "Running" in the list, so the badge said the wrong
   * thing and the poll below, judged on that, never stopped.
   *
   * Shut, the row stops reading and its last answer freezes, so the list is the
   * newer one again.
   */
  const current = expanded && detail ? detail : run

  React.useEffect(() => {
    if (!expanded) return
    void load()
  }, [expanded, load])

  // A run that has not finished is still growing steps. Read once and it stays
  // as it was the instant it was opened — press Run and the row opens on a run
  // with no steps at all, then never draws the ones that arrive a second later.
  // A finished run never changes again, so this stops.
  React.useEffect(() => {
    if (!expanded) return
    if (finalStatuses.has(current.status)) return
    const timer = window.setInterval(() => void load(), STILL_GOING_MS)
    return () => window.clearInterval(timer)
  }, [expanded, load, current.status])

  async function decide(decision: "approved" | "rejected") {
    if (deciding) return
    setDeciding(true)
    dismissErrorToast()
    try {
      await decideApproval(run.id, decision)
      toast.success(
        decision === "approved"
          ? "Approved. The run carried on from there."
          : "Rejected. Nothing after that step ran."
      )
      onChanged()
      await load()
    } catch (error) {
      showErrorToast(getAutomationRunErrorMessage(error))
      // It very likely moved without us — the deadline, or another tab — so
      // show what it says now rather than leaving stale buttons on screen.
      onChanged()
      await load()
    } finally {
      setDeciding(false)
    }
  }

  const waiting = current.status === "waiting_approval"
  const finished = !waiting && current.status !== "active"
  const latestDeliveryStepIds = latestSendEmailStepIds(detail?.steps ?? [])

  return (
    <div className="min-w-0 rounded-lg border border-foreground/10 bg-muted/20">
      <div className="flex min-w-0 items-center gap-2 pr-2">
        <button
          type="button"
          aria-expanded={expanded}
          onClick={onToggle}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-2 rounded-lg px-3 py-2 text-left",
            focusRingInset
          )}
        >
          <ChevronDown
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground transition-transform",
              !expanded && "-rotate-90"
            )}
          />
          {current.is_test ? (
            <Badge variant="outline" className="shrink-0">
              TEST
            </Badge>
          ) : null}
          <Badge
            variant={
              waiting
                ? "default"
                : current.status === "failed"
                  ? "destructive"
                  : "secondary"
            }
            className="shrink-0"
          >
            {automationRunStatusLabel(current.status, current.approval_decision)}
          </Badge>
          {showFlow ? (
            <span className="min-w-0 truncate text-xs font-medium" title={run.automation_name}>
              {run.automation_name}
            </span>
          ) : null}
          {/* Who it is about, which is the first thing anybody wants from a
              run that started by itself. Absent on a run somebody pressed Run
              for, which is about nobody in particular. */}
          {run.subject_label ? (
            <span
              className="min-w-0 truncate text-xs text-muted-foreground"
              title={run.subject_label}
            >
              {run.subject_label}
            </span>
          ) : null}
          <span className="shrink-0 text-xs text-muted-foreground">
            {run.step_count} {plural(run.step_count, "step", "steps")}
          </span>
          <span
            className="ml-auto shrink-0 text-xs text-muted-foreground"
            title={formatDateTime(run.started_at)}
          >
            {formatRelativeTime(run.started_at, formatDateTime)}
          </span>
        </button>
        {onDelete && finished ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Delete the run from ${formatDateTime(run.started_at)}`}
            onClick={onDelete}
          >
            <Trash2Icon className="size-3.5" />
          </Button>
        ) : null}
      </div>

      {expanded ? (
        <div className="grid min-w-0 gap-3 border-t border-foreground/10 p-3">
          {detailError ? (
            <ErrorBanner message={detailError} onRetry={() => void load()} />
          ) : !detail ? (
            <LoadingRow label="Loading…" />
          ) : (
            <>
              {detail.status === "waiting_approval" ? (
                <ApprovalBlock
                  detail={detail}
                  deciding={deciding}
                  onDecide={(decision) => void decide(decision)}
                />
              ) : null}

              {showFlow ? (
                <Link
                  to="/admin/automations/$automationId"
                  params={{ automationId: detail.automation_id }}
                  search={{ run: detail.id }}
                  className="justify-self-start text-xs underline underline-offset-2 hover:text-foreground"
                >
                  Open {detail.automation_name}
                </Link>
              ) : null}

              {detail.is_test && detail.subject_label ? (
                <p className="text-xs text-muted-foreground">
                  Tested as {detail.subject_label}. Emails were redirected to
                  the admin who started the test, and outside changes were
                  skipped.
                </p>
              ) : detail.trigger_name ? (
                <p className="text-xs text-muted-foreground">
                  Started by {detail.trigger_name}
                  {detail.subject_label ? `, for ${detail.subject_label}` : ""}.
                </p>
              ) : null}

              {detail.steps.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  The first step has not finished yet.
                </p>
              ) : (
                <div className="grid min-w-0 gap-2">
                  {detail.steps.map((step) => (
                    <div key={step.id} className="grid min-w-0 gap-0.5 text-xs">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{step.step_name}</span>
                        <Badge
                          variant={
                            step.status === "completed" ? "secondary" : "destructive"
                          }
                        >
                          {automationRunStepStatusLabels[step.status]}
                        </Badge>
                        <span
                          className="ml-auto text-muted-foreground"
                          title={formatDateTime(step.finished_at)}
                        >
                          {formatRelativeTime(step.finished_at, formatDateTime)}
                        </span>
                      </div>
                      <p className="text-muted-foreground">{step.summary}</p>
                      {step.error ? (
                        <p className="text-destructive">{step.error}</p>
                      ) : null}
                      {latestDeliveryStepIds.has(step.id) ? (
                        <AutomationDeliveryHistory
                          runId={detail.id}
                          nodeId={step.node_id}
                        />
                      ) : null}
                      <StepRunResult runId={detail.id} step={step} />
                    </div>
                  ))}
                </div>
              )}

              {detail.status === "failed" && detail.error ? (
                <p className="text-xs text-destructive">{detail.error}</p>
              ) : null}
              {detail.approval_decided_at ? (
                <p className="text-xs text-muted-foreground">
                  {detail.approval_decision === "timed_out"
                    ? `Nobody answered, so it timed out on ${formatDateTime(detail.approval_decided_at)}.`
                    : `Decided by ${detail.approval_decided_by_name ?? "somebody"} on ${formatDateTime(detail.approval_decided_at)}.`}
                </p>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}

/** A retried Send Email step shares one delivery set across every attempt. */
function latestSendEmailStepIds(
  steps: AutomationRunStepItem[]
): Set<string> {
  const latestByNode = new Map<string, string>()
  for (const step of steps) {
    if (step.kind === "sendEmail") latestByNode.set(step.node_id, step.id)
  }
  return new Set(latestByNode.values())
}

/** The node's own result UI, kept inside the shell's status and error frame. */
function StepRunResult({
  runId,
  step,
}: {
  runId: string
  step: AutomationRunStepItem
}) {
  if (step.output === null) return null
  const result = automationNodeRunResult(step.kind)
  if (!result) return null

  return (
    <div className="pt-2">
      <React.Suspense fallback={null}>
        {React.createElement(result, {
          runId,
          stepId: step.id,
          nodeId: step.node_id,
          output: step.output,
        })}
      </React.Suspense>
    </div>
  )
}

/**
 * The decision. The sentence is the checkpoint's own, written on the node in
 * the editor and repeated here word for word — it is the only thing telling
 * somebody what the button they are about to press actually does.
 */
function ApprovalBlock({
  detail,
  deciding,
  onDecide,
}: {
  detail: AutomationRunDetailItem
  deciding: boolean
  onDecide: (decision: "approved" | "rejected") => void
}) {
  return (
    <div className="grid gap-2 rounded-lg border border-foreground/10 bg-background p-3">
      <p className="text-xs">
        <span className="font-medium">If you approve: </span>
        {detail.approval_summary?.trim() ||
          "the flow carries on from this step."}
      </p>
      <p className="text-xs text-muted-foreground">
        If you reject, the run stops here and nothing after this step happens.
        {detail.approval_deadline_at
          ? ` Left alone it rejects itself on ${formatDateTime(detail.approval_deadline_at)}.`
          : ""}
      </p>
      <div className="flex flex-wrap gap-2 pt-1">
        <Button
          type="button"
          size="sm"
          disabled={deciding}
          onClick={() => onDecide("approved")}
        >
          {deciding ? (
            <Loader2Icon className="size-3.5 animate-spin" />
          ) : (
            <CheckIcon className="size-3.5" />
          )}
          Approve
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={deciding}
          onClick={() => onDecide("rejected")}
        >
          <XIcon className="size-3.5" />
          Reject
        </Button>
      </div>
    </div>
  )
}
