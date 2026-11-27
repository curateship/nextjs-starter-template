import * as React from "react"
import { Loader2Icon, RotateCcwIcon, XIcon } from "lucide-react"

import { Hint } from "@/components/social/hint"
import { Button } from "@/components/ui/button"
import { ErrorRow } from "@/components/ui/error-row"
import { LoadingRow } from "@/components/ui/loading-row"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableSurface } from "@/components/ui/table"
import { getPhoneErrorMessage, loadPhoneJobs, loadRackJobs } from "@/lib/api/phones/phones"
import {
  cancelWaitingJobs,
  getJobsErrorMessage,
  retryFailedJobs,
  type JobList,
  type JobRow,
} from "@/lib/api/social/jobs"
import { formatTimeAgo } from "@/lib/format/format-time"
import { jobStatusText } from "@/lib/social/job-words"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

/** The list reads the jobs again this often while it shows. */
const PHONE_JOBS_REFRESH_MS = 10_000

/**
 * The Jobs section in a phone's ⋮ (part 58 of the phone farm), or the Jobs
 * tab of a rack's middle panel for every phone on it (Racks dashboard, part 104): the jobs
 * waiting for, running on and finished on them, newest first, each naming
 * the account and the project, in the shell's table (Tyler, 6 Nov 2026:
 * "jobs tab should have normal tables"). Cancel and Try again are the Jobs
 * window's own, so cancelling here cancels the same job it shows.
 */
export function PhoneJobsPanel({
  phoneId,
  rackId,
  flush = false,
}: ({ phoneId: string; rackId?: never } | { rackId: string; phoneId?: never }) & {
  /** Edge to edge, as the rack's phone list is, for the middle panel's Jobs tab. */
  flush?: boolean
}) {
  const [state, setState] = React.useState<{ list: JobList | null; error: string | null }>({ list: null, error: null })
  const [attempt, setAttempt] = React.useState(0)
  const [busy, setBusy] = React.useState(false)

  const read = React.useCallback(
    () =>
      (rackId ? loadRackJobs(rackId) : loadPhoneJobs(phoneId as string)).then(
        (list) => setState({ list, error: null }),
        (error: unknown) => setState((current) => ({ list: current.list, error: getPhoneErrorMessage(error) }))
      ),
    [phoneId, rackId]
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
      await (retrying ? retryFailedJobs([job.id]) : cancelWaitingJobs([job.id]))
      await read()
    } catch (failure) {
      showErrorToast(getJobsErrorMessage(failure))
    } finally {
      setBusy(false)
    }
  }

  const pad = flush ? "p-4" : ""
  if (state.error && !state.list) {
    return (
      <div className={pad}>
        <ErrorRow message={state.error} onRetry={() => setAttempt((count) => count + 1)} />
      </div>
    )
  }
  if (!state.list) return <LoadingRow label="Reading the jobs" className="min-h-48" />
  const { program, jobs } = state.list
  if (!jobs.length) {
    return (
      <p className={cn("text-sm text-muted-foreground", flush ? "p-4" : "py-6 text-center")}>
        {rackId ? "No job has waited for, run on or finished on a phone on this rack yet." : "No job has waited for, run on or finished on this phone yet."}
      </p>
    )
  }

  const notices = (
    <>
      {state.error ? (
        <p role="status" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      {!program.running ? (
        <p className="text-sm text-destructive">
          The browser program is not running, so nothing starts on {rackId ? "these phones" : "this phone"}. Open a terminal in apps/promo
          and run npm run social:browser.
        </p>
      ) : null}
    </>
  )
  const showNotices = Boolean(state.error) || !program.running

  // The shell's table, its columns folding by the room it has: the account
  // and the time join the job's own cell below 32rem, the status below 28rem.
  const table = (
    <div className="@container min-w-0">
      <Table>
        <TableHeader>
          <TableRow>
            {/* The shell's main column keeps 320px, more than the phone's ⋮ has; the columns fold instead. */}
            <TableHead column="main" className="min-w-0 @lg:min-w-48">
              Job
            </TableHead>
            <TableHead column="meta" className="hidden @lg:table-cell">
              Account
            </TableHead>
            <TableHead column="meta" className="hidden @md:table-cell">
              Status
            </TableHead>
            <TableHead column="meta" className="hidden @lg:table-cell">
              When
            </TableHead>
            <TableHead column="meta" className="w-12">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
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
            const when = formatTimeAgo(date(job.finishedAt) ?? new Date(job.addedAt))
            const where = [job.where, job.project ? `for ${job.project}` : ""].filter(Boolean).join(" · ") || "No account named"
            const failedLook = job.status === "failed" || (job.status === "queued" && !program.running)
            const statusLine = (
              <span className={cn("flex min-w-0 items-center gap-1.5", failedLook ? "text-destructive" : "text-muted-foreground")}>
                {job.status === "running" ? <Loader2Icon className="size-3 shrink-0 animate-spin" aria-hidden="true" /> : null}
                <span className="truncate">{status}</span>
              </span>
            )
            return (
              <TableRow key={job.id}>
                <TableCell column="main" className="max-w-0 min-w-0 @lg:min-w-48">
                  <span className="block truncate text-sm font-medium">{job.what}</span>
                  <span className="block truncate text-xs text-muted-foreground @lg:hidden">
                    {where} · {when}
                  </span>
                  <span className="block text-xs @md:hidden">{statusLine}</span>
                </TableCell>
                <TableCell column="meta" className="hidden max-w-56 text-sm whitespace-normal @lg:table-cell">
                  <span className="line-clamp-2">{where}</span>
                </TableCell>
                <TableCell column="meta" className="hidden max-w-56 text-sm @md:table-cell">
                  {statusLine}
                </TableCell>
                <TableCell column="meta" className="hidden text-sm whitespace-nowrap text-muted-foreground @lg:table-cell">
                  {when}
                </TableCell>
                <TableCell column="actions" className="w-12">
                  {job.status === "queued" ? (
                    <Hint label="Cancel: take it off the queue">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
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
                        size="icon-sm"
                        disabled={busy}
                        onClick={() => void act(job)}
                        aria-label={`Try again: ${job.what}`}
                      >
                        <RotateCcwIcon className="size-4" />
                      </Button>
                    </Hint>
                  ) : null}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )

  if (flush) {
    return (
      <>
        {showNotices ? <div className="grid gap-2 border-b p-4">{notices}</div> : null}
        {table}
      </>
    )
  }
  return (
    <div className="grid min-w-0 gap-3">
      {notices}
      <TableSurface>{table}</TableSurface>
    </div>
  )
}

/** Dates arrive as strings once they have crossed from the server. */
function date(value: Date | string | null): Date | null {
  return value ? new Date(value) : null
}
