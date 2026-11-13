import * as React from "react"
import { CheckIcon, CircleIcon, ListChecksIcon, TagIcon, TimerIcon } from "lucide-react"

import { MemberName } from "@/components/pomodoro/admin-member-name"
import { ShortList } from "@/components/pomodoro/admin-member-record"
import { DetailRecord } from "@/components/pomodoro/flowfly/detail-record"
import { PanelCard } from "@/components/shared/panel-card"
import { ErrorRow } from "@/components/ui/error-row"
import { LoadingRow } from "@/components/ui/loading-row"
import type { AdminTaskRow } from "@/lib/api/pomodoro/admin"
import { getFlowflyErrorMessage, loadFlowflyTask, type AdminTaskRecord } from "@/lib/api/pomodoro/flowfly"
import { formatDate, formatDateTime, formatDuration, formatUtcDate } from "@/lib/format/format-time"
import { TASK_STATUS_LOOK } from "@/lib/pomodoro/admin-lists"

const MODE_LABELS: Record<string, string> = { focus: "Focus", short: "Short break", long: "Long break" }

/**
 * One task on the Flowfly dashboard's right panel (Tyler's pick "Task and
 * session records"): who it belongs to and when it is planned, then its
 * steps, its tags and due date, and the timer runs counted on it. Read only:
 * a member's plan for their day is theirs to word, so the footer holds what
 * an admin may do, which is delete it.
 */
export function TaskRecord({ row, footer }: { row: AdminTaskRow; footer: React.ReactNode }) {
  const [detail, setDetail] = React.useState<AdminTaskRecord | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [attempt, setAttempt] = React.useState(0)

  React.useEffect(() => {
    let live = true
    loadFlowflyTask(row.id).then(
      (loaded) => {
        if (!live) return
        if (loaded) setDetail(loaded)
        else setError("This task is gone.")
      },
      (failure) => {
        if (live) setError(getFlowflyErrorMessage(failure))
      }
    )
    return () => {
      live = false
    }
  }, [row.id, attempt])

  const status = TASK_STATUS_LOOK[row.status]?.label ?? row.status
  return (
    <DetailRecord
      icon={<ListChecksIcon aria-hidden />}
      title={row.title}
      line={`${row.userName} · ${formatUtcDate(row.plannedDate)}`}
      hideLabel="Hide the task"
      facts={[
        ["Member", <MemberName key="member" id={row.userId} name={row.userName} title={row.userEmail} />],
        ["Planned for", formatUtcDate(row.plannedDate)],
        ["Due", detail?.dueDate ? formatUtcDate(detail.dueDate) : "None"],
        ["Project", detail?.project ?? "None"],
        ["Sessions", row.pomodoroCount.toLocaleString()],
        ["Added", formatDate(row.createdAt)],
      ]}
      state={status}
      footer={footer}
    >
      {error ? (
        <ErrorRow
          message={error}
          onRetry={() => {
            setError(null)
            setAttempt((count) => count + 1)
          }}
        />
      ) : !detail ? (
        <LoadingRow label="Reading the task…" />
      ) : (
        <>
          <PanelCard
            storageId="pomodoro-flowfly-task-steps"
            icon={<ListChecksIcon />}
            title="Steps"
            meta={detail.steps.length ? `${detail.steps.filter((step) => step.done).length} of ${detail.steps.length} done` : undefined}
          >
            {detail.steps.length ? (
              <ul className="grid grid-cols-[minmax(0,1fr)] gap-1.5">
                {detail.steps.map((step) => (
                  <li key={step.id} className="flex min-w-0 items-center gap-2 text-sm">
                    {step.done ? (
                      <CheckIcon className="size-4 shrink-0 text-muted-foreground" aria-label="Done" />
                    ) : (
                      <CircleIcon className="size-4 shrink-0 text-muted-foreground" aria-label="Not done" />
                    )}
                    <span className={step.done ? "truncate text-muted-foreground line-through" : "truncate"}>{step.title}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No steps.</p>
            )}
          </PanelCard>
          <PanelCard storageId="pomodoro-flowfly-task-tags" icon={<TagIcon />} title="Tags">
            {detail.tags.length ? (
              <div className="flex flex-wrap gap-1.5">
                {detail.tags.map((tag) => (
                  <span key={tag} className="rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                    {tag}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No tags.</p>
            )}
          </PanelCard>
          <PanelCard storageId="pomodoro-flowfly-task-runs" icon={<TimerIcon />} title="Runs on it" meta={detail.runs.length ? "Newest 20" : undefined}>
            <ShortList
              empty="No timer has run on it."
              rows={detail.runs.map((run) => ({
                id: run.id,
                main: `${MODE_LABELS[run.mode] ?? run.mode} · ${formatDuration(run.seconds * 1000, { zero: "0m" })}`,
                meta: formatDateTime(run.createdAt),
              }))}
            />
          </PanelCard>
        </>
      )}
    </DetailRecord>
  )
}
