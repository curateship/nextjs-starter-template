import * as React from "react"
import {
  CheckIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  CircleDashedIcon,
  CircleSlashIcon,
  HandIcon,
  HistoryIcon,
  Loader2Icon,
  Trash2Icon,
  WorkflowIcon,
  XIcon,
} from "lucide-react"
import { toast } from "sonner"

import { AutomationDeliveryHistory } from "@/components/automations/automation-delivery-history"
import { ActionRow } from "@/components/crm/crm-record-menu"
import { EmptyRecord, FooterState, RecordFrame } from "@/components/crm/record-frame"
import { TabbedMenu } from "@/components/shared/notes/tabbed-menu"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { ErrorRow } from "@/components/ui/error-row"
import { InlineError } from "@/components/ui/inline-error"
import {
  decideApproval,
  deleteAutomationRun,
  getAutomationRun,
  getAutomationRunErrorMessage,
  type AutomationRunDetailItem,
  type AutomationRunItem,
  type AutomationRunStepItem,
} from "@/lib/api/automations/automation-runs"
import { automationNodeRunResult } from "@/lib/automations/node-registry"
import {
  automationRunStatusLabel,
  automationRunStepStatusLabels,
  finalAutomationRunStatuses,
  type AutomationRunStatus,
} from "@/lib/automations/run"
import { formatDateTime, formatRelativeTime } from "@/lib/format/format-time"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

/** How often an unfinished run is read again while it is open. */
const STILL_GOING_MS = 3_000

/** The run's icon, by where it got to. */
function RunStatusIcon({ status }: { status: AutomationRunStatus }) {
  if (status === "waiting_approval") return <HandIcon aria-hidden />
  if (status === "active") return <CircleDashedIcon aria-hidden />
  if (status === "completed") return <CircleCheckIcon aria-hidden />
  if (status === "failed") return <CircleAlertIcon aria-hidden />
  return <CircleSlashIcon aria-hidden />
}

/**
 * One run on the Automations dashboard's right panel, in the CRM's record
 * frame (Tyler, 9 Nov 2026: Runs as "Table + run on the right", Waiting on
 * you as "Table + run, Approve in footer").
 *
 * - **Header:** the run's status icon, the flow's name, who it was about,
 *   then the ⋮: Open the flow, and Delete run under a line once it has
 *   finished. A run still going or waiting cannot be deleted.
 * - **Body:** what Approve does (while waiting), what started it, then each
 *   step in order with what it did, its emails and the app's own result.
 * - **Footer:** the status and when it started, with Reject and Approve while
 *   the run waits on a decision.
 *
 * A run that has not finished is read again every 3 seconds, so its steps
 * draw as they happen; one that has finished never changes, so it stops.
 */
export function RunRecord({
  runId,
  fallback,
  onChanged,
  onDeleted,
  onOpenFlow,
}: {
  runId: string
  /** The list's row, drawn while the run's own read is on its way. */
  fallback: AutomationRunItem | null
  /** The run moved (decided, finished, deleted): the list reads again. */
  onChanged: () => void
  onDeleted: () => void
  /** Opens the run's flow on its canvas; left out where the flow is already open. */
  onOpenFlow?: (automationId: string) => void
}) {
  const [detail, setDetail] = React.useState<AutomationRunDetailItem | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [deciding, setDeciding] = React.useState(false)
  const [menuOpen, setMenuOpen] = React.useState(false)
  const [askDelete, setAskDelete] = React.useState(false)
  const [runDelete, deleting] = useAsyncAction(getAutomationRunErrorMessage)

  const load = React.useCallback(async () => {
    try {
      const next = await getAutomationRun(runId)
      setDetail(next)
      setError(null)
      return next
    } catch (readError) {
      setError(getAutomationRunErrorMessage(readError))
      return null
    }
  }, [runId])

  React.useEffect(() => {
    void load()
  }, [load])

  // A run still going grows steps; read it again until it stops, and tell the
  // list once it does, so its row's status follows.
  const status = detail?.status ?? fallback?.status ?? null
  const changedRef = React.useRef(onChanged)
  React.useEffect(() => {
    changedRef.current = onChanged
  })
  React.useEffect(() => {
    if (!status || finalAutomationRunStatuses.has(status) || status === "waiting_approval") return
    const timer = window.setInterval(() => {
      void load().then((next) => {
        if (next && next.status !== status) changedRef.current()
      })
    }, STILL_GOING_MS)
    return () => window.clearInterval(timer)
  }, [load, status])

  async function decide(decision: "approved" | "rejected") {
    if (deciding) return
    setDeciding(true)
    dismissErrorToast()
    try {
      await decideApproval(runId, decision)
      toast.success(
        decision === "approved" ? "Approved. The run carried on from there." : "Rejected. Nothing after that step ran."
      )
    } catch (decideError) {
      // It very likely moved without us (the deadline, or another tab), so
      // the run is read again either way rather than leaving stale buttons.
      showErrorToast(getAutomationRunErrorMessage(decideError))
    } finally {
      await load()
      setDeciding(false)
      onChanged()
    }
  }

  const shown = detail ?? fallback
  if (!shown) {
    return error ? (
      <EmptyRecord title="Run" icon={<HistoryIcon aria-hidden />} line={error} hideLabel="Hide the run" />
    ) : (
      <EmptyRecord title="Run" icon={<HistoryIcon aria-hidden />} line="" loading hideLabel="Hide the run" />
    )
  }

  const waiting = shown.status === "waiting_approval"
  const finished = finalAutomationRunStatuses.has(shown.status)

  return (
    <>
      <RecordFrame
        avatar={<RunStatusIcon status={shown.status} />}
        title={shown.automation_name}
        line={shown.subject_label ?? (shown.trigger_name ? shown.trigger_name : "Started by hand")}
        hideLabel="Hide the run"
        actions={
          onOpenFlow || finished ? (
            <TabbedMenu
              label="Run menu"
              align="end"
              width="20.4rem"
              open={menuOpen}
              onOpenChange={setMenuOpen}
              tabs={[
                {
                  value: "general",
                  label: "General",
                  content: (
                    <div className="grid gap-1 p-1.5">
                      {onOpenFlow ? (
                        <ActionRow
                          icon={<WorkflowIcon className="size-4" />}
                          onClick={() => {
                            setMenuOpen(false)
                            onOpenFlow(shown.automation_id)
                          }}
                        >
                          Open {shown.automation_name}
                        </ActionRow>
                      ) : null}
                    </div>
                  ),
                  footer: finished ? (
                    <ActionRow
                      destructive
                      icon={<Trash2Icon className="size-4" />}
                      onClick={() => {
                        setMenuOpen(false)
                        setAskDelete(true)
                      }}
                    >
                      Delete run
                    </ActionRow>
                  ) : undefined,
                },
              ]}
            />
          ) : null
        }
        body={
          error && !detail ? (
            <ErrorRow message={error} onRetry={() => void load()} />
          ) : (
            <RunDetailBody detail={detail} active />
          )
        }
        footer={
          <>
            <FooterState>
              {shown.is_test ? <Badge variant="outline">Test</Badge> : null}
              <span className="min-w-0 truncate">
                {automationRunStatusLabel(shown.status, shown.approval_decision)}
                <span className="text-muted-foreground">
                  {" "}
                  · {formatRelativeTime(shown.started_at, formatDateTime)}
                </span>
              </span>
            </FooterState>
            {waiting ? (
              <div className="flex shrink-0 gap-2">
                <Button type="button" variant="outline" disabled={deciding} onClick={() => void decide("rejected")}>
                  <XIcon className="size-4" />
                  Reject
                </Button>
                <Button type="button" disabled={deciding} onClick={() => void decide("approved")}>
                  {deciding ? <Loader2Icon className="size-4 animate-spin" /> : <CheckIcon className="size-4" />}
                  Approve
                </Button>
              </div>
            ) : null}
          </>
        }
      />
      <ConfirmDialog
        open={askDelete}
        onOpenChange={setAskDelete}
        title="Delete this run?"
        description="The record of what it did goes with it. This cannot be undone."
        confirmLabel="Delete run"
        loading={deleting}
        onConfirm={() =>
          void runDelete(async () => {
            await deleteAutomationRun(runId)
            setAskDelete(false)
            onDeleted()
          }, "Run deleted.")
        }
      />
    </>
  )
}

/**
 * What a run did, step by step: what Approve does while it waits, what
 * started it, each step with its summary, emails and app result, then how it
 * ended. Shared by the right panel and the email page's Runs tab.
 */
export function RunDetailBody({
  detail,
  active,
}: {
  /** Null while the run is read. */
  detail: AutomationRunDetailItem | null
  /** False while it is out of sight, which stops the delivery history's reads. */
  active: boolean
}) {
  if (!detail) return <p className="text-sm text-muted-foreground">Reading the run…</p>
  const latestDeliveryStepIds = latestSendEmailStepIds(detail.steps)
  return (
    <div className="grid min-w-0 gap-3 text-sm">
      {detail.status === "waiting_approval" ? (
        <div className="grid gap-1.5 rounded-xl border bg-muted/50 p-3">
          <p>
            <span className="font-medium">If you approve: </span>
            {detail.approval_summary?.trim() || "the flow carries on from this step."}
          </p>
          <p className="text-muted-foreground">
            If you reject, the run stops here and nothing after this step happens.
            {detail.approval_deadline_at
              ? ` Left alone it rejects itself on ${formatDateTime(detail.approval_deadline_at)}.`
              : ""}
          </p>
        </div>
      ) : null}

      {detail.is_test && detail.subject_label ? (
        <p className="text-muted-foreground">
          Tested as {detail.subject_label}. Emails went to the admin who started the test, and outside changes were
          skipped.
        </p>
      ) : detail.trigger_name ? (
        <p className="text-muted-foreground">
          Started by {detail.trigger_name}
          {detail.subject_label ? `, for ${detail.subject_label}` : ""}.
        </p>
      ) : (
        <p className="text-muted-foreground">Started by hand.</p>
      )}

      {detail.steps.length === 0 ? (
        <p className="text-muted-foreground">The first step has not finished yet.</p>
      ) : (
        <ol className="grid min-w-0 gap-3">
          {detail.steps.map((step) => (
            <li key={step.id} className="grid min-w-0 gap-0.5">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="min-w-0 truncate font-medium">{step.step_name}</span>
                <Badge variant={step.status === "completed" ? "secondary" : "destructive"}>
                  {automationRunStepStatusLabels[step.status]}
                </Badge>
                <span className="ml-auto text-xs text-muted-foreground">
                  {formatRelativeTime(step.finished_at, formatDateTime)}
                </span>
              </div>
              <p className="text-muted-foreground">{step.summary}</p>
              {step.error ? <InlineError>{step.error}</InlineError> : null}
              {latestDeliveryStepIds.has(step.id) ? (
                <AutomationDeliveryHistory
                  runId={detail.id}
                  nodeId={step.node_id}
                  polling={active && !finalAutomationRunStatuses.has(detail.status)}
                />
              ) : null}
              <StepRunResult runId={detail.id} step={step} />
            </li>
          ))}
        </ol>
      )}

      {detail.status === "failed" && detail.error ? <InlineError>{detail.error}</InlineError> : null}
      {detail.approval_decided_at ? (
        <p className="text-muted-foreground">
          {detail.approval_decision === "timed_out"
            ? `Nobody answered, so it timed out on ${formatDateTime(detail.approval_decided_at)}.`
            : `Decided by ${detail.approval_decided_by_name ?? "somebody"} on ${formatDateTime(detail.approval_decided_at)}.`}
        </p>
      ) : null}
    </div>
  )
}

/** A retried Send email step shares one delivery set across every attempt. */
function latestSendEmailStepIds(steps: AutomationRunStepItem[]): Set<string> {
  const latestByNode = new Map<string, string>()
  for (const step of steps) {
    if (step.kind === "sendEmail") latestByNode.set(step.node_id, step.id)
  }
  return new Set(latestByNode.values())
}

/** The node's own result view, from the app, when it has one. */
function StepRunResult({ runId, step }: { runId: string; step: AutomationRunStepItem }) {
  if (step.output === null) return null
  const result = automationNodeRunResult(step.kind)
  if (!result) return null
  return (
    <div className="pt-2">
      <React.Suspense fallback={null}>
        {React.createElement(result, { runId, stepId: step.id, nodeId: step.node_id, output: step.output })}
      </React.Suspense>
    </div>
  )
}
