import * as React from "react"
import { Link } from "@tanstack/react-router"
import {
  ImageIcon,
  MapPinnedIcon,
  Loader2Icon,
  PlayIcon,
  PlusIcon,
  SparklesIcon,
  SettingsIcon,
  Trash2Icon,
  UploadIcon,
  XIcon,
} from "lucide-react"

import { DashboardTable } from "@/components/dashboard-table"
import {
  DashboardToolbarSearch,
  DashboardToolbarSelectTrigger,
} from "@/components/dashboard-toolbar"
import { MediaPicker } from "@/components/media-picker"
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
import {
  Card,
  CardContent,
  CardDescription,
  CardGroup,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
import { Skeleton } from "@/components/ui/skeleton"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
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
  saveGoogleMapsFieldSettings,
  startGoogleMapsRun,
  updateGoogleMapsResult,
  enhanceGoogleMapsResults,
  loadHubExportSites,
  exportGoogleMapsResultsToHub,
  type GoogleMapsSocialPlatform,
  type HubExportSite,
  type HubExportStatus,
} from "@/providers/google-maps/api"
import { parseRunInput, type GoogleMapsFieldSetting, type GoogleMapsFieldType } from "@/providers/google-maps/schema"
import type { ProviderResultItem, ProviderRunConfigItem, ProviderRunConfigStatus } from "@/providers/types"

type RunForm = {
  name: string
  keyword: string
  location: string
  type: string
  neighborhood: string
  language: string
  maxResults: number
  status: ProviderRunConfigStatus
}
type ResultForm = Record<string, string | boolean>
type ResultFormValue = string | boolean
type ResultSortColumn = "title" | "address" | "rating" | "reviews" | "phone" | "website" | "created"
type ResultModalTab = "fields" | "json"
type StaticFieldTab = "filled" | "empty"
type FieldSettingsTab = "selected" | "other"
type RunSortColumn = "name" | "location" | "limit" | "amount" | "status"
type SortDirection = "asc" | "desc"
type HubExportDialogStatus = "idle" | "loading" | "exporting"
type EnhanceDialogStatus = "idle" | "enhancing"

const statusLabels = {
  all: "All statuses",
  active: "Active",
  draft: "Draft",
  inactive: "Inactive",
} as const
const pageSizes = [10, 25, 50]
const resultModalTabs: { id: ResultModalTab; label: string }[] = [
  { id: "fields", label: "Fields" },
  { id: "json", label: "JSON" },
]
const staticFieldTabs: { id: StaticFieldTab; label: string }[] = [
  { id: "filled", label: "Filled" },
  { id: "empty", label: "Empty Fields" },
]
const fieldSettingsTabs: { id: FieldSettingsTab; label: string }[] = [
  { id: "selected", label: "Selected Fields" },
  { id: "other", label: "Other Fields" },
]
const activeExecutionStatuses = new Set(["queued", "running"])
const socialPlatformOptions: { id: GoogleMapsSocialPlatform; label: string }[] = [
  { id: "instagram", label: "Instagram" },
  { id: "facebook", label: "Facebook" },
  { id: "tiktok", label: "TikTok" },
  { id: "twitter", label: "X/Twitter" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "youtube", label: "YouTube" },
]
const orderedResultKeys = [
  "businessName",
  "type",
  "category",
  "categoryName",
  "neighborhood",
  "address",
  "street",
  "city",
  "region",
  "country",
  "state",
  "countryCode",
  "rating",
  "reviewCount",
  "phone",
  "website",
  "instagram",
  "facebook",
  "tiktok",
  "twitter",
  "linkedin",
  "youtube",
] as const
const resultKeyOrder = new Map<string, number>(orderedResultKeys.map((key, index) => [key, index]))
const resultFieldLabels: Record<string, string> = {
  businessName: "Business",
  type: "Type",
  categoryName: "Primary category",
  neighborhood: "Neighborhood",
  region: "Region",
  country: "Country",
  countryCode: "Country code",
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  twitter: "X/Twitter",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  reviewCount: "Reviews",
}
const fixedResultFieldSettings: GoogleMapsFieldSetting[] = [
  { key: "type", sourcePath: "type", label: "Type", visible: true, editable: true, type: "text", order: 1 },
  { key: "neighborhood", sourcePath: "neighborhood", label: "Neighborhood", visible: true, editable: true, type: "text", order: 4 },
  { key: "city", sourcePath: "city", label: "City", visible: true, editable: true, type: "text", order: 7 },
  { key: "region", sourcePath: "region", label: "Region", visible: true, editable: true, type: "text", order: 8 },
  { key: "country", sourcePath: "country", label: "Country", visible: true, editable: true, type: "text", order: 9 },
  { key: "instagram", sourcePath: "instagram", label: "Instagram", visible: true, editable: true, type: "text", order: 20 },
  { key: "facebook", sourcePath: "facebook", label: "Facebook", visible: true, editable: true, type: "text", order: 21 },
  { key: "tiktok", sourcePath: "tiktok", label: "TikTok", visible: true, editable: true, type: "text", order: 22 },
  { key: "twitter", sourcePath: "twitter", label: "X/Twitter", visible: true, editable: true, type: "text", order: 23 },
  { key: "linkedin", sourcePath: "linkedin", label: "LinkedIn", visible: true, editable: true, type: "text", order: 24 },
  { key: "youtube", sourcePath: "youtube", label: "YouTube", visible: true, editable: true, type: "text", order: 25 },
]
const fixedResultFieldKeys = new Set(fixedResultFieldSettings.map((setting) => setting.key))
const resultNumberFields = new Set(["rating", "reviewCount"])
const readOnlyResultFields = new Set([
  "raw",
  "mapsUrl",
  "placeId",
  "latitude",
  "longitude",
  "sourceImageUrl",
])
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
  const [fieldSettings, setFieldSettings] = React.useState<GoogleMapsFieldSetting[]>([])
  const [fieldSamples, setFieldSamples] = React.useState<ProviderResultItem[]>([])
  const [fieldSettingsOpen, setFieldSettingsOpen] = React.useState(false)
  const [fieldSettingsDraft, setFieldSettingsDraft] = React.useState<GoogleMapsFieldSetting[]>([])
  const [savingFieldSettings, setSavingFieldSettings] = React.useState(false)
  const [loadingRuns, setLoadingRuns] = React.useState(true)

  React.useEffect(() => {
    void loadGoogleMapsRuns()
      .then(({ runs, settings, field_samples }) => {
        setRuns(runs)
        setHasToken(settings.has_token)
        setDefaultMax(settings.default_max_results)
        setFieldSettings(settings.field_settings)
        setFieldSamples(field_samples)
      })
      .catch((error) => setMessage({ tone: "error", text: providerError(error) }))
      .finally(() => setLoadingRuns(false))
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
      if (checked) next.add(id)
      else next.delete(id)
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

  const openFieldSettings = () => {
    if (!fieldSamples.length && !fieldSettings.length) return
    setFieldSettingsDraft(fieldSamples.length ? fieldSettingsForResults(fieldSamples, fieldSettings) : fieldSettings)
    setFieldSettingsOpen(true)
  }

  const saveFieldSettings = async () => {
    setSavingFieldSettings(true)
    setMessage(null)
    try {
      const response = await saveGoogleMapsFieldSettings({ fieldSettings: fieldSettingsDraft })
      setFieldSettings(response.field_settings)
      setFieldSettingsOpen(false)
      setMessage({ tone: "success", text: "Field settings saved." })
    } catch (error) {
      setMessage({ tone: "error", text: providerError(error) })
    } finally {
      setSavingFieldSettings(false)
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
            <Button variant="outline" size="sm" className="h-8 gap-2 sm:h-9" disabled={!fieldSamples.length && !fieldSettings.length} onClick={openFieldSettings}>
              <SettingsIcon className="size-4" />
              Field settings
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
              <TableHead column="meta"><TableSortButton active={runSortColumn === "location"} direction={runSortDirection} onClick={() => toggleRunSort("location")}>Search area</TableSortButton></TableHead>
              <TableHead column="meta"><TableSortButton active={runSortColumn === "limit"} direction={runSortDirection} onClick={() => toggleRunSort("limit")}>Limit</TableSortButton></TableHead>
              <TableHead column="meta"><TableSortButton active={runSortColumn === "amount"} direction={runSortDirection} onClick={() => toggleRunSort("amount")}>Amount</TableSortButton></TableHead>
              <TableHead column="meta"><TableSortButton active={runSortColumn === "status"} direction={runSortDirection} onClick={() => toggleRunSort("status")}>Status</TableSortButton></TableHead>
              <TableHead column="meta">Actions</TableHead>
            </TableRow>
          </TableHeader>
        }
        isEmpty={!loadingRuns && visible.length === 0}
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
        {loadingRuns ? <GoogleMapsRunsSkeletonRows count={pageSize} /> : visible.map((run) => {
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
          <RunField id="keyword" label="Search term" value={form.keyword} onChange={(value) => setForm({ ...form, keyword: value })} />
          <RunField id="location" label="Search area" value={form.location} onChange={(value) => setForm({ ...form, location: value })} />
          <RunField id="type" label="Type" value={form.type} onChange={(value) => setForm({ ...form, type: value })} />
          <RunField id="neighborhood" label="Neighborhood" value={form.neighborhood} onChange={(value) => setForm({ ...form, neighborhood: value })} />
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
      <FieldSettingsDialog
        open={fieldSettingsOpen}
        settings={fieldSettingsDraft}
        saving={savingFieldSettings}
        onOpenChange={setFieldSettingsOpen}
        onChange={setFieldSettingsDraft}
        onSave={() => void saveFieldSettings()}
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
  const [loadingResults, setLoadingResults] = React.useState(true)
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
  const [runningRun, setRunningRun] = React.useState(false)
  const [savingResult, setSavingResult] = React.useState(false)
  const [resultForm, setResultForm] = React.useState<ResultForm>({})
  const [resultModalTab, setResultModalTab] = React.useState<ResultModalTab>("fields")
  const [staticFieldTab, setStaticFieldTab] = React.useState<StaticFieldTab>("filled")
  const [resultImagePickerOpen, setResultImagePickerOpen] = React.useState(false)
  const [hubExportOpen, setHubExportOpen] = React.useState(false)
  const [hubExportSites, setHubExportSites] = React.useState<HubExportSite[]>([])
  const [hubExportSiteId, setHubExportSiteId] = React.useState("")
  const [hubExportStatus, setHubExportStatus] = React.useState<HubExportStatus>("draft")
  const [hubExportState, setHubExportState] = React.useState<HubExportDialogStatus>("idle")
  const [enhanceOpen, setEnhanceOpen] = React.useState(false)
  const [enhancePlatforms, setEnhancePlatforms] = React.useState<GoogleMapsSocialPlatform[]>(socialPlatformOptions.map((option) => option.id))
  const [enhanceState, setEnhanceState] = React.useState<EnhanceDialogStatus>("idle")
  const pollingExecutionIds = React.useRef<Set<string>>(new Set())

  const load = React.useCallback(async () => {
    try {
      setData(await loadGoogleMapsRun(runId))
    } catch (error) {
      setMessage({ tone: "error", text: providerError(error) })
    } finally {
      setLoadingResults(false)
    }
  }, [runId])

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  const waitForExecution = React.useCallback(async (executionId: string) => {
    let status = "running"
    while (isActiveExecutionStatus(status)) {
      await wait(3000)
      status = (await refreshGoogleMapsExecution(executionId)).execution.status
    }
  }, [])

  React.useEffect(() => {
    const execution = data?.latest_execution
    if (!execution || pollingExecutionIds.current.has(execution.id) || !isActiveExecutionStatus(execution.status)) return

    pollingExecutionIds.current.add(execution.id)
    void waitForExecution(execution.id)
      .then(load)
      .catch((error) => setMessage({ tone: "error", text: providerError(error) }))
  }, [data?.latest_execution, load, waitForExecution])

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
  const resultFields = editingResult ? resultFieldsForResult(editingResult, data?.field_settings ?? []) : []
  const dynamicResultFields = resultFields.filter((setting) => setting.key !== "featuredImage" && !fixedResultFieldKeys.has(setting.key))
  const staticResultFields = editingResult
    ? resultFields
      .filter((setting) => fixedResultFieldKeys.has(setting.key))
      .filter((setting) => staticFieldTab === "filled" ? resultFieldHasValue(editingResult, setting) : !resultFieldHasValue(editingResult, setting))
    : []
  const visibleIds = visibleResults.map((result) => result.id)
  const visibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id))
  const visibleIndeterminate = !visibleSelected && visibleIds.some((id) => selectedIds.has(id))
  const runButtonRunning = runningRun || isActiveExecutionStatus(data?.latest_execution?.status)

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
    if (runningRun) return
    setRunningRun(true)
    setMessage(null)
    try {
      const response = await startGoogleMapsRun(runId)
      setMessage({ tone: "success", text: "Run started." })
      if (isActiveExecutionStatus(response.execution.status)) {
        await waitForExecution(response.execution.id)
      }
      await load()
    } catch (error) {
      setMessage({ tone: "error", text: providerError(error) })
    } finally {
      setRunningRun(false)
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
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const editResult = (result: ProviderResultItem) => {
    setEditingResult(result)
    setResultModalTab("fields")
    setStaticFieldTab("filled")
    setResultImagePickerOpen(false)
    setResultForm(resultFormFromData(result, data?.field_settings ?? []))
  }

  const openHubExport = async () => {
    setHubExportOpen(true)
    if (hubExportSites.length) return

    setHubExportState("loading")
    setMessage(null)
    try {
      const response = await loadHubExportSites()
      setHubExportSites(response.sites)
      setHubExportSiteId((current) => current || response.sites[0]?.id || "")
    } catch (error) {
      setMessage({ tone: "error", text: providerError(error) })
    } finally {
      setHubExportState("idle")
    }
  }

  const exportToHub = async () => {
    if (!selectedIds.size || !hubExportSiteId) return

    setHubExportState("exporting")
    setMessage(null)
    try {
      const response = await exportGoogleMapsResultsToHub({
        runId,
        siteId: hubExportSiteId,
        status: hubExportStatus,
        resultIds: Array.from(selectedIds),
      })
      setHubExportOpen(false)
      setSelectedIds(new Set())
      const tone = response.errors > 0 ? "error" : "success"
      setMessage({
        tone,
        text: `Hub export complete: ${response.created} created, ${response.updated} updated, ${response.errors} errors.`,
      })
    } catch (error) {
      setMessage({ tone: "error", text: providerError(error) })
    } finally {
      setHubExportState("idle")
    }
  }

  const enhanceData = async () => {
    if (!selectedIds.size || !enhancePlatforms.length) return

    setEnhanceState("enhancing")
    setMessage(null)
    try {
      const response = await enhanceGoogleMapsResults({
        runId,
        resultIds: Array.from(selectedIds),
        platforms: enhancePlatforms,
      })
      setEnhanceOpen(false)
      await load()
      setMessage({
        tone: response.failed > 0 ? "error" : "success",
        text: `Enhance data complete: ${response.enhanced} updated, ${response.skipped} skipped, ${response.failed} failed.`,
      })
    } catch (error) {
      setMessage({ tone: "error", text: providerError(error) })
    } finally {
      setEnhanceState("idle")
    }
  }

  const toggleEnhancePlatform = (platform: GoogleMapsSocialPlatform, checked: boolean) => {
    setEnhancePlatforms((current) => {
      if (checked) return current.includes(platform) ? current : [...current, platform]
      return current.filter((item) => item !== platform)
    })
  }

  const saveResult = async () => {
    if (!editingResult) return
    setSavingResult(true)
    setMessage(null)
    try {
      const title = resultTitle(resultForm, editingResult)
      if (!title) throw new Error("Business is required.")
      await updateGoogleMapsResult({
        runId,
        resultId: editingResult.id,
        title,
        data: resultDataFromForm(resultForm, editingResult, data?.field_settings ?? []),
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
            {selectedIds.size ? (
              <Button variant="outline" size="sm" className="h-8 gap-2 sm:h-9" onClick={() => void openHubExport()}>
                <UploadIcon className="size-4" />
                Export ({selectedIds.size})
              </Button>
            ) : null}
            {selectedIds.size ? (
              <Button variant="outline" size="sm" className="h-8 gap-2 sm:h-9" onClick={() => setEnhanceOpen(true)}>
                <SparklesIcon className="size-4" />
                Enhance Data ({selectedIds.size})
              </Button>
            ) : null}
            <DashboardToolbarSearch value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search results..." />
            <Button size="sm" className="h-8 gap-2 sm:h-9" disabled={!data || data.run.status !== "active" || runButtonRunning} onClick={() => void startRun()}>
              {runButtonRunning ? <Loader2Icon className="size-4 animate-spin" /> : <PlayIcon className="size-4" />}
              {runButtonRunning ? "Running" : "Run now"}
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
        isEmpty={!loadingResults && results.length === 0}
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
        {loadingResults ? <GoogleMapsResultsSkeletonRows count={pageSize} /> : visibleResults.map((result) => {
          const websiteHref = safeExternalHref(text(result.data.website))
          const featuredImage = safeExternalHref(text(result.data.featuredImage))
          return (
            <TableRow key={result.id} data-state={selectedIds.has(result.id) ? "selected" : undefined}>
              <TableCell column="select">
                <Checkbox checked={selectedIds.has(result.id)} onCheckedChange={(checked) => toggleResult(result.id, checked === true)} aria-label={`Select ${result.title}`} />
              </TableCell>
              <TableCell column="main">
                <div className="flex min-w-0 items-center gap-3">
                  {featuredImage ? (
                    <img src={featuredImage} alt="" className="size-12 shrink-0 rounded-md border bg-muted object-cover" loading="lazy" />
                  ) : null}
                  <div className="min-w-0">
                    <button type="button" className="max-w-full truncate text-left font-medium hover:underline" onClick={() => editResult(result)}>{result.title}</button>
                    <div className="truncate text-xs text-muted-foreground">{text(result.data.categoryName) ?? text(result.data.category) ?? "Uncategorized"}</div>
                  </div>
                </div>
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

      <Dialog open={Boolean(editingResult)} onOpenChange={(open) => {
        if (open) return
        setEditingResult(null)
        setResultImagePickerOpen(false)
      }}>
        <DialogContent variant="admin">
          <DialogHeader>
            <div className="flex flex-wrap items-center gap-3 pr-10">
              <DialogTitle>Edit Result</DialogTitle>
              <div role="tablist" aria-label="Result modal view" className="flex items-center gap-1 rounded-lg bg-muted p-1">
                {resultModalTabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={resultModalTab === tab.id}
                    onClick={() => setResultModalTab(tab.id)}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all sm:text-sm ${resultModalTab === tab.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
            <DialogDescription>Update the saved Google Maps result.</DialogDescription>
          </DialogHeader>
          {resultModalTab === "fields" && editingResult ? (
            <DialogBody>
              <CardGroup className="grid">
                <Card>
                  <CardHeader>
                    <CardTitle>Dynamic fields</CardTitle>
                    <CardDescription>Fields coming from Google Maps data and selected field settings.</CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-4 sm:grid-cols-2">
                    <FeaturedImageField
                      value={typeof resultForm.featuredImage === "string" ? resultForm.featuredImage : ""}
                      onChange={(nextValue) => setResultForm({ ...resultForm, featuredImage: nextValue })}
                      onOpenPicker={() => setResultImagePickerOpen(true)}
                    />
                    {dynamicResultFields.map((setting) => (
                        <ResultField
                          key={setting.key}
                          id={`result-${setting.key}`}
                          label={setting.label}
                          type={setting.type}
                          value={resultForm[setting.key] ?? ""}
                          onChange={(nextValue) => setResultForm({ ...resultForm, [setting.key]: nextValue })}
                        />
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="gap-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="grid gap-1">
                        <CardTitle>Static fields</CardTitle>
                        <CardDescription>Manual fields used consistently across Core and Hub.</CardDescription>
                      </div>
                      <div role="tablist" aria-label="Static field view" className="flex items-center gap-1 rounded-lg bg-muted p-1">
                        {staticFieldTabs.map((tab) => (
                          <button
                            key={tab.id}
                            type="button"
                            role="tab"
                            aria-selected={staticFieldTab === tab.id}
                            onClick={() => setStaticFieldTab(tab.id)}
                            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all sm:text-sm ${staticFieldTab === tab.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                          >
                            {tab.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="grid gap-4 sm:grid-cols-2">
                    {staticResultFields.length ? staticResultFields.map((setting) => (
                        <ResultField
                          key={setting.key}
                          id={`result-${setting.key}`}
                          label={setting.label}
                          type={setting.type}
                          value={resultForm[setting.key] ?? ""}
                          onChange={(nextValue) => setResultForm({ ...resultForm, [setting.key]: nextValue })}
                        />
                    )) : (
                      <div className="text-sm text-muted-foreground sm:col-span-2">
                        No {staticFieldTab === "filled" ? "filled" : "empty"} static fields.
                      </div>
                    )}
                  </CardContent>
                </Card>
              </CardGroup>
            </DialogBody>
          ) : (
            <div className="min-h-0 flex-1 px-6 pt-6 pb-6">
              <ScrollArea type="hover" className="h-[60vh] rounded-md border bg-muted/40">
                <pre className="w-max min-w-full p-3 font-mono text-xs leading-relaxed text-foreground">{editingResult ? JSON.stringify(editingResult, null, 2) : ""}</pre>
                <ScrollBar orientation="horizontal" />
              </ScrollArea>
            </div>
          )}
          <DialogFooter variant="plain">
            <Button variant="outline" onClick={() => setEditingResult(null)}>Cancel</Button>
            <Button disabled={savingResult} onClick={() => void saveResult()}>{savingResult ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MediaPicker
        open={resultImagePickerOpen && Boolean(editingResult)}
        onOpenChange={setResultImagePickerOpen}
        onSelectMedia={(mediaUrl) => {
          setResultForm({ ...resultForm, featuredImage: mediaUrl })
          setResultImagePickerOpen(false)
        }}
        currentMediaUrl={typeof resultForm.featuredImage === "string" ? resultForm.featuredImage : ""}
        showVideos={false}
      />

      <DeleteResultsDialog
        count={deleteIds.length}
        deleting={deletingResults}
        open={deleteIds.length > 0}
        onOpenChange={(open) => !open && setDeleteIds([])}
        onConfirm={() => void deleteResults(deleteIds)}
      />

      <HubExportDialog
        count={selectedIds.size}
        open={hubExportOpen}
        sites={hubExportSites}
        siteId={hubExportSiteId}
        status={hubExportStatus}
        state={hubExportState}
        onOpenChange={setHubExportOpen}
        onSiteChange={setHubExportSiteId}
        onStatusChange={setHubExportStatus}
        onExport={() => void exportToHub()}
      />

      <EnhanceDataDialog
        count={selectedIds.size}
        open={enhanceOpen}
        platforms={enhancePlatforms}
        state={enhanceState}
        onOpenChange={setEnhanceOpen}
        onPlatformChange={toggleEnhancePlatform}
        onEnhance={() => void enhanceData()}
      />
    </div>
  )
}

function EnhanceDataDialog({
  count,
  open,
  platforms,
  state,
  onOpenChange,
  onPlatformChange,
  onEnhance,
}: {
  count: number
  open: boolean
  platforms: GoogleMapsSocialPlatform[]
  state: EnhanceDialogStatus
  onOpenChange: (open: boolean) => void
  onPlatformChange: (platform: GoogleMapsSocialPlatform, checked: boolean) => void
  onEnhance: () => void
}) {
  const enhancing = state === "enhancing"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>Enhance Data</DialogTitle>
          <DialogDescription>Find social media accounts from each selected venue website.</DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-4">
          <div className="grid gap-2">
            <Label>Method</Label>
            <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">Website homepage</div>
          </div>
          <div className="grid gap-3">
            <Label>Social accounts</Label>
            <div className="grid gap-3 sm:grid-cols-2">
              {socialPlatformOptions.map((platform) => (
                <label key={platform.id} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                  <Checkbox
                    checked={platforms.includes(platform.id)}
                    onCheckedChange={(checked) => onPlatformChange(platform.id, checked === true)}
                    disabled={enhancing}
                  />
                  {platform.label}
                </label>
              ))}
            </div>
          </div>
          <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            Enhancing fills blank social fields only. Existing values will stay unchanged.
          </div>
        </DialogBody>
        <DialogFooter variant="plain">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={enhancing}>Cancel</Button>
          <Button onClick={onEnhance} disabled={enhancing || count === 0 || platforms.length === 0}>
            {enhancing ? <Loader2Icon className="size-4 animate-spin" /> : <SparklesIcon className="size-4" />}
            Enhance {count}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function HubExportDialog({
  count,
  open,
  sites,
  siteId,
  status,
  state,
  onOpenChange,
  onSiteChange,
  onStatusChange,
  onExport,
}: {
  count: number
  open: boolean
  sites: HubExportSite[]
  siteId: string
  status: HubExportStatus
  state: HubExportDialogStatus
  onOpenChange: (open: boolean) => void
  onSiteChange: (siteId: string) => void
  onStatusChange: (status: HubExportStatus) => void
  onExport: () => void
}) {
  const loading = state === "loading"
  const exporting = state === "exporting"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>Export to Hub</DialogTitle>
          <DialogDescription>Send selected Google Maps results into a Hub directory.</DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-4">
          <div className="grid gap-2">
            <Label>Hub site</Label>
            <Select value={siteId} onValueChange={onSiteChange} disabled={loading || exporting || !sites.length}>
              <SelectTrigger size="default" className="w-full">
                <SelectValue placeholder={loading ? "Loading sites..." : "Select a site"} />
              </SelectTrigger>
              <SelectContent>
                {sites.map((site) => (
                  <SelectItem key={site.id} value={site.id}>{hubSiteLabel(site)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Status</Label>
            <Select value={status} onValueChange={(value) => onStatusChange(value as HubExportStatus)} disabled={loading || exporting}>
              <SelectTrigger size="default" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="published">Published</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {!loading && !sites.length ? (
            <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              No Hub sites are available for export.
            </div>
          ) : null}
        </DialogBody>
        <DialogFooter variant="plain">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={exporting}>Cancel</Button>
          <Button onClick={onExport} disabled={loading || exporting || !siteId || count === 0}>
            {exporting ? <Loader2Icon className="size-4 animate-spin" /> : <UploadIcon className="size-4" />}
            Export {count}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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

function FieldSettingsDialog({
  open,
  settings,
  saving,
  onOpenChange,
  onChange,
  onSave,
}: {
  open: boolean
  settings: GoogleMapsFieldSetting[]
  saving: boolean
  onOpenChange: (open: boolean) => void
  onChange: (settings: GoogleMapsFieldSetting[]) => void
  onSave: () => void
}) {
  const [fieldQuery, setFieldQuery] = React.useState("")
  const [fieldSettingsTab, setFieldSettingsTab] = React.useState<FieldSettingsTab>("selected")
  const selectedCount = settings.filter((setting) => setting.visible).length
  const otherCount = settings.length - selectedCount
  const matchingSettings = settings
    .map((setting, index) => ({ setting, index }))
    .filter(({ setting }) => fieldSettingsTab === "selected" ? setting.visible : !setting.visible)
    .filter(({ setting }) => fieldSettingMatchesQuery(setting, fieldQuery))

  const update = (index: number, changes: Partial<GoogleMapsFieldSetting>) => {
    onChange(settings.map((setting, itemIndex) => {
      if (itemIndex !== index) return setting
      const next = { ...setting, ...changes }
      return { ...next, editable: next.visible && !readOnlyResultFields.has(next.key) }
    }))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="admin" className="max-h-[85vh] w-[920px] max-w-[calc(100vw-2rem)] sm:max-w-[920px]">
        <DialogHeader>
          <DialogTitle>Field Settings</DialogTitle>
          <DialogDescription>Choose which JSON fields appear in the Fields tab.</DialogDescription>
        </DialogHeader>
        <DialogBody className="grid min-h-0 gap-3">
          <div>
            <Input
              id="field-settings-search"
              aria-label="Search fields"
              value={fieldQuery}
              placeholder="Search label, key, JSON path, or type..."
              onChange={(event) => setFieldQuery(event.target.value)}
            />
          </div>
          <div role="tablist" aria-label="Field settings view" className="flex w-fit items-center gap-1 rounded-lg bg-muted p-1">
            {fieldSettingsTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={fieldSettingsTab === tab.id}
                onClick={() => setFieldSettingsTab(tab.id)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all sm:text-sm ${fieldSettingsTab === tab.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                {tab.label} {tab.id === "selected" ? selectedCount : otherCount}
              </button>
            ))}
          </div>
          <div className="grid gap-3">
            {matchingSettings.length ? matchingSettings.map(({ setting, index }) => (
              <div key={`${setting.sourcePath}-${index}`} className="grid gap-3 rounded-md border p-3">
                <div className="min-w-0 text-xs font-medium text-muted-foreground">
                  {setting.sourcePath}
                </div>
                <div className="grid gap-3 lg:grid-cols-[minmax(140px,1fr)_minmax(140px,1fr)_130px_120px]">
                  <div className="grid gap-2">
                    <Label htmlFor={`field-label-${index}`}>Label</Label>
                    <Input id={`field-label-${index}`} value={setting.label} onChange={(event) => update(index, { label: event.target.value })} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor={`field-key-${index}`}>Save key</Label>
                    <Input id={`field-key-${index}`} value={setting.key} onChange={(event) => update(index, { key: event.target.value })} />
                  </div>
                  <div className="grid gap-2">
                    <Label>Type</Label>
                    <Select value={setting.type} onValueChange={(value) => update(index, { type: value as GoogleMapsFieldType })}>
                      <SelectTrigger size="default" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="text">Text</SelectItem>
                        <SelectItem value="number">Number</SelectItem>
                        <SelectItem value="boolean">Boolean</SelectItem>
                        <SelectItem value="tags">Tags</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end">
                    <Button
                      type="button"
                      variant={fieldSettingsTab === "selected" ? "outline" : "secondary"}
                      className="w-full"
                      onClick={() => update(index, { visible: fieldSettingsTab === "other" })}
                    >
                      {fieldSettingsTab === "selected" ? <Trash2Icon className="size-4" /> : <PlusIcon className="size-4" />}
                      {fieldSettingsTab === "selected" ? "Remove" : "Select"}
                    </Button>
                  </div>
                </div>
              </div>
            )) : (
              <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                No fields match your search.
              </div>
            )}
          </div>
        </DialogBody>
        <DialogFooter variant="plain">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={onSave} disabled={saving}>{saving ? "Saving..." : "Save settings"}</Button>
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

function hubSiteLabel(site: HubExportSite) {
  const domain = site.custom_domain || site.subdomain
  return domain ? `${site.name} - ${domain}` : site.name
}

function StatusBadge({ status }: { status: ProviderRunConfigStatus | string }) {
  return <Badge variant={status === "active" ? "default" : "secondary"}>{statusLabels[status as keyof typeof statusLabels] ?? status}</Badge>
}

function RunField({ id, label, type = "text", value, onChange }: { id: string; label: string; type?: string; value: string | number; onChange: (value: string) => void }) {
  return <div className="grid gap-2"><Label htmlFor={id}>{label}</Label><Input id={id} type={type} value={value} onChange={(event) => onChange(event.target.value)} /></div>
}

function GoogleMapsRunsSkeletonRows({ count }: { count: number }) {
  return Array.from({ length: count }).map((_, index) => (
    <TableRow key={index}>
      <TableCell column="select"><Skeleton className="size-4" /></TableCell>
      <TableCell column="main">
        <div className="space-y-2">
          <Skeleton className="h-4 w-44" />
          <Skeleton className="h-3 w-32" />
        </div>
      </TableCell>
      <TableCell column="meta"><Skeleton className="h-4 w-24" /></TableCell>
      <TableCell column="meta"><Skeleton className="h-4 w-10" /></TableCell>
      <TableCell column="meta"><Skeleton className="h-4 w-10" /></TableCell>
      <TableCell column="meta"><Skeleton className="h-5 w-16" /></TableCell>
      <TableCell column="meta"><Skeleton className="h-8 w-24" /></TableCell>
    </TableRow>
  ))
}

function GoogleMapsResultsSkeletonRows({ count }: { count: number }) {
  return Array.from({ length: count }).map((_, index) => (
    <TableRow key={index}>
      <TableCell column="select"><Skeleton className="size-4" /></TableCell>
      <TableCell column="main">
        <div className="flex items-center gap-3">
          <Skeleton className="size-12 shrink-0 rounded-md" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-3 w-28" />
          </div>
        </div>
      </TableCell>
      <TableCell column="preview"><Skeleton className="h-4 w-56" /></TableCell>
      <TableCell column="meta"><Skeleton className="h-4 w-10" /></TableCell>
      <TableCell column="meta"><Skeleton className="h-4 w-12" /></TableCell>
      <TableCell column="meta"><Skeleton className="h-4 w-28" /></TableCell>
      <TableCell column="meta"><Skeleton className="h-8 w-14" /></TableCell>
      <TableCell column="meta"><Skeleton className="h-4 w-24" /></TableCell>
      <TableCell column="meta"><Skeleton className="h-8 w-16" /></TableCell>
    </TableRow>
  ))
}

function FeaturedImageField({
  value,
  onChange,
  onOpenPicker,
}: {
  value: string
  onChange: (value: string) => void
  onOpenPicker: () => void
}) {
  return (
    <div className="grid gap-2 sm:col-span-2">
      <Label>Featured image</Label>
      {value ? (
        <div className="relative aspect-square w-48 overflow-hidden rounded-lg bg-muted">
          <img src={value} alt="Featured image preview" className="h-full w-full object-contain" />
          <Button
            type="button"
            variant="destructive"
            size="icon-sm"
            className="absolute top-2 right-2 z-10 rounded-full"
            onClick={() => onChange("")}
          >
            <XIcon className="size-4" />
            <span className="sr-only">Remove featured image</span>
          </Button>
          <button
            type="button"
            className="absolute inset-0 flex cursor-pointer items-center justify-center bg-black/50 text-white opacity-0 transition-opacity hover:opacity-100"
            onClick={onOpenPicker}
          >
            <span className="text-center">
              <ImageIcon className="mx-auto mb-2 size-8" />
              <span className="text-sm font-medium">Click to change image</span>
            </span>
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="flex aspect-square w-48 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/50 transition-all hover:border-muted-foreground/40 hover:bg-muted/70"
          onClick={onOpenPicker}
        >
          <span className="text-center">
            <ImageIcon className="mx-auto size-8 text-muted-foreground/50" />
            <span className="mt-2 block text-sm text-muted-foreground">Click to select featured image</span>
          </span>
        </button>
      )}
    </div>
  )
}

function ResultField({
  id,
  label,
  type,
  value,
  onChange,
}: {
  id: string
  label: string
  type: GoogleMapsFieldType
  value: ResultFormValue
  onChange: (value: ResultFormValue) => void
}) {
  if (type === "boolean") {
    return (
      <div className="flex items-center gap-2 self-end rounded-md border px-3 py-2">
        <Checkbox id={id} checked={value === true} onCheckedChange={(checked) => onChange(checked === true)} />
        <Label htmlFor={id}>{label}</Label>
      </div>
    )
  }

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type === "number" ? "number" : "text"}
        value={String(value)}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}

function emptyForm(maxResults: number): RunForm {
  return { name: "", keyword: "", location: "", type: "", neighborhood: "", language: "en", maxResults, status: "active" }
}

function resultFormFromData(result: ProviderResultItem, fieldSettings: GoogleMapsFieldSetting[]): ResultForm {
  const form: ResultForm = {}

  resultFieldsForResult(result, fieldSettings).forEach((setting) => {
    form[setting.key] = formValue(resultFieldValue(result, setting))
  })
  form.featuredImage = text(result.data.featuredImage) ?? ""

  return form
}

function resultFieldsForResult(result: ProviderResultItem, fieldSettings: GoogleMapsFieldSetting[]) {
  const settingsByKey = new Map(fieldSettingsForResults([result], fieldSettings).map((setting) => [setting.key, setting]))
  fixedResultFieldSettings.forEach((setting) => {
    settingsByKey.set(setting.key, { ...setting, order: settingsByKey.get(setting.key)?.order ?? setting.order })
  })

  return Array.from(settingsByKey.values())
    .filter((setting) => setting.key === "businessName" || fixedResultFieldKeys.has(setting.key) || (setting.visible && resultFieldHasValue(result, setting)))
    .sort((a, b) => a.order - b.order)
}

function fieldSettingsForResults(results: ProviderResultItem[], savedSettings: GoogleMapsFieldSetting[]) {
  const discovered = mergeDiscoveredFieldSettings(results.flatMap(discoverFieldSettings))
  if (!savedSettings.length) return discovered

  const savedSourcePaths = new Set(savedSettings.map((setting) => setting.sourcePath))
  const savedKeys = new Set(savedSettings.map((setting) => setting.key))
  const missing = discovered
    .filter((setting) => !savedSourcePaths.has(setting.sourcePath) && !savedKeys.has(setting.key))
    .map((setting, index) => ({ ...setting, visible: false, editable: false, order: savedSettings.length + index }))

  return [...savedSettings, ...missing].sort((a, b) => a.order - b.order)
}

function mergeDiscoveredFieldSettings(settings: GoogleMapsFieldSetting[]) {
  const usedKeys = new Set<string>()
  const paths = new Set<string>()
  const merged: GoogleMapsFieldSetting[] = []

  settings.forEach((setting) => {
    if (paths.has(setting.sourcePath)) return
    paths.add(setting.sourcePath)
    const key = uniqueFieldKey(setting.key, usedKeys)
    merged.push({ ...setting, key, editable: setting.visible && !readOnlyResultFields.has(key), order: merged.length })
  })

  return merged
}

function discoverFieldSettings(result: ProviderResultItem): GoogleMapsFieldSetting[] {
  const data = resultDataWithTitle(result)
  const usedKeys = new Set<string>()
  const settings: GoogleMapsFieldSetting[] = []

  Object.entries(data).sort(([a], [b]) => {
    const aOrder = resultKeyOrder.get(a) ?? Number.MAX_SAFE_INTEGER
    const bOrder = resultKeyOrder.get(b) ?? Number.MAX_SAFE_INTEGER
    return aOrder === bOrder ? 0 : aOrder - bOrder
  }).forEach(([key, value]) => {
    if (key === "raw" || readOnlyResultFields.has(key)) return
    if (!isSupportedFieldValue(value)) return
    settings.push(candidateFieldSetting({
      key,
      sourcePath: key,
      value,
      visible: isEditableResultField(key, value),
      editable: isEditableResultField(key, value),
      usedKeys,
      order: settings.length,
    }))
  })

  collectRawFieldSettings(data.raw, "raw", usedKeys, settings)

  return settings
}

function collectRawFieldSettings(
  value: unknown,
  sourcePath: string,
  usedKeys: Set<string>,
  settings: GoogleMapsFieldSetting[]
) {
  if (isSupportedFieldValue(value)) {
    settings.push(candidateFieldSetting({
      key: fieldKeyFromPath(sourcePath, usedKeys),
      sourcePath,
      value,
      visible: false,
      editable: false,
      usedKeys,
      order: settings.length,
    }))
    return
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) return

  Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
    collectRawFieldSettings(item, `${sourcePath}.${key}`, usedKeys, settings)
  })
}

function candidateFieldSetting({
  key,
  sourcePath,
  value,
  visible,
  editable,
  usedKeys,
  order,
}: {
  key: string
  sourcePath: string
  value: unknown
  visible: boolean
  editable: boolean
  usedKeys: Set<string>
  order: number
}): GoogleMapsFieldSetting {
  const cleanKey = uniqueFieldKey(key, usedKeys)
  return {
    key: cleanKey,
    sourcePath,
    label: resultFieldLabel(cleanKey),
    visible,
    editable: visible && editable && !readOnlyResultFields.has(cleanKey),
    type: fieldTypeFromValue(cleanKey, value),
    order,
  }
}

function isEditableResultField(key: string, value: unknown) {
  return !readOnlyResultFields.has(key) &&
    (value === null || ["string", "number", "boolean"].includes(typeof value))
}

function isSupportedFieldValue(value: unknown) {
  return value === null ||
    ["string", "number", "boolean"].includes(typeof value) ||
    isStringArray(value)
}

function resultTitle(form: ResultForm, result: ProviderResultItem) {
  if (!Object.prototype.hasOwnProperty.call(form, "businessName")) return result.title.trim()
  const value = form.businessName
  return typeof value === "string" ? value.trim() : ""
}

function resultDataFromForm(
  form: ResultForm,
  result: ProviderResultItem,
  fieldSettings: GoogleMapsFieldSetting[]
) {
  const data = Object.fromEntries(
    resultFieldsForResult(result, fieldSettings)
      .filter((setting) => setting.key !== "featuredImage")
      .filter((setting) => setting.visible && Object.prototype.hasOwnProperty.call(form, setting.key))
      .map((setting) => [setting.key, resultValueFromForm(form[setting.key], setting)])
  )
  data.featuredImage = typeof form.featuredImage === "string" ? form.featuredImage.trim() || null : null
  return data
}

function resultValueFromForm(value: ResultFormValue, setting: GoogleMapsFieldSetting) {
  if (typeof value === "boolean") return value

  const trimmed = value.trim()
  if (!trimmed) return null
  if (setting.type === "tags") return trimmed.split(/[,\n]/).map((item) => item.trim()).filter(Boolean)
  if (setting.type !== "number") return trimmed

  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed)) throw new Error(`${setting.label} must be a number.`)
  return parsed
}

function resultFieldValue(result: ProviderResultItem, setting: GoogleMapsFieldSetting) {
  const data = resultDataWithTitle(result)
  return Object.prototype.hasOwnProperty.call(data, setting.key)
    ? data[setting.key]
    : valueAtPath(data, setting.sourcePath)
}

function resultFieldHasValue(result: ProviderResultItem, setting: GoogleMapsFieldSetting) {
  const value = resultFieldValue(result, setting)
  if (value === null || value === undefined) return false
  if (typeof value === "string") return value.trim().length > 0
  if (Array.isArray(value)) return value.some((item) => typeof item === "string" ? item.trim().length > 0 : item !== null && item !== undefined)
  return true
}

function resultDataWithTitle(result: ProviderResultItem) {
  return { ...result.data, businessName: text(result.data.businessName) ?? result.title }
}

function fieldTypeFromValue(key: string, value: unknown): GoogleMapsFieldType {
  if (isStringArray(value) || key === "tags") return "tags"
  if (typeof value === "boolean") return "boolean"
  return typeof value === "number" || resultNumberFields.has(key) ? "number" : "text"
}

function fieldSettingMatchesQuery(setting: GoogleMapsFieldSetting, query: string) {
  const term = query.trim().toLowerCase()
  if (!term) return true
  return [setting.label, setting.key, setting.sourcePath, setting.type]
    .some((value) => fieldSearchTextMatches(value, term))
}

function fieldSearchTextMatches(value: string, term: string) {
  const text = value.toLowerCase()
  if (text.includes(term)) return true
  if (term.length < 3) return false

  const words = text.split(/[^a-z0-9]+/).filter(Boolean)
  return words.some((word) => isCloseFieldSearchMatch(word, term))
}

function isCloseFieldSearchMatch(word: string, term: string) {
  const prefix = word.slice(0, term.length)
  if (prefix.length === term.length && fieldSearchDistance(prefix, term) <= 1) return true
  if (Math.abs(word.length - term.length) > 2) return false
  return fieldSearchDistance(word, term) <= 2
}

function fieldSearchDistance(a: string, b: string) {
  let edits = 0
  let aIndex = 0
  let bIndex = 0

  while (aIndex < a.length && bIndex < b.length) {
    if (a[aIndex] === b[bIndex]) {
      aIndex += 1
      bIndex += 1
      continue
    }

    edits += 1
    if (edits > 2) return edits
    if (a.length > b.length) aIndex += 1
    else if (b.length > a.length) bIndex += 1
    else {
      aIndex += 1
      bIndex += 1
    }
  }

  return edits + a.length - aIndex + b.length - bIndex
}

function fieldKeyFromPath(sourcePath: string, usedKeys: Set<string>) {
  if (sourcePath === "raw.categories") return "tags"
  if (sourcePath === "raw.description") return "description"

  const parts = sourcePath.split(".")
  const leaf = parts[parts.length - 1] ?? sourcePath
  return usedKeys.has(leaf) ? toFieldKey(sourcePath) : leaf
}

function uniqueFieldKey(key: string, usedKeys: Set<string>) {
  const baseKey = toFieldKey(key)
  let nextKey = baseKey
  let count = 2
  while (usedKeys.has(nextKey)) {
    nextKey = `${baseKey}${count}`
    count += 1
  }
  usedKeys.add(nextKey)
  return nextKey
}

function toFieldKey(value: string) {
  const parts = value.split(/[^A-Za-z0-9]+/).filter(Boolean)
  const key = parts.map((part, index) => {
    const clean = part.replace(/^[0-9]+/, "")
    if (!clean) return ""
    return index === 0 ? clean.charAt(0).toLowerCase() + clean.slice(1) : clean.charAt(0).toUpperCase() + clean.slice(1)
  }).join("")
  return key || "field"
}

function formValue(value: unknown): ResultFormValue {
  if (typeof value === "boolean") return value
  if (isStringArray(value)) return value.join(", ")
  return value === null || value === undefined ? "" : String(value)
}

function valueAtPath(data: Record<string, unknown>, path: string) {
  return path.split(".").reduce<unknown>((current, key) => {
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined
    return (current as Record<string, unknown>)[key]
  }, data)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
}

function resultFieldLabel(key: string) {
  return resultFieldLabels[key] ?? key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (char) => char.toUpperCase())
}

function text(value: unknown) {
  return typeof value === "string" && value ? value : null
}

function number(value: unknown) {
  return typeof value === "number" ? value : 0
}

function isActiveExecutionStatus(status: unknown) {
  return typeof status === "string" && activeExecutionStatuses.has(status)
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
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
