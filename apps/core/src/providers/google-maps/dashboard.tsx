import * as React from "react"
import { Link } from "@tanstack/react-router"
import {
  MapPinnedIcon,
  Loader2Icon,
  PlayIcon,
  PlusIcon,
  RefreshCwIcon,
  SettingsIcon,
  Trash2Icon,
} from "lucide-react"

import { DashboardTable } from "@/components/dashboard-table"
import {
  DashboardToolbarSearch,
  DashboardToolbarSelectTrigger,
} from "@/components/dashboard-toolbar"
import { Badge } from "@/components/ui/badge"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
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
  TableSortButton,
  TableRow,
} from "@/components/ui/table"
import {
  deleteGoogleMapsResults,
  deleteGoogleMapsRuns,
  loadGoogleMapsRun,
  loadGoogleMapsRuns,
  refreshGoogleMapsExecution,
  saveGoogleMapsRun,
  providerError,
  startGoogleMapsRun,
  updateGoogleMapsResult,
} from "@/providers/google-maps/api"
import { parseRunInput } from "@/providers/google-maps/schema"
import type { ProviderResultItem, ProviderRunConfigItem, ProviderRunConfigStatus } from "@/providers/types"

type RunForm = {
  name: string
  keyword: string
  location: string
  language: string
  maxResults: number
  status: ProviderRunConfigStatus
}
type ResultForm = {
  title: string
  category: string
  categoryName: string
  address: string
  street: string
  city: string
  state: string
  countryCode: string
  rating: string
  reviewCount: string
  phone: string
  website: string
}
type ResultSortColumn = "title" | "address" | "rating" | "reviews" | "phone" | "website" | "created"
type RunSortColumn = "name" | "location" | "limit" | "amount" | "status"
type SortDirection = "asc" | "desc"

const statusLabels = {
  all: "All statuses",
  active: "Active",
  draft: "Draft",
  inactive: "Inactive",
} as const
const pageSizes = [10, 25, 50]
const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
})

export function GoogleMapsDashboard() {
  const [runs, setRuns] = React.useState<ProviderRunConfigItem[]>([])
  const [hasToken, setHasToken] = React.useState<boolean | null>(null)
  const [defaultMax, setDefaultMax] = React.useState(25)
  const [query, setQuery] = React.useState("")
  const [status, setStatus] = React.useState<keyof typeof statusLabels>("all")
  const [runSortColumn, setRunSortColumn] = React.useState<RunSortColumn | null>(null)
  const [runSortDirection, setRunSortDirection] = React.useState<SortDirection>("asc")
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(10)
  const [saving, setSaving] = React.useState(false)
  const [message, setMessage] = React.useState<{ tone: "error" | "success"; text: string } | null>(null)
  const [editing, setEditing] = React.useState<ProviderRunConfigItem | null>(null)
  const [selectedRunIds, setSelectedRunIds] = React.useState<Set<string>>(new Set())
  const [deleteRunIds, setDeleteRunIds] = React.useState<string[]>([])
  const [deletingRuns, setDeletingRuns] = React.useState(false)
  const [open, setOpen] = React.useState(false)
  const [form, setForm] = React.useState<RunForm>(() => emptyForm(25))

  React.useEffect(() => {
    void loadGoogleMapsRuns()
      .then(({ runs, settings }) => {
        setRuns(runs)
        setHasToken(settings.has_token)
        setDefaultMax(settings.default_max_results)
      })
      .catch((error) => setMessage({ tone: "error", text: providerError(error) }))
  }, [])

  const filtered = runs.filter((run) => {
    const input = parseRunInput(run.input)
    const term = query.trim().toLowerCase()
    return (status === "all" || run.status === status) &&
      (!term || [run.name, input.keyword, input.location].some((value) => value.toLowerCase().includes(term)))
  }).sort((a, b) => {
    if (!runSortColumn) return 0
    const direction = runSortDirection === "asc" ? 1 : -1
    const aInput = parseRunInput(a.input)
    const bInput = parseRunInput(b.input)
    if (runSortColumn === "name") return a.name.localeCompare(b.name) * direction
    if (runSortColumn === "location") return aInput.location.localeCompare(bInput.location) * direction
    if (runSortColumn === "limit") return (aInput.maxResults - bInput.maxResults) * direction
    if (runSortColumn === "amount") return (a.amount - b.amount) * direction
    return a.status.localeCompare(b.status) * direction
  })
  const totalPages = Math.ceil(filtered.length / pageSize)
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize)
  const visibleRunIds = visible.map((run) => run.id)
  const visibleRunsSelected = visibleRunIds.length > 0 && visibleRunIds.every((id) => selectedRunIds.has(id))
  const visibleRunsIndeterminate = !visibleRunsSelected && visibleRunIds.some((id) => selectedRunIds.has(id))

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(1)
  }, [query, status, pageSize, runSortColumn, runSortDirection])

  const toggleRunSort = (column: RunSortColumn) => {
    if (runSortColumn === column) {
      if (runSortDirection === "desc") {
        setRunSortColumn(null)
        setRunSortDirection("asc")
      } else {
        setRunSortDirection("desc")
      }
      return
    }

    setRunSortColumn(column)
    setRunSortDirection("asc")
  }

  const edit = (run?: ProviderRunConfigItem) => {
    setEditing(run ?? null)
    setForm(run ? { name: run.name, status: run.status, ...parseRunInput(run.input) } : emptyForm(defaultMax))
    setOpen(true)
  }

  const save = async () => {
    setSaving(true)
    setMessage(null)
    try {
      const { run } = await saveGoogleMapsRun({ ...form, runId: editing?.id })
      setRuns((current) => editing ? current.map((item) => item.id === run.id ? run : item) : [run, ...current])
      setMessage({ tone: "success", text: editing ? "Run updated." : "Run created." })
      setOpen(false)
    } catch (error) {
      setMessage({ tone: "error", text: providerError(error) })
    } finally {
      setSaving(false)
    }
  }

  const start = async (run: ProviderRunConfigItem) => {
    setMessage(null)
    try {
      await startGoogleMapsRun(run.id)
      setMessage({ tone: "success", text: `Started ${run.name}.` })
    } catch (error) {
      setMessage({ tone: "error", text: providerError(error) })
    }
  }

  const toggleVisibleRuns = (checked: boolean) => {
    setSelectedRunIds((current) => {
      const next = new Set(current)
      visibleRunIds.forEach((id) => checked ? next.add(id) : next.delete(id))
      return next
    })
  }

  const toggleRun = (id: string, checked: boolean) => {
    setSelectedRunIds((current) => {
      const next = new Set(current)
      checked ? next.add(id) : next.delete(id)
      return next
    })
  }

  const deleteRuns = async (ids: string[]) => {
    if (!ids.length) return
    setDeletingRuns(true)
    setMessage(null)
    try {
      await deleteGoogleMapsRuns(ids)
      setRuns((current) => current.filter((run) => !ids.includes(run.id)))
      setSelectedRunIds((current) => {
        const next = new Set(current)
        ids.forEach((id) => next.delete(id))
        return next
      })
      setDeleteRunIds([])
      setPage(1)
      setMessage({ tone: "success", text: ids.length === 1 ? "Data source deleted." : "Data sources deleted." })
    } catch (error) {
      setMessage({ tone: "error", text: providerError(error) })
    } finally {
      setDeletingRuns(false)
    }
  }

  return (
    <div className="w-full pb-8">
      <DashboardTable
        title="Google Maps"
        icon={<MapPinnedIcon className="size-4 text-muted-foreground sm:size-[18px]" />}
        count={filtered.length}
        status={message ?? (hasToken === false ? { tone: "error", text: "Add an Apify API token in provider settings before starting runs." } : null)}
        selectedCount={selectedRunIds.size}
        onClearSelection={() => setSelectedRunIds(new Set())}
        controls={
          <>
            {selectedRunIds.size ? (
              <Button variant="destructive" size="sm" className="h-8 gap-2 sm:h-9" onClick={() => setDeleteRunIds(Array.from(selectedRunIds))}>
                <Trash2Icon className="size-4" />
                Delete ({selectedRunIds.size})
              </Button>
            ) : null}
            <DashboardToolbarSearch value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search data sources..." />
            <Select value={status} onValueChange={(value) => setStatus(value as keyof typeof statusLabels)}>
              <DashboardToolbarSelectTrigger aria-label="Filter by status" labels={Object.values(statusLabels)}>
                <SelectValue />
              </DashboardToolbarSelectTrigger>
              <SelectContent>
                {Object.entries(statusLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button asChild variant="outline" size="sm" className="h-8 gap-2 sm:h-9">
              <Link to="/admin/settings/$tab" params={{ tab: "providers" }}>
                <SettingsIcon className="size-4" />
                Settings
              </Link>
            </Button>
            <Button size="sm" className="h-8 gap-2 sm:h-9" onClick={() => edit()}>
              <PlusIcon className="size-4" />
              Add Run
            </Button>
          </>
        }
        header={
          <TableHeader>
            <TableRow>
              <TableHead column="select">
                <Checkbox checked={visibleRunsSelected ? true : visibleRunsIndeterminate ? "indeterminate" : false} onCheckedChange={(checked) => toggleVisibleRuns(checked === true)} aria-label="Select visible runs" />
              </TableHead>
              <TableHead column="main"><TableSortButton active={runSortColumn === "name"} direction={runSortDirection} onClick={() => toggleRunSort("name")}>Run Name</TableSortButton></TableHead>
              <TableHead column="meta"><TableSortButton active={runSortColumn === "location"} direction={runSortDirection} onClick={() => toggleRunSort("location")}>Location</TableSortButton></TableHead>
              <TableHead column="meta"><TableSortButton active={runSortColumn === "limit"} direction={runSortDirection} onClick={() => toggleRunSort("limit")}>Limit</TableSortButton></TableHead>
              <TableHead column="meta"><TableSortButton active={runSortColumn === "amount"} direction={runSortDirection} onClick={() => toggleRunSort("amount")}>Amount</TableSortButton></TableHead>
              <TableHead column="meta"><TableSortButton active={runSortColumn === "status"} direction={runSortDirection} onClick={() => toggleRunSort("status")}>Status</TableSortButton></TableHead>
              <TableHead column="meta">Actions</TableHead>
            </TableRow>
          </TableHeader>
        }
        isEmpty={visible.length === 0}
        emptyText="No data sources found."
        emptyColSpan={7}
        footer={{
          type: "pagination",
          page,
          pageSize,
          total: filtered.length,
          totalPages,
          pageSizeOptions: pageSizes,
          onPageChange: setPage,
          onPageSizeChange: setPageSize,
        }}
      >
        {visible.map((run) => {
          const input = parseRunInput(run.input)
          return (
            <TableRow key={run.id} data-state={selectedRunIds.has(run.id) ? "selected" : undefined}>
              <TableCell column="select">
                <Checkbox checked={selectedRunIds.has(run.id)} onCheckedChange={(checked) => toggleRun(run.id, checked === true)} aria-label={`Select ${run.name}`} />
              </TableCell>
              <TableCell column="main">
                <Link className="font-medium hover:underline" to="/admin/datasource/google-maps/runs/$runId" params={{ runId: run.id }}>{run.name}</Link>
                <div className="text-xs text-muted-foreground">{input.keyword}</div>
              </TableCell>
              <TableCell column="meta">{input.location}</TableCell>
              <TableCell column="meta">{input.maxResults}</TableCell>
              <TableCell column="meta">{run.amount}</TableCell>
              <TableCell column="meta"><StatusBadge status={run.status} /></TableCell>
              <TableCell column="meta">
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon-sm" onClick={() => edit(run)} aria-label={`Edit ${run.name}`}>
                    <SettingsIcon className="size-4" />
                  </Button>
                  <Button variant="ghost" size="icon-sm" disabled={run.status !== "active"} onClick={() => void start(run)} aria-label={`Start ${run.name}`}>
                    <PlayIcon className="size-4" />
                  </Button>
                  <Button variant="ghost" size="icon-sm" onClick={() => setDeleteRunIds([run.id])} aria-label={`Delete ${run.name}`}>
                    <Trash2Icon className="size-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          )
        })}
      </DashboardTable>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Run" : "Add Run"}</DialogTitle>
            <DialogDescription>
              Save a reusable Google Maps search.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="grid gap-4 sm:grid-cols-2">
          <RunField id="name" label="Name (optional)" value={form.name} onChange={(value) => setForm({ ...form, name: value })} />
          <RunField id="keyword" label="Keyword" value={form.keyword} onChange={(value) => setForm({ ...form, keyword: value })} />
          <RunField id="location" label="Location" value={form.location} onChange={(value) => setForm({ ...form, location: value })} />
          <RunField id="language" label="Language" value={form.language} onChange={(value) => setForm({ ...form, language: value })} />
          <RunField id="max-results" label="Max results" type="number" value={form.maxResults} onChange={(value) => setForm({ ...form, maxResults: Number(value) })} />
          <div className="grid gap-2">
            <Label htmlFor="status">Status</Label>
            <Select value={form.status} onValueChange={(value) => setForm({ ...form, status: value as ProviderRunConfigStatus })}>
              <SelectTrigger id="status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
          </DialogBody>
          <DialogFooter variant="plain">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={saving} onClick={() => void save()}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteRunsDialog
        count={deleteRunIds.length}
        deleting={deletingRuns}
        open={deleteRunIds.length > 0}
        onOpenChange={(open) => !open && setDeleteRunIds([])}
        onConfirm={() => void deleteRuns(deleteRunIds)}
      />
    </div>
  )
}

function DeleteRunsDialog({
  count,
  deleting,
  open,
  onOpenChange,
  onConfirm,
}: {
  count: number
  deleting: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>Delete {count} {count === 1 ? "Run" : "Runs"}</DialogTitle>
          <DialogDescription>This also deletes all executions and results in the selected {count === 1 ? "run" : "runs"}.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete {count} selected {count === 1 ? "run" : "runs"}?
          </p>
        </DialogBody>
        <DialogFooter variant="plain">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={deleting}>Cancel</Button>
          <Button variant="destructive" onClick={onConfirm} disabled={deleting || count === 0}>
            {deleting ? <Loader2Icon className="size-4 animate-spin" /> : <Trash2Icon className="size-4" />}
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function GoogleMapsRunResults({ runId }: { runId: string }) {
  const [data, setData] = React.useState<Awaited<ReturnType<typeof loadGoogleMapsRun>> | null>(null)
  const [query, setQuery] = React.useState("")
  const [sortColumn, setSortColumn] = React.useState<ResultSortColumn | null>("created")
  const [sortDirection, setSortDirection] = React.useState<SortDirection>("desc")
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(10)
  const [message, setMessage] = React.useState<{ tone: "error" | "success"; text: string } | null>(null)
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const [editingResult, setEditingResult] = React.useState<ProviderResultItem | null>(null)
  const [deleteIds, setDeleteIds] = React.useState<string[]>([])
  const [deletingResults, setDeletingResults] = React.useState(false)
  const [savingResult, setSavingResult] = React.useState(false)
  const [resultForm, setResultForm] = React.useState<ResultForm>(emptyResultForm())

  const load = React.useCallback(async () => {
    try {
      setData(await loadGoogleMapsRun(runId))
    } catch (error) {
      setMessage({ tone: "error", text: providerError(error) })
    }
  }, [runId])

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  React.useEffect(() => {
    if (message?.text !== "Run refreshed.") return
    const timeout = window.setTimeout(() => setMessage(null), 3000)
    return () => window.clearTimeout(timeout)
  }, [message])

  const results = (data?.results ?? []).filter((result) => {
    const term = query.trim().toLowerCase()
    const row = result.data
    return !term || [result.title, row.category, row.address, row.phone, row.website].some((value) => typeof value === "string" && value.toLowerCase().includes(term))
  }).sort((a, b) => {
    if (!sortColumn) return 0
    const direction = sortDirection === "asc" ? 1 : -1
    if (sortColumn === "title") return a.title.localeCompare(b.title) * direction
    if (sortColumn === "address") return locationText(a.data).localeCompare(locationText(b.data)) * direction
    if (sortColumn === "rating") return (number(a.data.rating) - number(b.data.rating)) * direction
    if (sortColumn === "reviews") return (number(a.data.reviewCount) - number(b.data.reviewCount)) * direction
    if (sortColumn === "phone") return (text(a.data.phone) ?? "").localeCompare(text(b.data.phone) ?? "") * direction
    if (sortColumn === "website") return (text(a.data.website) ?? "").localeCompare(text(b.data.website) ?? "") * direction
    return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * direction
  })
  const totalPages = Math.ceil(results.length / pageSize)
  const visibleResults = results.slice((page - 1) * pageSize, page * pageSize)
  const visibleIds = visibleResults.map((result) => result.id)
  const visibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id))
  const visibleIndeterminate = !visibleSelected && visibleIds.some((id) => selectedIds.has(id))

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(1)
  }, [query, pageSize, sortColumn, sortDirection])

  const toggleSort = (column: ResultSortColumn) => {
    if (sortColumn === column) {
      if (sortDirection === "desc") {
        setSortColumn(null)
        setSortDirection("asc")
      } else {
        setSortDirection("desc")
      }
      return
    }

    setSortColumn(column)
    setSortDirection("asc")
  }

  const startRun = async () => {
    setMessage(null)
    try {
      await startGoogleMapsRun(runId)
      await load()
      setMessage({ tone: "success", text: "Run started." })
    } catch (error) {
      setMessage({ tone: "error", text: providerError(error) })
    }
  }

  const refreshLatestExecution = async () => {
    if (!data?.latest_execution) return
    setMessage(null)
    try {
      await refreshGoogleMapsExecution(data.latest_execution.id)
      await load()
      setMessage({ tone: "success", text: "Run refreshed." })
    } catch (error) {
      setMessage({ tone: "error", text: providerError(error) })
    }
  }

  const toggleVisible = (checked: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      visibleIds.forEach((id) => checked ? next.add(id) : next.delete(id))
      return next
    })
  }

  const toggleResult = (id: string, checked: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      checked ? next.add(id) : next.delete(id)
      return next
    })
  }

  const editResult = (result: ProviderResultItem) => {
    setEditingResult(result)
    setResultForm({
      title: result.title,
      category: text(result.data.category) ?? "",
      categoryName: text(result.data.categoryName) ?? "",
      address: text(result.data.address) ?? "",
      street: text(result.data.street) ?? "",
      city: text(result.data.city) ?? "",
      state: text(result.data.state) ?? "",
      countryCode: text(result.data.countryCode) ?? "",
      rating: typeof result.data.rating === "number" ? String(result.data.rating) : "",
      reviewCount: typeof result.data.reviewCount === "number" ? String(result.data.reviewCount) : "",
      phone: text(result.data.phone) ?? "",
      website: text(result.data.website) ?? "",
    })
  }

  const saveResult = async () => {
    if (!editingResult) return
    setSavingResult(true)
    setMessage(null)
    try {
      await updateGoogleMapsResult({
        runId,
        resultId: editingResult.id,
        title: resultForm.title,
        category: resultForm.category,
        categoryName: resultForm.categoryName,
        address: resultForm.address,
        street: resultForm.street,
        city: resultForm.city,
        state: resultForm.state,
        countryCode: resultForm.countryCode,
        rating: resultForm.rating.trim() ? Number(resultForm.rating) : null,
        reviewCount: resultForm.reviewCount.trim() ? Number(resultForm.reviewCount) : null,
        phone: resultForm.phone,
        website: resultForm.website,
      })
      setEditingResult(null)
      await load()
      setMessage({ tone: "success", text: "Result updated." })
    } catch (error) {
      setMessage({ tone: "error", text: providerError(error) })
    } finally {
      setSavingResult(false)
    }
  }

  const deleteResults = async (ids: string[]) => {
    if (!ids.length) return
    setDeletingResults(true)
    setMessage(null)
    try {
      await deleteGoogleMapsResults(runId, ids)
      setSelectedIds((current) => {
        const next = new Set(current)
        ids.forEach((id) => next.delete(id))
        return next
      })
      setDeleteIds([])
      setPage(1)
      await load()
      setMessage({ tone: "success", text: ids.length === 1 ? "Result deleted." : "Results deleted." })
    } catch (error) {
      setMessage({ tone: "error", text: providerError(error) })
    } finally {
      setDeletingResults(false)
    }
  }

  return (
    <div className="w-full pb-8">
      <DashboardTable
        icon={<MapPinnedIcon className="size-4 text-muted-foreground sm:size-[18px]" />}
        title={<GoogleMapsResultsBreadcrumb title={data?.run.name ?? "Results"} />}
        count={results.length}
        status={message}
        selectedCount={selectedIds.size}
        onClearSelection={() => setSelectedIds(new Set())}
        controls={
          <>
            {selectedIds.size ? (
              <Button variant="destructive" size="sm" className="h-8 gap-2 sm:h-9" onClick={() => setDeleteIds(Array.from(selectedIds))}>
                <Trash2Icon className="size-4" />
                Delete ({selectedIds.size})
              </Button>
            ) : null}
            <DashboardToolbarSearch value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search results..." />
            {data?.latest_execution ? (
              <Button variant="outline" size="sm" className="h-8 gap-2 sm:h-9" onClick={() => void refreshLatestExecution()}>
                <RefreshCwIcon className="size-4" />
                Refresh
              </Button>
            ) : null}
            <Button size="sm" className="h-8 gap-2 sm:h-9" disabled={!data || data.run.status !== "active"} onClick={() => void startRun()}>
              <PlayIcon className="size-4" />
              Run now
            </Button>
          </>
        }
        header={
          <TableHeader>
            <TableRow>
              <TableHead column="select">
                <Checkbox checked={visibleSelected ? true : visibleIndeterminate ? "indeterminate" : false} onCheckedChange={(checked) => toggleVisible(checked === true)} aria-label="Select visible results" />
              </TableHead>
              <TableHead column="main"><TableSortButton active={sortColumn === "title"} direction={sortDirection} onClick={() => toggleSort("title")}>Business</TableSortButton></TableHead>
              <TableHead column="preview" className="w-64 max-w-64"><TableSortButton active={sortColumn === "address"} direction={sortDirection} onClick={() => toggleSort("address")}>Address</TableSortButton></TableHead>
              <TableHead column="meta"><TableSortButton active={sortColumn === "rating"} direction={sortDirection} onClick={() => toggleSort("rating")}>Rating</TableSortButton></TableHead>
              <TableHead column="meta"><TableSortButton active={sortColumn === "reviews"} direction={sortDirection} onClick={() => toggleSort("reviews")}>Reviews</TableSortButton></TableHead>
              <TableHead column="meta"><TableSortButton active={sortColumn === "phone"} direction={sortDirection} onClick={() => toggleSort("phone")}>Phone</TableSortButton></TableHead>
              <TableHead column="meta"><TableSortButton active={sortColumn === "website"} direction={sortDirection} onClick={() => toggleSort("website")}>Website</TableSortButton></TableHead>
              <TableHead column="meta"><TableSortButton active={sortColumn === "created"} direction={sortDirection} onClick={() => toggleSort("created")}>Date added</TableSortButton></TableHead>
              <TableHead column="meta">Actions</TableHead>
            </TableRow>
          </TableHeader>
        }
        isEmpty={results.length === 0}
        emptyText="No results found."
        emptyColSpan={9}
        footer={{
          type: "pagination",
          page,
          pageSize,
          total: results.length,
          totalPages,
          pageSizeOptions: pageSizes,
          onPageChange: setPage,
          onPageSizeChange: setPageSize,
        }}
      >
        {visibleResults.map((result) => {
          const websiteHref = safeExternalHref(text(result.data.website))
          return (
            <TableRow key={result.id} data-state={selectedIds.has(result.id) ? "selected" : undefined}>
              <TableCell column="select">
                <Checkbox checked={selectedIds.has(result.id)} onCheckedChange={(checked) => toggleResult(result.id, checked === true)} aria-label={`Select ${result.title}`} />
              </TableCell>
              <TableCell column="main">
                <button type="button" className="font-medium text-left hover:underline" onClick={() => editResult(result)}>{result.title}</button>
                <div className="text-xs text-muted-foreground">{text(result.data.categoryName) ?? text(result.data.category) ?? "Uncategorized"}</div>
              </TableCell>
              <TableCell column="preview" className="w-64 max-w-64 truncate">{locationText(result.data)}</TableCell>
              <TableCell column="meta">{typeof result.data.rating === "number" ? result.data.rating : "Unknown"}</TableCell>
              <TableCell column="meta">{typeof result.data.reviewCount === "number" ? result.data.reviewCount : "Unknown"}</TableCell>
              <TableCell column="meta">{text(result.data.phone) ?? "Unknown"}</TableCell>
              <TableCell column="meta">{websiteHref ? <Button asChild variant="outline" size="sm" className="h-8 sm:h-9"><a href={websiteHref} target="_blank" rel="noopener noreferrer">Visit</a></Button> : "None"}</TableCell>
              <TableCell column="meta">{dateFormatter.format(new Date(result.created_at))}</TableCell>
              <TableCell column="meta">
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon-sm" onClick={() => editResult(result)} aria-label={`Edit ${result.title}`}>
                    <SettingsIcon className="size-4" />
                  </Button>
                  <Button variant="ghost" size="icon-sm" onClick={() => setDeleteIds([result.id])} aria-label={`Delete ${result.title}`}>
                    <Trash2Icon className="size-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          )
        })}
      </DashboardTable>

      <Dialog open={Boolean(editingResult)} onOpenChange={(open) => !open && setEditingResult(null)}>
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>Edit Result</DialogTitle>
            <DialogDescription>Update the saved Google Maps result.</DialogDescription>
          </DialogHeader>
          <DialogBody className="grid gap-4 sm:grid-cols-2">
            <RunField id="result-title" label="Business" value={resultForm.title} onChange={(value) => setResultForm({ ...resultForm, title: value })} />
            <RunField id="result-category" label="Category" value={resultForm.category} onChange={(value) => setResultForm({ ...resultForm, category: value })} />
            <RunField id="result-category-name" label="Primary category" value={resultForm.categoryName} onChange={(value) => setResultForm({ ...resultForm, categoryName: value })} />
            <RunField id="result-address" label="Address" value={resultForm.address} onChange={(value) => setResultForm({ ...resultForm, address: value })} />
            <RunField id="result-street" label="Street" value={resultForm.street} onChange={(value) => setResultForm({ ...resultForm, street: value })} />
            <RunField id="result-city" label="City" value={resultForm.city} onChange={(value) => setResultForm({ ...resultForm, city: value })} />
            <RunField id="result-state" label="State" value={resultForm.state} onChange={(value) => setResultForm({ ...resultForm, state: value })} />
            <RunField id="result-country" label="Country code" value={resultForm.countryCode} onChange={(value) => setResultForm({ ...resultForm, countryCode: value })} />
            <RunField id="result-rating" label="Rating" type="number" value={resultForm.rating} onChange={(value) => setResultForm({ ...resultForm, rating: value })} />
            <RunField id="result-reviews" label="Reviews" type="number" value={resultForm.reviewCount} onChange={(value) => setResultForm({ ...resultForm, reviewCount: value })} />
            <RunField id="result-phone" label="Phone" value={resultForm.phone} onChange={(value) => setResultForm({ ...resultForm, phone: value })} />
            <RunField id="result-website" label="Website" value={resultForm.website} onChange={(value) => setResultForm({ ...resultForm, website: value })} />
          </DialogBody>
          <DialogFooter variant="plain">
            <Button variant="outline" onClick={() => setEditingResult(null)}>Cancel</Button>
            <Button disabled={savingResult} onClick={() => void saveResult()}>{savingResult ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteResultsDialog
        count={deleteIds.length}
        deleting={deletingResults}
        open={deleteIds.length > 0}
        onOpenChange={(open) => !open && setDeleteIds([])}
        onConfirm={() => void deleteResults(deleteIds)}
      />
    </div>
  )
}

function DeleteResultsDialog({
  count,
  deleting,
  open,
  onOpenChange,
  onConfirm,
}: {
  count: number
  deleting: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>Delete {count} {count === 1 ? "Result" : "Results"}</DialogTitle>
          <DialogDescription>This action cannot be undone.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete {count} selected {count === 1 ? "result" : "results"}?
          </p>
        </DialogBody>
        <DialogFooter variant="plain">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={deleting}>Cancel</Button>
          <Button variant="destructive" onClick={onConfirm} disabled={deleting || count === 0}>
            {deleting ? <Loader2Icon className="size-4 animate-spin" /> : <Trash2Icon className="size-4" />}
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function GoogleMapsResultsBreadcrumb({ title }: { title: string }) {
  return (
    <Breadcrumb>
      <BreadcrumbList className="gap-1.5 text-sm sm:text-base">
        <BreadcrumbItem>
          <BreadcrumbLink asChild className="font-medium text-muted-foreground hover:text-foreground">
            <Link to="/admin/datasource/google-maps">Google Maps</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator className="text-muted-foreground" />
        <BreadcrumbItem>
          <BreadcrumbPage className="font-medium">{title}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  )
}

function StatusBadge({ status }: { status: ProviderRunConfigStatus | string }) {
  return <Badge variant={status === "active" ? "default" : "secondary"}>{statusLabels[status as keyof typeof statusLabels] ?? status}</Badge>
}

function RunField({ id, label, type = "text", value, onChange }: { id: string; label: string; type?: string; value: string | number; onChange: (value: string) => void }) {
  return <div className="grid gap-2"><Label htmlFor={id}>{label}</Label><Input id={id} type={type} value={value} onChange={(event) => onChange(event.target.value)} /></div>
}

function emptyForm(maxResults: number): RunForm {
  return { name: "", keyword: "", location: "", language: "en", maxResults, status: "active" }
}

function emptyResultForm(): ResultForm {
  return {
    title: "",
    category: "",
    categoryName: "",
    address: "",
    street: "",
    city: "",
    state: "",
    countryCode: "",
    rating: "",
    reviewCount: "",
    phone: "",
    website: "",
  }
}

function text(value: unknown) {
  return typeof value === "string" && value ? value : null
}

function number(value: unknown) {
  return typeof value === "number" ? value : 0
}

function locationText(data: Record<string, unknown>) {
  const location = [text(data.street), text(data.city), text(data.state), text(data.countryCode)]
    .filter(Boolean)
    .join(", ")

  return text(data.address) ?? (location || "Unknown")
}

function safeExternalHref(value: string | null) {
  if (!value) return null
  try {
    const parsed = new URL(value)
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.toString() : null
  } catch {
    return null
  }
}
