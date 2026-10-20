import * as React from "react"
import { ListChecksIcon, Loader2Icon, RotateCcwIcon, XIcon } from "lucide-react"
import { toast } from "sonner"

import { DashboardTable } from "@/components/shared/dashboard-table"
import { DashboardToolbarButton } from "@/components/shared/dashboard-toolbar"
import {
  SelectAllTableHead,
  SortableTableHeader,
  type TableHeaderColumn,
} from "@/components/shared/sortable-table-header"
import { usePromoShell } from "@/components/social/guest/guest-mode"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardGroup, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { TableCell, TableHead, TableRow, type TableSortDirection } from "@/components/ui/table"
import { Tabs, TabsCount, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  cancelWaitingJobs,
  getJobsErrorMessage,
  loadJobs,
  retryFailedJobs,
  type JobList,
  type JobRow,
} from "@/lib/api/social/jobs"
import { describeBulkResult } from "@/lib/format/bulk-result"
import { formatTimeAgo } from "@/lib/format/format-time"
import { useSelection } from "@/lib/hooks/use-selection"
import { useTableSort } from "@/lib/hooks/use-table-sort"
import { jobStatusText, programText } from "@/lib/social/job-words"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"
import { Hint } from "@/components/social/hint"

/** How often the dashboard reads the queue again while it is open. */
const POLL_MS = 5_000

type JobsTab = "active" | "done" | "failed"

/**
 * The Jobs dashboard, under Projects in the left menu: whether the browser
 * program is running, and what it is doing, waiting to do, and did lately.
 *
 * Tyler asked for it on 13 Oct 2026 after his searches sat waiting for a day
 * with nothing on screen to say why: the program that runs them had stopped.
 * Every search, read, comment and check is a job on that program's queue, and
 * this is the one place that lists them. It was a Settings tab for an hour
 * until he asked for it to be a dashboard of its own.
 */
export function JobsDashboard({ initial }: { initial: JobList }) {
  const [list, setList] = React.useState<JobList>(initial)
  const [error, setError] = React.useState<string | null>(null)
  const [tab, setTab] = React.useState<JobsTab>("active")

  const refresh = React.useCallback(
    (): Promise<void> =>
      loadJobs().then(
        (next) => {
          setList(next)
          setError(null)
        },
        (failure: unknown) => setError(getJobsErrorMessage(failure))
      ),
    []
  )

  React.useEffect(() => {
    const timer = setInterval(() => void refresh(), POLL_MS)
    return () => clearInterval(timer)
  }, [refresh])

  const groups: Record<JobsTab, JobRow[]> = {
    active: list.jobs.filter((job) => job.status === "queued" || job.status === "running"),
    done: list.jobs.filter((job) => job.status === "done"),
    failed: list.jobs.filter((job) => job.status === "failed"),
  }
  const waiting = groups.active.filter((job) => job.status === "queued").length

  const tabs = (
    <Tabs value={tab} onValueChange={(value) => setTab(value as JobsTab)}>
      <TabsList>
        <TabsTrigger value="active" aria-label={`Running and waiting, ${groups.active.length}`}>
          {/* Shorter on a phone, so the three tabs fit across it. */}
          <span className="hidden sm:inline">Running and waiting</span>
          <span className="sm:hidden">Waiting</span>
          <TabsCount>{groups.active.length}</TabsCount>
        </TabsTrigger>
        <TabsTrigger value="done" aria-label={`Done today, ${groups.done.length}`}>
          Done
          <TabsCount>{groups.done.length}</TabsCount>
        </TabsTrigger>
        <TabsTrigger value="failed" aria-label={`Failed, ${groups.failed.length}`}>
          Failed
          <TabsCount>{groups.failed.length}</TabsCount>
        </TabsTrigger>
      </TabsList>
    </Tabs>
  )

  return (
    // Sized by the page, never by the table's columns, so on a phone the
    // table scrolls sideways inside its card rather than widening the page.
    <CardGroup className="[contain:inline-size]">
      <ProgramCard program={list.program} waiting={waiting} />
      <JobsTable
        // Keyed by the tab, so its sort and ticks start fresh on each.
        key={tab}
        tab={tab}
        tabs={tabs}
        jobs={groups[tab]}
        programRunning={list.program.running}
        error={error}
        onRefresh={refresh}
      />
    </CardGroup>
  )
}

/** Whether the browser program is running, and how to start it when it is not. */
function ProgramCard({ program, waiting }: { program: JobList["program"]; waiting: number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>The browser program</CardTitle>
        <CardDescription>The program that opens the browsers and does every job below.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
      <p className="flex items-start gap-2 text-sm">
        <span
          className={cn(
            "mt-1.5 size-2 shrink-0 rounded-full",
            program.running ? "bg-emerald-500" : waiting ? "bg-destructive" : "bg-muted-foreground/40"
          )}
          aria-hidden="true"
        />
        {/* Times are said on the reader's own clock, which the server drawing
            the page does not know, and the minutes move on while it loads. */}
        <span className={cn(!program.running && waiting > 0 && "text-destructive")} suppressHydrationWarning>
          {programText(program, waiting)}
        </span>
      </p>
      {program.running ? null : (
        <p className="text-sm text-muted-foreground">
          To start it on this Mac, open a terminal in <code className="text-foreground">apps/promo</code> and
          run <code className="text-foreground">npm run social:browser</code>. Leave the terminal open: closing
          it stops the program. It shows as running here within 15 seconds.
        </p>
      )}
      </CardContent>
    </Card>
  )
}

type SortColumn = "what" | "status" | "when"

function whenOf(job: JobRow, tab: JobsTab): Date {
  return new Date(tab === "active" ? job.addedAt : (job.finishedAt ?? job.addedAt))
}

function compare(a: JobRow, b: JobRow, column: SortColumn, tab: JobsTab): number {
  switch (column) {
    case "what":
      return a.what.localeCompare(b.what)
    // Running before waiting when sorting up, then by the words.
    case "status":
      return Number(b.status === "running") - Number(a.status === "running") || a.lastError.localeCompare(b.lastError)
    default:
      return whenOf(a, tab).getTime() - whenOf(b, tab).getTime()
  }
}

const EMPTY_TEXT: Record<JobsTab, string> = {
  active: "Nothing is running or waiting. Pressing search, Read the replies or Post adds a job here.",
  done: "No job has finished in the last day.",
  failed: "No job has failed in the last week.",
}

function JobsTable({
  tab,
  tabs,
  jobs,
  programRunning,
  error,
  onRefresh,
}: {
  tab: JobsTab
  tabs: React.ReactNode
  jobs: JobRow[]
  programRunning: boolean
  error: string | null
  onRefresh: () => Promise<void>
}) {
  const { rowsPerPage } = usePromoShell()
  const selection = useSelection()
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(rowsPerPage)
  const [busy, setBusy] = React.useState(false)
  // The queue reads oldest first, the order it runs in; finished jobs newest first.
  const initial: TableSortDirection = tab === "active" ? "asc" : "desc"
  const { sort, direction, toggleSort } = useTableSort<SortColumn>("when", initial)

  const sorted = React.useMemo(() => {
    const factor = direction === "asc" ? 1 : -1
    return [...jobs].sort((a, b) => factor * compare(a, b, sort, tab))
  }, [direction, jobs, sort, tab])

  const totalPages = Math.max(1, Math.ceil(jobs.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const visible = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const visibleIds = visible.map((job) => job.id)
  // A tick only counts while its row is still listed: a job that started or
  // finished since it was ticked is no longer one this tab's button acts on.
  const ticked = jobs.filter((job) => selection.selected.has(job.id)).map((job) => job.id)

  const columns: TableHeaderColumn<SortColumn>[] = [
    { key: "what", label: "Job", column: "main" },
    {
      key: "status",
      label: tab === "failed" ? "Why" : "Where it has got to",
      column: "meta",
      className: "hidden sm:table-cell",
    },
    {
      key: "when",
      label: tab === "active" ? "Added" : "Finished",
      column: "meta",
      className: "hidden md:table-cell",
    },
  ]

  async function act(ids: string[]) {
    setBusy(true)
    try {
      const answer = tab === "failed" ? await retryFailedJobs(ids) : await cancelWaitingJobs(ids)
      toast.success(
        describeBulkResult({
          done: answer.completed.length,
          kept: answer.skipped.length,
          one: "job",
          many: "jobs",
          verb: tab === "failed" ? "put back on the queue" : "cancelled",
          keptReason:
            tab === "failed"
              ? "left alone because they write to Reddit. Try those again from the Comments screen"
              : "already running",
        })
      )
      selection.clear()
      await onRefresh()
    } catch (failure) {
      showErrorToast(getJobsErrorMessage(failure))
    } finally {
      setBusy(false)
    }
  }

  const bulk =
    tab === "done" || !ticked.length ? null : (
      <DashboardToolbarButton type="button" variant="outline" disabled={busy} onClick={() => void act(ticked)}>
        {busy ? (
          <Loader2Icon className="size-4 animate-spin" />
        ) : tab === "failed" ? (
          <RotateCcwIcon className="size-4" />
        ) : (
          <XIcon className="size-4" />
        )}
        {tab === "failed" ? "Try again" : "Cancel"} ({ticked.length})
      </DashboardToolbarButton>
    )

  return (
    <DashboardTable
      title="Jobs"
      icon={<ListChecksIcon />}
      tabs={tabs}
      count={jobs.length}
      error={error ? { message: error, onRetry: () => void onRefresh() } : null}
      selectedCount={ticked.length}
      onClearSelection={selection.clear}
      controls={bulk}
      header={
        <SortableTableHeader
          columns={columns}
          sort={sort}
          direction={direction}
          onSort={toggleSort}
          leading={
            <SelectAllTableHead
              noun="jobs"
              checked={selection.selectAllState(visibleIds)}
              onCheckedChange={() => selection.toggleVisible(visibleIds)}
            />
          }
          trailing={<TableHead column="meta">Actions</TableHead>}
        />
      }
      isEmpty={jobs.length === 0}
      emptyText={EMPTY_TEXT[tab]}
      emptyColSpan={5}
      footer={{
        type: "pagination",
        page: currentPage,
        pageSize,
        total: jobs.length,
        totalPages,
        onPageChange: (next) => setPage(Math.max(1, Math.min(next, totalPages))),
        onPageSizeChange: (next) => {
          setPage(1)
          setPageSize(next)
        },
      }}
    >
      {visible.map((job) => {
        const status = jobStatusText(
          { ...job, claimedAt: date(job.claimedAt), runAfter: date(job.runAfter), finishedAt: date(job.finishedAt) },
          programRunning
        )
        const when = whenOf(job, tab)
        return (
          <TableRow key={job.id} className="group">
            <TableCell column="select">
              <Checkbox
                checked={selection.selected.has(job.id)}
                onCheckedChange={() => selection.toggle(job.id)}
                aria-label={`Select ${job.what}`}
              />
            </TableCell>
            <TableCell column="main" className="max-w-0">
              {/* The full words on hover, since a long one is cut short. */}
              <Hint label={job.where ? `${job.what}. ${job.where}` : job.what}>
                <span className="block truncate text-sm font-medium">{job.what}</span>
              </Hint>
              {job.where ? <span className="block truncate text-xs text-muted-foreground">{job.where}</span> : null}
              {/* On a phone the status column is hidden, so it rides under the job. */}
              <span className="block truncate text-xs text-muted-foreground sm:hidden" suppressHydrationWarning>
                {status}
              </span>
            </TableCell>
            <TableCell column="meta" className="hidden max-w-80 sm:table-cell">
              <Hint label={<span suppressHydrationWarning>{status}</span>}>
                <span
                  className={cn(
                    "flex min-w-0 items-center gap-1.5 text-sm",
                    job.status === "failed" || (job.status === "queued" && !programRunning)
                      ? "text-destructive"
                      : job.status === "running"
                        ? "text-foreground"
                        : "text-muted-foreground"
                  )}
                  suppressHydrationWarning
                >
                  {job.status === "running" ? (
                    <Loader2Icon className="size-3.5 shrink-0 animate-spin" aria-hidden="true" />
                  ) : null}
                  <span className="truncate" suppressHydrationWarning>
                    {status}
                  </span>
                </span>
              </Hint>
            </TableCell>
            <TableCell
              column="meta"
              className="hidden whitespace-nowrap text-muted-foreground md:table-cell"
            >
              <Hint label={<span suppressHydrationWarning>{when.toLocaleString()}</span>}>
                <span suppressHydrationWarning>{formatTimeAgo(when)}</span>
              </Hint>
            </TableCell>
            <TableCell column="actions">
              {job.status === "queued" ? (
                <Hint label="Cancel: take it off the queue">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={busy}
                    onClick={() => void act([job.id])}
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
                    onClick={() => void act([job.id])}
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
    </DashboardTable>
  )
}

/** Dates arrive as strings once they have crossed from the server. */
function date(value: Date | string | null): Date | null {
  return value ? new Date(value) : null
}
