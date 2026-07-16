import * as React from "react"
import {
  DownloadIcon,
  Link2Icon,
  Loader2Icon,
  PencilIcon,
  PlusIcon,
  RotateCcwIcon,
  SearchIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react"

import { DashboardTable } from "@/components/dashboard-table"
import {
  DashboardToolbarButton,
  DashboardToolbarSearch,
  DashboardToolbarSelectTrigger,
} from "@/components/dashboard-toolbar"
import { downloadCsv } from "@/components/keywords-dashboard"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSortButton,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import {
  cancelKeywordJob,
  getKeywordErrorMessage,
  listKeywordJobs,
  retryKeywordJob,
  type KeywordJobItem,
} from "@/lib/api/keywords"
import {
  addProspect,
  createBacklinkDiscoveryJob,
  deleteProspect,
  exportProspectsCsv,
  getBacklinkErrorMessage,
  getBacklinkSummary,
  getProspectStatusCounts,
  listProspects,
  updateProspect,
  type BacklinkProspect,
  type BacklinkSummary,
  type ProspectSortField,
} from "@/lib/api/backlinks"
import type { CompetitorItem, ProjectItem } from "@/lib/api/seo-projects"
import {
  BACKLINK_PROSPECT_STATUSES,
  backlinkProspectStatusLabels,
  type BacklinkProspectStatus,
} from "@/lib/backlinks"

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
})

const numberFormatter = new Intl.NumberFormat("en-US")

const statusBadgeClassNames: Record<BacklinkProspectStatus, string> = {
  new: "",
  qualified:
    "border-blue-200 bg-blue-100 text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/50 dark:text-blue-200",
  contacted:
    "border-amber-200 bg-amber-100 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/50 dark:text-amber-200",
  replied:
    "border-violet-200 bg-violet-100 text-violet-900 dark:border-violet-900/50 dark:bg-violet-950/50 dark:text-violet-200",
  won: "border-green-200 bg-green-100 text-green-900 dark:border-green-900/50 dark:bg-green-950/50 dark:text-green-200",
  rejected:
    "border-red-200 bg-red-100 text-red-900 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-200",
}

type StatusFilter = "all" | BacklinkProspectStatus

export function BacklinksDashboard({
  project,
  competitors,
}: {
  project: ProjectItem
  competitors: CompetitorItem[]
}) {
  const projectId = project.id
  const [rows, setRows] = React.useState<BacklinkProspect[]>([])
  const [total, setTotal] = React.useState(0)
  const [summary, setSummary] = React.useState<BacklinkSummary | null>(null)
  const [counts, setCounts] = React.useState<Record<
    BacklinkProspectStatus,
    number
  > | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [refreshToken, setRefreshToken] = React.useState(0)

  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(25)
  const [searchQuery, setSearchQuery] = React.useState("")
  const [debouncedQuery, setDebouncedQuery] = React.useState("")
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("all")
  const [sort, setSort] = React.useState<{
    field: ProspectSortField
    direction: "asc" | "desc"
  }>({ field: "domainRank", direction: "desc" })

  const [jobs, setJobs] = React.useState<KeywordJobItem[]>([])
  const [addOpen, setAddOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<BacklinkProspect | null>(null)
  const [pendingDelete, setPendingDelete] =
    React.useState<BacklinkProspect | null>(null)
  const [actionBusy, setActionBusy] = React.useState(false)

  React.useEffect(() => {
    const timeout = setTimeout(() => setDebouncedQuery(searchQuery), 300)
    return () => clearTimeout(timeout)
  }, [searchQuery])

  React.useEffect(() => {
    setPage(1)
  }, [debouncedQuery, statusFilter, sort, pageSize])

  React.useEffect(() => {
    let active = true
    setLoading(true)
    Promise.all([
      listProspects({
        projectId,
        q: debouncedQuery.trim() || undefined,
        status: statusFilter === "all" ? undefined : [statusFilter],
        sort,
        pagination: { page, pageSize },
      }),
      getProspectStatusCounts(projectId),
      getBacklinkSummary(projectId),
    ])
      .then(([data, countsData, summaryData]) => {
        if (!active) return
        setRows(data.rows)
        setTotal(data.total)
        setCounts(countsData)
        setSummary(summaryData.summary)
        setError(null)
      })
      .catch((loadError) => {
        if (active) setError(getBacklinkErrorMessage(loadError))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [projectId, debouncedQuery, statusFilter, sort, page, pageSize, refreshToken])

  React.useEffect(() => {
    let active = true
    const refresh = () => {
      listKeywordJobs(projectId)
        .then((data) => {
          if (!active) return
          const discoveryJobs = data.jobs.filter(
            (job) => job.type === "backlink_discovery"
          )
          setJobs((previous) => {
            const previousActive = new Set(
              previous
                .filter(
                  (job) => job.status === "pending" || job.status === "running"
                )
                .map((job) => job.id)
            )
            const finishedNow = discoveryJobs.some(
              (job) => previousActive.has(job.id) && job.status === "completed"
            )
            if (finishedNow) setRefreshToken((token) => token + 1)
            return discoveryJobs
          })
        })
        .catch(() => {})
    }
    refresh()
    const interval = setInterval(refresh, 3000)
    return () => {
      active = false
      clearInterval(interval)
    }
  }, [projectId])

  const latestJob = jobs[0] ?? null
  const hasActiveJob =
    latestJob?.status === "pending" || latestJob?.status === "running"
  const status = !latestJob
    ? null
    : hasActiveJob
      ? {
          tone: "success" as const,
          text: `${latestJob.currentStep ?? "Queued"} (${latestJob.progress}%)`,
        }
      : latestJob.status === "failed"
        ? {
            tone: "error" as const,
            text: latestJob.errorMessage
              ? `Discovery failed: ${latestJob.errorMessage.slice(0, 80)}`
              : "Discovery failed",
          }
        : null

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const canDiscover = Boolean(project.domain) && competitors.length > 0

  function toggleSort(field: ProspectSortField) {
    setSort((current) =>
      current.field === field
        ? { field, direction: current.direction === "asc" ? "desc" : "asc" }
        : { field, direction: field === "domain" ? "asc" : "desc" }
    )
  }

  async function startDiscovery() {
    setActionBusy(true)
    setError(null)
    try {
      const { job } = await createBacklinkDiscoveryJob({ projectId })
      setJobs((current) => [job, ...current])
    } catch (startError) {
      setError(getBacklinkErrorMessage(startError))
    } finally {
      setActionBusy(false)
    }
  }

  async function handleExport() {
    setActionBusy(true)
    setError(null)
    try {
      const result = await exportProspectsCsv(projectId)
      downloadCsv(result.filename, result.csv)
    } catch (exportError) {
      setError(getBacklinkErrorMessage(exportError))
    } finally {
      setActionBusy(false)
    }
  }

  async function changeStatus(
    prospect: BacklinkProspect,
    nextStatus: BacklinkProspectStatus
  ) {
    setError(null)
    try {
      await updateProspect({
        projectId,
        prospectId: prospect.id,
        status: nextStatus,
      })
      setRefreshToken((token) => token + 1)
    } catch (updateError) {
      setError(getBacklinkErrorMessage(updateError))
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    setActionBusy(true)
    setError(null)
    try {
      await deleteProspect(projectId, pendingDelete.id)
      setPendingDelete(null)
      setRefreshToken((token) => token + 1)
    } catch (deleteError) {
      setError(getBacklinkErrorMessage(deleteError))
    } finally {
      setActionBusy(false)
    }
  }

  async function handleRetry(jobId: string) {
    try {
      await retryKeywordJob(jobId)
      const data = await listKeywordJobs(projectId)
      setJobs(data.jobs.filter((job) => job.type === "backlink_discovery"))
    } catch (retryError) {
      setError(getKeywordErrorMessage(retryError))
    }
  }

  async function handleCancel(jobId: string) {
    try {
      await cancelKeywordJob(jobId)
      const data = await listKeywordJobs(projectId)
      setJobs(data.jobs.filter((job) => job.type === "backlink_discovery"))
    } catch (cancelError) {
      setError(getKeywordErrorMessage(cancelError))
    }
  }

  return (
    <div className="w-full pb-8">
      {error ? (
        <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {!canDiscover ? (
        <div className="mb-4 rounded-md border border-yellow-300/40 bg-yellow-100/40 px-3 py-2 text-sm text-yellow-900 dark:border-yellow-900/40 dark:bg-yellow-950/30 dark:text-yellow-200">
          {!project.domain
            ? "Set a domain in Settings → Project to discover link prospects."
            : "Add at least one competitor on the Competitors tab to discover link prospects."}
        </div>
      ) : null}

      <BacklinkSummaryTiles summary={summary} counts={counts} />

      <DashboardTable
        title="Backlink Prospects"
        icon={<Link2Icon className="size-4 text-muted-foreground sm:size-[18px]" />}
        count={total}
        status={status}
        controls={
          <>
            {latestJob?.status === "failed" ? (
              <DashboardToolbarButton
                type="button"
                variant="outline"
                onClick={() => void handleRetry(latestJob.id)}
              >
                <RotateCcwIcon className="size-4" />
                Retry
              </DashboardToolbarButton>
            ) : null}
            {hasActiveJob && latestJob ? (
              <DashboardToolbarButton
                type="button"
                variant="outline"
                onClick={() => void handleCancel(latestJob.id)}
              >
                <XIcon className="size-4" />
                Cancel
              </DashboardToolbarButton>
            ) : null}
            <DashboardToolbarSearch
              name="backlinks-search"
              aria-label="Search prospect domains"
              placeholder="Search domains..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
            <Select
              value={statusFilter}
              onValueChange={(value) => setStatusFilter(value as StatusFilter)}
            >
              <DashboardToolbarSelectTrigger aria-label="Filter by status">
                <SelectValue />
              </DashboardToolbarSelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {BACKLINK_PROSPECT_STATUSES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {backlinkProspectStatusLabels[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <DashboardToolbarButton
              type="button"
              variant="outline"
              disabled={actionBusy || total === 0}
              onClick={() => void handleExport()}
            >
              <DownloadIcon className="size-4" />
              Export
            </DashboardToolbarButton>
            <DashboardToolbarButton
              type="button"
              variant="outline"
              onClick={() => setAddOpen(true)}
            >
              <PlusIcon className="size-4" />
              Add Prospect
            </DashboardToolbarButton>
            <DashboardToolbarButton
              type="button"
              disabled={actionBusy || hasActiveJob || !canDiscover}
              onClick={() => void startDiscovery()}
            >
              {actionBusy ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <SearchIcon className="size-4" />
              )}
              Find Prospects
            </DashboardToolbarButton>
          </>
        }
        header={
          <TableHeader>
            <TableRow>
              <TableHead column="main">
                <TableSortButton
                  active={sort.field === "domain"}
                  direction={sort.direction}
                  onClick={() => toggleSort("domain")}
                >
                  Domain
                </TableSortButton>
              </TableHead>
              <TableHead column="meta">
                <TableSortButton
                  active={sort.field === "domainRank"}
                  direction={sort.direction}
                  onClick={() => toggleSort("domainRank")}
                >
                  DR
                </TableSortButton>
              </TableHead>
              <TableHead column="meta" className="hidden lg:table-cell">
                Links to
              </TableHead>
              <TableHead column="meta">
                <TableSortButton
                  active={sort.field === "status"}
                  direction={sort.direction}
                  onClick={() => toggleSort("status")}
                >
                  Status
                </TableSortButton>
              </TableHead>
              <TableHead column="meta" className="hidden xl:table-cell">
                Contact
              </TableHead>
              <TableHead column="meta" className="hidden md:table-cell">
                <TableSortButton
                  active={sort.field === "updatedAt"}
                  direction={sort.direction}
                  onClick={() => toggleSort("updatedAt")}
                >
                  Updated
                </TableSortButton>
              </TableHead>
              <TableHead column="meta">Actions</TableHead>
            </TableRow>
          </TableHeader>
        }
        isEmpty={!loading && rows.length === 0}
        emptyText={
          statusFilter !== "all" || debouncedQuery
            ? "No prospects match the current filters."
            : 'No prospects yet. Run "Find Prospects" to discover domains that link to your competitors but not to you.'
        }
        emptyColSpan={7}
        footer={{
          type: "pagination",
          page,
          pageSize,
          total,
          totalPages,
          pageSizeOptions: [10, 25, 50, 100],
          onPageChange: (nextPage) =>
            setPage(Math.max(1, Math.min(nextPage, totalPages))),
          onPageSizeChange: setPageSize,
        }}
      >
        {rows.map((row) => (
          <TableRow key={row.id} className="group">
            <TableCell column="main">
              <div className="max-w-full truncate text-xs font-medium sm:text-sm">
                <a
                  href={`https://${row.normalizedDomain}`}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="group-hover:underline"
                  title={row.referringDomain}
                >
                  {row.referringDomain}
                </a>
              </div>
              {row.notes ? (
                <div
                  className="max-w-64 truncate text-xs text-muted-foreground"
                  title={row.notes}
                >
                  {row.notes}
                </div>
              ) : null}
            </TableCell>
            <TableCell column="meta">{row.domainRank ?? "—"}</TableCell>
            <TableCell column="mutedMeta" className="hidden lg:table-cell">
              {row.referringTo.length ? (
                <div className="flex max-w-56 flex-wrap gap-1">
                  {row.referringTo.slice(0, 3).map((domain) => (
                    <Badge key={domain} variant="outline" className="text-[10px]">
                      {domain}
                    </Badge>
                  ))}
                  {row.referringTo.length > 3 ? (
                    <Badge variant="outline" className="text-[10px]">
                      +{row.referringTo.length - 3}
                    </Badge>
                  ) : null}
                </div>
              ) : (
                <span className="text-xs">Manual</span>
              )}
            </TableCell>
            <TableCell column="meta">
              <Select
                value={row.status}
                onValueChange={(value) =>
                  void changeStatus(row, value as BacklinkProspectStatus)
                }
              >
                <SelectTrigger
                  aria-label={`Status for ${row.referringDomain}`}
                >
                  <SelectValue>
                    <Badge
                      variant="secondary"
                      className={statusBadgeClassNames[row.status]}
                    >
                      {backlinkProspectStatusLabels[row.status]}
                    </Badge>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent position="popper">
                  {BACKLINK_PROSPECT_STATUSES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {backlinkProspectStatusLabels[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </TableCell>
            <TableCell column="mutedMeta" className="hidden xl:table-cell">
              {row.contactEmail || row.contactUrl ? (
                <span
                  className="inline-block max-w-48 truncate align-middle"
                  title={row.contactEmail ?? row.contactUrl ?? ""}
                >
                  {row.contactEmail ?? row.contactUrl}
                </span>
              ) : (
                "—"
              )}
            </TableCell>
            <TableCell column="mutedMeta" className="hidden md:table-cell">
              {dateFormatter.format(new Date(row.updatedAt))}
            </TableCell>
            <TableCell column="meta">
              <div className="flex items-center">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setEditing(row)}
                  title="Edit contact & notes"
                  aria-label="Edit contact & notes"
                >
                  <PencilIcon className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setPendingDelete(row)}
                  title="Delete prospect"
                  aria-label="Delete prospect"
                >
                  <Trash2Icon className="size-4" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </DashboardTable>

      <AddProspectDialog
        projectId={projectId}
        open={addOpen}
        onOpenChange={setAddOpen}
        onAdded={() => setRefreshToken((token) => token + 1)}
      />
      <EditProspectDialog
        projectId={projectId}
        prospect={editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
        onSaved={() => setRefreshToken((token) => token + 1)}
      />
      <DeleteProspectDialog
        prospect={pendingDelete}
        deleting={actionBusy}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null)
        }}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  )
}

function BacklinkSummaryTiles({
  summary,
  counts,
}: {
  summary: BacklinkSummary | null
  counts: Record<BacklinkProspectStatus, number> | null
}) {
  return (
    <div className="mb-4 grid gap-3 sm:grid-cols-2">
      <div className="rounded-xl bg-card p-4 text-card-foreground ring-1 ring-foreground/10">
        <div className="mb-2 text-xs font-medium text-muted-foreground">
          Your backlink profile
          {summary
            ? ` · ${summary.target} · ${dateFormatter.format(new Date(summary.fetchedAt))}`
            : ""}
        </div>
        {summary ? (
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <SummaryStat
              label="Referring domains"
              value={summary.referringDomains}
            />
            <SummaryStat label="Backlinks" value={summary.backlinks} />
            <SummaryStat label="Domain rank" value={summary.domainRank} />
            <SummaryStat label="Broken" value={summary.brokenBacklinks} />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No profile snapshot yet. "Find Prospects" also refreshes your
            domain's backlink summary.
          </p>
        )}
      </div>
      <div className="rounded-xl bg-card p-4 text-card-foreground ring-1 ring-foreground/10">
        <div className="mb-2 text-xs font-medium text-muted-foreground">
          Outreach pipeline
        </div>
        <div className="min-h-7">
          {counts ? (
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {BACKLINK_PROSPECT_STATUSES.map((status) => (
                <SummaryStat
                  key={status}
                  label={backlinkProspectStatusLabels[status]}
                  value={counts[status]}
                />
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function SummaryStat({
  label,
  value,
}: {
  label: string
  value: number | null
}) {
  return (
    <div>
      <div className="text-lg font-semibold tabular-nums">
        {value != null ? numberFormatter.format(value) : "—"}
      </div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  )
}

function AddProspectDialog({
  projectId,
  open,
  onOpenChange,
  onAdded,
}: {
  projectId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdded: () => void
}) {
  const [domain, setDomain] = React.useState("")
  const [contactEmail, setContactEmail] = React.useState("")
  const [contactUrl, setContactUrl] = React.useState("")
  const [notes, setNotes] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (open) {
      setDomain("")
      setContactEmail("")
      setContactUrl("")
      setNotes("")
      setError(null)
    }
  }, [open])

  async function save() {
    if (!domain.trim()) {
      setError("Enter a domain.")
      return
    }
    setBusy(true)
    setError(null)
    try {
      await addProspect({
        projectId,
        domain,
        contactEmail: contactEmail || undefined,
        contactUrl: contactUrl || undefined,
        notes: notes || undefined,
      })
      onAdded()
      onOpenChange(false)
    } catch (saveError) {
      setError(getBacklinkErrorMessage(saveError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>Add Prospect</DialogTitle>
          <DialogDescription>
            Track a link-building target that discovery did not find.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="prospect-domain">Domain</Label>
            <Input
              id="prospect-domain"
              placeholder="blog.example.com"
              value={domain}
              disabled={busy}
              onChange={(event) => setDomain(event.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="prospect-email">Contact email</Label>
              <Input
                id="prospect-email"
                placeholder="editor@example.com"
                value={contactEmail}
                disabled={busy}
                onChange={(event) => setContactEmail(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="prospect-url">Contact URL</Label>
              <Input
                id="prospect-url"
                placeholder="https://example.com/contact"
                value={contactUrl}
                disabled={busy}
                onChange={(event) => setContactUrl(event.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="prospect-notes">Notes</Label>
            <Textarea
              id="prospect-notes"
              rows={3}
              value={notes}
              disabled={busy}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>
          {error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}
        </DialogBody>
        <DialogFooter variant="plain">
          <>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="button" disabled={busy} onClick={() => void save()}>
              {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
              {busy ? "Adding..." : "Add Prospect"}
            </Button>
          </>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EditProspectDialog({
  projectId,
  prospect,
  onOpenChange,
  onSaved,
}: {
  projectId: string
  prospect: BacklinkProspect | null
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const [status, setStatus] = React.useState<BacklinkProspectStatus>("new")
  const [contactEmail, setContactEmail] = React.useState("")
  const [contactUrl, setContactUrl] = React.useState("")
  const [notes, setNotes] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (prospect) {
      setStatus(prospect.status)
      setContactEmail(prospect.contactEmail ?? "")
      setContactUrl(prospect.contactUrl ?? "")
      setNotes(prospect.notes ?? "")
      setError(null)
    }
  }, [prospect])

  async function save() {
    if (!prospect) return
    setBusy(true)
    setError(null)
    try {
      await updateProspect({
        projectId,
        prospectId: prospect.id,
        status,
        contactEmail,
        contactUrl,
        notes,
      })
      onSaved()
      onOpenChange(false)
    } catch (saveError) {
      setError(getBacklinkErrorMessage(saveError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={Boolean(prospect)} onOpenChange={onOpenChange}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>{prospect?.referringDomain ?? "Prospect"}</DialogTitle>
          <DialogDescription>
            Outreach status, contact details, and notes for this prospect.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="edit-prospect-status">Status</Label>
            <Select
              value={status}
              disabled={busy}
              onValueChange={(value) =>
                setStatus(value as BacklinkProspectStatus)
              }
            >
              <SelectTrigger id="edit-prospect-status" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BACKLINK_PROSPECT_STATUSES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {backlinkProspectStatusLabels[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="edit-prospect-email">Contact email</Label>
              <Input
                id="edit-prospect-email"
                placeholder="editor@example.com"
                value={contactEmail}
                disabled={busy}
                onChange={(event) => setContactEmail(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-prospect-url">Contact URL</Label>
              <Input
                id="edit-prospect-url"
                placeholder="https://example.com/contact"
                value={contactUrl}
                disabled={busy}
                onChange={(event) => setContactUrl(event.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-prospect-notes">Notes</Label>
            <Textarea
              id="edit-prospect-notes"
              rows={4}
              placeholder="Replied 7/3, sending draft next week..."
              value={notes}
              disabled={busy}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>
          {error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}
        </DialogBody>
        <DialogFooter variant="plain">
          <>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="button" disabled={busy} onClick={() => void save()}>
              {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
              {busy ? "Saving..." : "Save"}
            </Button>
          </>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DeleteProspectDialog({
  prospect,
  deleting,
  onOpenChange,
  onConfirm,
}: {
  prospect: BacklinkProspect | null
  deleting: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}) {
  return (
    <Dialog open={Boolean(prospect)} onOpenChange={onOpenChange}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>Delete Prospect</DialogTitle>
          <DialogDescription>
            Contact details and notes for this prospect are removed. Discovery
            can re-add the domain with a fresh "new" status.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <p className="text-sm">
            Delete{" "}
            <span className="font-medium">
              {prospect?.referringDomain ?? "this prospect"}
            </span>
            ?
          </p>
        </DialogBody>
        <DialogFooter variant="plain">
          <>
            <Button
              type="button"
              variant="outline"
              disabled={deleting}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleting}
              onClick={onConfirm}
            >
              {deleting ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <Trash2Icon className="size-4" />
              )}
              Delete
            </Button>
          </>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
