import * as React from "react"
import { Loader2Icon, RotateCcwIcon, XIcon } from "lucide-react"
import { toast } from "sonner"

import { Hint } from "@/components/social/hint"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ErrorRow } from "@/components/ui/error-row"
import { LoadingRow } from "@/components/ui/loading-row"
import { getPhoneErrorMessage, loadPhoneJobs } from "@/lib/api/phones/phones"
import {
  cancelWaitingJobs,
  getJobsErrorMessage,
  retryFailedJobs,
  type JobList,
  type JobRow,
} from "@/lib/api/social/jobs"
import { describeBulkResult } from "@/lib/format/bulk-result"
import { formatTimeAgo } from "@/lib/format/format-time"
import { jobStatusText } from "@/lib/social/job-words"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

/** The tab reads the phone's jobs again this often while it is open. */
const PHONE_JOBS_REFRESH_MS = 10_000

/**
 * The Jobs tab on a phone's window (part 58 of the phone farm): the jobs
 * waiting for, running on and finished on this phone, newest first, at most
 * 100, each naming the account and the project. Cancel and Try again are the
 * Jobs window's own, so cancelling here cancels the same job it shows.
 */
export function PhoneJobsPanel({ phoneId }: { phoneId: string }) {
  const [state, setState] = React.useState<{ list: JobList | null; error: string | null }>({ list: null, error: null })
  const [attempt, setAttempt] = React.useState(0)
  const [busy, setBusy] = React.useState(false)

  const read = React.useCallback(
    () =>
      loadPhoneJobs(phoneId).then(
        (list) => setState({ list, error: null }),
        (error: unknown) => setState((current) => ({ list: current.list, error: getPhoneErrorMessage(error) }))
      ),
    [phoneId]
  )

  React.useEffect(() => {
    let live = true
    const readIfLive = () => {
      if (live) void read()
    }
    readIfLive()
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") readIfLive()
    }, PHONE_JOBS_REFRESH_MS)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [read, attempt])

  async function act(job: JobRow) {
    const retrying = job.status === "failed"
    setBusy(true)
    try {
      const answer = retrying ? await retryFailedJobs([job.id]) : await cancelWaitingJobs([job.id])
      toast.success(
        describeBulkResult({
          done: answer.completed.length,
          kept: answer.skipped.length,
          one: "job",
          many: "jobs",
          verb: retrying ? "put back on the queue" : "cancelled",
          keptReason: retrying
            ? "left alone because they write to Reddit. Try those again from the Comments screen"
            : "already running",
        })
      )
      await read()
    } catch (failure) {
      showErrorToast(getJobsErrorMessage(failure))
    } finally {
      setBusy(false)
    }
  }

  if (state.error && !state.list) return <ErrorRow message={state.error} onRetry={() => setAttempt((count) => count + 1)} />
  if (!state.list) return <LoadingRow label="Reading the jobs" className="min-h-48" />
  const { program, jobs } = state.list
  if (!jobs.length) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        No job has waited for, run on or finished on this phone yet.
      </p>
    )
  }

  return (
    <div className="grid gap-4">
      {state.error ? (
        <p role="status" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      {!program.running ? (
        <p className="text-sm text-destructive">
          The browser program is not running, so nothing starts on this phone. Open a terminal in apps/promo
          and run npm run social:browser.
        </p>
      ) : null}
      <Card size="sm">
        <CardContent className="grid gap-0 divide-y p-0">
          {jobs.map((job) => {
            const status = jobStatusText(
              {
                ...job,
                claimedAt: date(job.claimedAt),
                runAfter: date(job.runAfter),
                finishedAt: date(job.finishedAt),
              },
              program.running
            )
            const when = date(job.finishedAt) ?? new Date(job.addedAt)
            const failedLook = job.status === "failed" || (job.status === "queued" && !program.running)
            return (
              <div key={job.id} className="flex items-start gap-3 px-4 py-3 text-sm">
                <div className="grid min-w-0 flex-1 gap-0.5">
                  <span className="truncate font-medium">{job.what}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {[job.where, job.project ? `for ${job.project}` : ""].filter(Boolean).join(" · ") ||
                      "No account named"}
                  </span>
                  <span className={cn("flex items-center gap-1.5 text-xs", failedLook ? "text-destructive" : "text-muted-foreground")}>
                    {job.status === "running" ? (
                      <Loader2Icon className="size-3 shrink-0 animate-spin" aria-hidden="true" />
                    ) : null}
                    <span className="truncate">{status}</span>
                    <span className="shrink-0">· {formatTimeAgo(when)}</span>
                  </span>
                </div>
                {job.status === "queued" ? (
                  <Hint label="Cancel: take it off the queue">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={busy}
                      onClick={() => void act(job)}
                      aria-label={`Cancel ${job.what}`}
                    >
                      <XIcon className="size-4" />
                    </Button>
                  </Hint>
                ) : job.canRetry ? (
                  <Hint label="Try again: put it back on the queue">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={busy}
                      onClick={() => void act(job)}
                      aria-label={`Try again: ${job.what}`}
                    >
                      <RotateCcwIcon className="size-4" />
                    </Button>
                  </Hint>
                ) : null}
              </div>
            )
          })}
        </CardContent>
      </Card>
    </div>
  )
}

/** Dates arrive as strings once they have crossed from the server. */
function date(value: Date | string | null): Date | null {
  return value ? new Date(value) : null
}
