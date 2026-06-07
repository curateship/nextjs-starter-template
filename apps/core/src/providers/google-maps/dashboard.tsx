import * as React from "react"
import { Link } from "@tanstack/react-router"
import {
  ImageIcon,
  MapPinnedIcon,
  Loader2Icon,
  MailIcon,
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
import { useShellRuntime } from "@/components/shell-layout"
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
  CardAction,
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
import { Textarea } from "@/components/ui/textarea"
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
  loadHubDirectoryTemplateScan,
  exportGoogleMapsResultsToHub,
  saveGoogleMapsHubExportMappings,
  type GoogleMapsEnhanceField,
  type GoogleMapsHubExportMapping,
  type HubDirectoryTemplateScan,
  type HubExportSite,
  type HubExportStatus,
  type HubTemplateTarget,
} from "@/providers/google-maps/api"
import { DASHBOARD_ROWS_PER_PAGE_OPTIONS } from "@/lib/core"
import {
  googleMapsAdditionalInfoTags,
  googleMapsFieldKey,
  googleMapsFieldValue,
  parseRunInput,
  type GoogleMapsFieldSetting,
  type GoogleMapsFieldType,
} from "@/providers/google-maps/schema"
import type { ProviderResultItem, ProviderRunConfigItem, ProviderRunConfigStatus } from "@/providers/types"

type RunForm = {
  name: string
  keyword: string
  location: string
  coordinates: string
  language: string
  maxResults: number
  status: ProviderRunConfigStatus
}
type ResultForm = Record<string, string | boolean>
type ResultFormValue = string | boolean
type ResultSortColumn = "title" | "address" | "rating" | "reviews" | "phone" | "website" | "created"
type ResultModalTab = "fields" | "json"
type FieldSettingsTab = "selected" | "other"
type RunSortColumn = "name" | "location" | "limit" | "amount" | "status"
type SortDirection = "asc" | "desc"
type HubExportDialogStatus = "idle" | "loading" | "exporting"
type HubWiringDialogStatus = "idle" | "loading" | "saving"
type EnhanceDialogStatus = "idle" | "enhancing"

const statusLabels = {
  all: "All statuses",
  active: "Active",
  draft: "Draft",
  inactive: "Inactive",
} as const
const pageSizes = [...DASHBOARD_ROWS_PER_PAGE_OPTIONS]
const resultModalTabs: { id: ResultModalTab; label: string }[] = [
  { id: "fields", label: "Fields" },
  { id: "json", label: "JSON" },
]
const fieldSettingsTabs: { id: FieldSettingsTab; label: string }[] = [
  { id: "selected", label: "Selected Fields" },
  { id: "other", label: "Other Fields" },
]
const activeExecutionStatuses = new Set(["queued", "running"])
const enhanceFieldOptions: { id: GoogleMapsEnhanceField; label: string }[] = [
  { id: "instagram", label: "Instagram" },
  { id: "facebook", label: "Facebook" },
  { id: "tiktok", label: "TikTok" },
  { id: "twitter", label: "X/Twitter" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "youtube", label: "YouTube" },
  { id: "email", label: "Email" },
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
  "email",
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
  categoryName: "Primary category",
  neighborhood: "Neighborhood",
  region: "Region",
  country: "Country",
  countryCode: "Country code",
  email: "Email",
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  twitter: "X/Twitter",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  reviewCount: "Reviews",
}
const fixedResultFieldSettings: GoogleMapsFieldSetting[] = [
  { key: "description", sourcePath: "description", label: "Description", visible: true, editable: true, type: "text", order: 0 },
  { key: "neighborhood", sourcePath: "neighborhood", label: "Neighborhood", visible: true, editable: true, type: "text", order: 4 },
  { key: "city", sourcePath: "city", label: "City", visible: true, editable: true, type: "text", order: 7 },
  { key: "region", sourcePath: "region", label: "Region", visible: true, editable: true, type: "text", order: 8 },
  { key: "country", sourcePath: "country", label: "Country", visible: true, editable: true, type: "text", order: 9 },
  { key: "email", sourcePath: "email", label: "Email", visible: true, editable: true, type: "text", order: 19 },
  { key: "instagram", sourcePath: "instagram", label: "Instagram", visible: true, editable: true, type: "text", order: 20 },
  { key: "facebook", sourcePath: "facebook", label: "Facebook", visible: true, editable: true, type: "text", order: 21 },
  { key: "tiktok", sourcePath: "tiktok", label: "TikTok", visible: true, editable: true, type: "text", order: 22 },
  { key: "twitter", sourcePath: "twitter", label: "X/Twitter", visible: true, editable: true, type: "text", order: 23 },
  { key: "linkedin", sourcePath: "linkedin", label: "LinkedIn", visible: true, editable: true, type: "text", order: 24 },
  { key: "youtube", sourcePath: "youtube", label: "YouTube", visible: true, editable: true, type: "text", order: 25 },
]
const fixedResultFieldKeys = new Set(fixedResultFieldSettings.map((setting) => setting.key))
const descriptionResultFieldKeys = new Set(["description"])
const contactResultFieldKeys = new Set(enhanceFieldOptions.map((option) => option.id))
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
  const { config } = useShellRuntime()
  const [runs, setRuns] = React.useState<ProviderRunConfigItem[]>([])
  const [hasToken, setHasToken] = React.useState<boolean | null>(null)
  const [defaultMax, setDefaultMax] = React.useState(25)
  const [query, setQuery] = React.useState("")
  const [status, setStatus] = React.useState<keyof typeof statusLabels>("all")
  const [runSortColumn, setRunSortColumn] = React.useState<RunSortColumn | null>(null)
  const [runSortDirection, setRunSortDirection] = React.useState<SortDirection>("asc")
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(config.dashboardRowsPerPage)
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
    setForm(run ? runFormFromRun(run) : emptyForm(defaultMax))
    setOpen(true)
  }

  const save = async () => {
    setSaving(true)
    setMessage(null)
    try {
      const { run } = await saveGoogleMapsRun({ ...runPayloadFromForm(form), runId: editing?.id })
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
      const response = await saveGoogleMapsFieldSettings({ fieldSettings: fieldSettingsForSave(fieldSettingsDraft, fieldSettings) })
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
          <DialogBody>
            <CardGroup className="grid">
              <Card>
                <CardHeader>
                  <CardTitle>Apify query</CardTitle>
                  <CardDescription>Fields sent to the Google Maps actor.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                  <RunField id="keyword" label="Search term" value={form.keyword} onChange={(value) => setForm({ ...form, keyword: value })} />
                  <RunField id="location" label="Search area" value={form.location} onChange={(value) => setForm({ ...form, location: value })} />
                  <RunField id="language" label="Language" value={form.language} onChange={(value) => setForm({ ...form, language: value })} />
                  <RunField id="max-results" label="Max results" type="number" value={form.maxResults} onChange={(value) => setForm({ ...form, maxResults: Number(value) })} />
                  <RunField id="coordinates" label="Coordinates" value={form.coordinates} onChange={(value) => setForm({ ...form, coordinates: value })} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Core data and functions</CardTitle>
                  <CardDescription>Fields saved and applied inside Core.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                  <RunField id="name" label="Name (optional)" value={form.name} onChange={(value) => setForm({ ...form, name: value })} />
                  <div className="grid gap-2">
                    <Label htmlFor="status">Status</Label>
                    <Select value={form.status} onValueChange={(value) => setForm({ ...form, status: value as ProviderRunConfigStatus })}>
                      <SelectTrigger id="status" className="h-8 w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>
            </CardGroup>
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
  const { config } = useShellRuntime()
  const [data, setData] = React.useState<Awaited<ReturnType<typeof loadGoogleMapsRun>> | null>(null)
  const [loadingResults, setLoadingResults] = React.useState(true)
  const [query, setQuery] = React.useState("")
  const [sortColumn, setSortColumn] = React.useState<ResultSortColumn | null>("created")
  const [sortDirection, setSortDirection] = React.useState<SortDirection>("desc")
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(config.dashboardRowsPerPage)
  const [message, setMessage] = React.useState<{ tone: "error" | "success"; text: string } | null>(null)
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const [editingResult, setEditingResult] = React.useState<ProviderResultItem | null>(null)
  const [deleteIds, setDeleteIds] = React.useState<string[]>([])
  const [deletingResults, setDeletingResults] = React.useState(false)
  const [runningRun, setRunningRun] = React.useState(false)
  const [savingResult, setSavingResult] = React.useState(false)
  const [resultForm, setResultForm] = React.useState<ResultForm>({})
  const [resultModalTab, setResultModalTab] = React.useState<ResultModalTab>("fields")
  const [resultImagePickerOpen, setResultImagePickerOpen] = React.useState(false)
  const [hubExportOpen, setHubExportOpen] = React.useState(false)
  const [hubExportSites, setHubExportSites] = React.useState<HubExportSite[]>([])
  const [hubExportSiteId, setHubExportSiteId] = React.useState("")
  const [hubExportStatus, setHubExportStatus] = React.useState<HubExportStatus>("draft")
  const [hubExportState, setHubExportState] = React.useState<HubExportDialogStatus>("idle")
  const [hubWiringOpen, setHubWiringOpen] = React.useState(false)
  const [hubWiringSiteId, setHubWiringSiteId] = React.useState("")
  const [hubWiringState, setHubWiringState] = React.useState<HubWiringDialogStatus>("idle")
  const [hubWiringTemplate, setHubWiringTemplate] = React.useState<HubDirectoryTemplateScan | null>(null)
  const [hubWiringDraft, setHubWiringDraft] = React.useState<GoogleMapsHubExportMapping[]>([])
  const [enhanceOpen, setEnhanceOpen] = React.useState(false)
  const [enhanceFields, setEnhanceFields] = React.useState<GoogleMapsEnhanceField[]>(enhanceFieldOptions.map((option) => option.id))
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
  const descriptionResultFields = resultFields.filter((setting) => descriptionResultFieldKeys.has(setting.key))
  const dynamicResultFields = resultFields.filter((setting) => (
    setting.key !== "featuredImage" &&
    !descriptionResultFieldKeys.has(setting.key) &&
    !contactResultFieldKeys.has(setting.key)
  ))
  const contactResultFields = resultFields.filter((setting) => contactResultFieldKeys.has(setting.key))
  const hubWiringSourceOptions = React.useMemo(
    () => hubWiringSourceFields(data?.field_settings ?? []),
    [data?.field_settings]
  )
  const hubWiringTargets = React.useMemo(
    () => hubWiringTargetFields(hubWiringTemplate),
    [hubWiringTemplate]
  )
  const selectedHubMappings = (data?.hub_export_mappings ?? []).filter((mapping) => mapping.siteId === hubExportSiteId)
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
    setResultImagePickerOpen(false)
    setResultForm(resultFormFromData(result, data?.field_settings ?? []))
  }

  const loadHubSites = async () => {
    if (hubExportSites.length) return hubExportSites

    setHubExportState("loading")
    setMessage(null)
    try {
      const response = await loadHubExportSites()
      setHubExportSites(response.sites)
      setHubExportSiteId((current) => current || response.sites[0]?.id || "")
      return response.sites
    } catch (error) {
      setMessage({ tone: "error", text: providerError(error) })
      return []
    } finally {
      setHubExportState("idle")
    }
  }

  const openHubExport = async () => {
    setHubExportOpen(true)
    await loadHubSites()
  }

  const loadHubWiringTemplate = async (siteId: string) => {
    if (!siteId) return

    setHubWiringState("loading")
    setHubWiringTemplate(null)
    setMessage(null)
    try {
      setHubWiringTemplate(await loadHubDirectoryTemplateScan(siteId))
    } catch (error) {
      setMessage({ tone: "error", text: providerError(error) })
      setHubWiringTemplate(null)
    } finally {
      setHubWiringState("idle")
    }
  }

  const openHubWiring = async () => {
    setHubWiringOpen(true)
    const sites = await loadHubSites()
    const siteId = hubWiringSiteId || hubExportSiteId || sites[0]?.id || ""
    if (siteId) {
      setHubWiringSiteId(siteId)
      setHubWiringDraft((data?.hub_export_mappings ?? []).filter((mapping) => mapping.siteId === siteId))
      await loadHubWiringTemplate(siteId)
    }
  }

  const changeHubWiringSite = (siteId: string) => {
    setHubWiringSiteId(siteId)
    setHubExportSiteId((current) => current || siteId)
    setHubWiringDraft((data?.hub_export_mappings ?? []).filter((mapping) => mapping.siteId === siteId))
    void loadHubWiringTemplate(siteId)
  }

  const saveHubWiring = async () => {
    if (!hubWiringSiteId) return

    setHubWiringState("saving")
    setMessage(null)
    try {
      const response = await saveGoogleMapsHubExportMappings({
        siteId: hubWiringSiteId,
        mappings: hubWiringDraft.map((mapping) => ({ ...mapping, siteId: hubWiringSiteId })),
      })
      setData((current) => current ? { ...current, hub_export_mappings: response.hub_export_mappings } : current)
      setHubWiringOpen(false)
      setMessage({ tone: "success", text: "Hub wiring saved." })
    } catch (error) {
      setMessage({ tone: "error", text: providerError(error) })
    } finally {
      setHubWiringState("idle")
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
    if (!selectedIds.size || !enhanceFields.length) return

    setEnhanceState("enhancing")
    setMessage(null)
    try {
      const response = await enhanceGoogleMapsResults({
        runId,
        resultIds: Array.from(selectedIds),
        platforms: enhanceFields,
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

  const toggleEnhanceField = (field: GoogleMapsEnhanceField, checked: boolean) => {
    setEnhanceFields((current) => {
      if (checked) return current.includes(field) ? current : [...current, field]
      return current.filter((item) => item !== field)
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
            <Button variant="outline" size="sm" className="h-8 gap-2 sm:h-9" onClick={() => void openHubWiring()}>
              <SettingsIcon className="size-4" />
              Hub wiring
            </Button>
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
              <TableHead column="meta">Google Map</TableHead>
              <TableHead column="meta"><TableSortButton active={sortColumn === "website"} direction={sortDirection} onClick={() => toggleSort("website")}>Website</TableSortButton></TableHead>
              <TableHead column="meta">Contact</TableHead>
              <TableHead column="meta"><TableSortButton active={sortColumn === "rating"} direction={sortDirection} onClick={() => toggleSort("rating")}>Rating</TableSortButton></TableHead>
              <TableHead column="meta"><TableSortButton active={sortColumn === "reviews"} direction={sortDirection} onClick={() => toggleSort("reviews")}>Reviews</TableSortButton></TableHead>
              <TableHead column="meta"><TableSortButton active={sortColumn === "phone"} direction={sortDirection} onClick={() => toggleSort("phone")}>Phone</TableSortButton></TableHead>
              <TableHead column="meta"><TableSortButton active={sortColumn === "created"} direction={sortDirection} onClick={() => toggleSort("created")}>Date added</TableSortButton></TableHead>
              <TableHead column="meta">Actions</TableHead>
            </TableRow>
          </TableHeader>
        }
        isEmpty={!loadingResults && results.length === 0}
        emptyText="No results found."
        emptyColSpan={10}
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
          const mapsHref = safeExternalHref(text(result.data.mapsUrl))
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
              <TableCell column="meta">{mapsHref ? <Button asChild variant="outline" size="sm" className="h-8"><a href={mapsHref} target="_blank" rel="noopener noreferrer">Map</a></Button> : "None"}</TableCell>
              <TableCell column="meta">{websiteHref ? <Button asChild variant="outline" size="sm" className="h-8"><a href={websiteHref} target="_blank" rel="noopener noreferrer">Visit</a></Button> : "None"}</TableCell>
              <TableCell column="meta"><ContactLinks data={result.data} /></TableCell>
              <TableCell column="meta">{typeof result.data.rating === "number" ? result.data.rating : "Unknown"}</TableCell>
              <TableCell column="meta">{typeof result.data.reviewCount === "number" ? result.data.reviewCount : "Unknown"}</TableCell>
              <TableCell column="meta">{text(result.data.phone) ?? "Unknown"}</TableCell>
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
                    <CardTitle>Description</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-4 sm:grid-cols-2">
                    {descriptionResultFields.map((setting) => (
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
                  <CardHeader>
                    <CardTitle>Dynamic fields</CardTitle>
                    <CardDescription>Fields saved on the Google Maps result.</CardDescription>
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
                  <CardHeader>
                    <CardTitle>Contact fields</CardTitle>
                    <CardDescription>Fields filled by the manual enhancement.</CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-4 sm:grid-cols-2">
                    {contactResultFields.map((setting) => (
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
        mappingCount={selectedHubMappings.length}
        onOpenChange={setHubExportOpen}
        onSiteChange={setHubExportSiteId}
        onStatusChange={setHubExportStatus}
        onExport={() => void exportToHub()}
      />

      <HubWiringDialog
        open={hubWiringOpen}
        sites={hubExportSites}
        siteId={hubWiringSiteId}
        state={hubWiringState}
        template={hubWiringTemplate}
        mappings={hubWiringDraft}
        sourceOptions={hubWiringSourceOptions}
        targetOptions={hubWiringTargets}
        onOpenChange={setHubWiringOpen}
        onSiteChange={changeHubWiringSite}
        onMappingsChange={setHubWiringDraft}
        onSave={() => void saveHubWiring()}
      />

      <EnhanceDataDialog
        count={selectedIds.size}
        open={enhanceOpen}
        fields={enhanceFields}
        state={enhanceState}
        onOpenChange={setEnhanceOpen}
        onFieldChange={toggleEnhanceField}
        onEnhance={() => void enhanceData()}
      />
    </div>
  )
}

function EnhanceDataDialog({
  count,
  open,
  fields,
  state,
  onOpenChange,
  onFieldChange,
  onEnhance,
}: {
  count: number
  open: boolean
  fields: GoogleMapsEnhanceField[]
  state: EnhanceDialogStatus
  onOpenChange: (open: boolean) => void
  onFieldChange: (field: GoogleMapsEnhanceField, checked: boolean) => void
  onEnhance: () => void
}) {
  const enhancing = state === "enhancing"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>Enhance Data</DialogTitle>
          <DialogDescription>Find social accounts and contact emails from each selected venue website.</DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-4">
          <div className="grid gap-2">
            <Label>Method</Label>
            <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">Website homepage</div>
          </div>
          <div className="grid gap-3">
            <Label>Contact fields</Label>
            <div className="flex flex-wrap gap-3">
              {enhanceFieldOptions.map((field) => (
                <label key={field.id} className="flex w-fit items-center gap-2 rounded-md border px-3 py-2 text-sm">
                  <Checkbox
                    checked={fields.includes(field.id)}
                    onCheckedChange={(checked) => onFieldChange(field.id, checked === true)}
                    disabled={enhancing}
                  />
                  {field.label}
                </label>
              ))}
            </div>
          </div>
        </DialogBody>
        <DialogFooter variant="plain">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={enhancing}>Cancel</Button>
          <Button onClick={onEnhance} disabled={enhancing || count === 0 || fields.length === 0}>
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
  mappingCount,
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
  mappingCount: number
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
          {!loading && sites.length && siteId && mappingCount === 0 ? (
            <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              No Hub wiring is saved for this site. Directory data will export, but Hub template blocks will not be filled.
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

function HubWiringDialog({
  open,
  sites,
  siteId,
  state,
  template,
  mappings,
  sourceOptions,
  targetOptions,
  onOpenChange,
  onSiteChange,
  onMappingsChange,
  onSave,
}: {
  open: boolean
  sites: HubExportSite[]
  siteId: string
  state: HubWiringDialogStatus
  template: HubDirectoryTemplateScan | null
  mappings: GoogleMapsHubExportMapping[]
  sourceOptions: HubWiringSourceOption[]
  targetOptions: HubWiringTargetOption[]
  onOpenChange: (open: boolean) => void
  onSiteChange: (siteId: string) => void
  onMappingsChange: (mappings: GoogleMapsHubExportMapping[]) => void
  onSave: () => void
}) {
  const loading = state === "loading"
  const saving = state === "saving"
  const canAdd = Boolean(siteId && sourceOptions.length && targetOptions.length)
  const autoMapResult = React.useMemo(
    () => hubWiringAutoMap(siteId, sourceOptions, targetOptions),
    [siteId, sourceOptions, targetOptions]
  )
  const canAutoMap = Boolean(siteId && autoMapResult.mappings.length)

  const addMapping = () => {
    if (!canAdd) return
    const target = targetOptions[0]
    onMappingsChange([
      ...mappings,
      {
        siteId,
        sourceKey: sourceOptions[0].key,
        targetBlockId: target.blockId,
        targetKind: target.kind,
        targetFieldKey: target.fieldKey,
      },
    ])
  }

  const updateMapping = (index: number, changes: Partial<GoogleMapsHubExportMapping>) => {
    onMappingsChange(mappings.map((mapping, itemIndex) => itemIndex === index ? { ...mapping, ...changes, siteId } : mapping))
  }

  const updateTarget = (index: number, value: string) => {
    const target = targetOptions.find((option) => option.value === value)
    if (!target) return
    updateMapping(index, {
      targetBlockId: target.blockId,
      targetKind: target.kind,
      targetFieldKey: target.fieldKey,
    })
  }

  const removeMapping = (index: number) => {
    onMappingsChange(mappings.filter((_, itemIndex) => itemIndex !== index))
  }

  const autoMap = () => {
    if (!canAutoMap) return
    onMappingsChange(autoMapResult.mappings)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="admin" className="max-h-[85vh] w-[960px] max-w-[calc(100vw-2rem)] sm:max-w-[960px]">
        <DialogHeader>
          <DialogTitle>Hub Wiring</DialogTitle>
          <DialogDescription>Map Core result fields to blocks in the Hub directory template.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="grid gap-2">
            <Label>Hub site</Label>
            <Select value={siteId} onValueChange={onSiteChange} disabled={loading || saving || !sites.length}>
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

          <CardGroup className="grid">
            <Card>
              <CardHeader>
                <CardTitle>Mappings</CardTitle>
                <CardDescription>
                  {template?.template ? `Default template: ${template.template.name}` : "Select a site to scan its default template."}
                </CardDescription>
                <CardAction>
                  <Button type="button" variant="outline" onClick={autoMap} disabled={!canAutoMap || loading || saving}>
                    <SparklesIcon className="size-4" />
                    Auto map
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent className="grid gap-4">
                <p className="text-sm text-muted-foreground">
                  {autoMapResult.mappings.length
                    ? `${autoMapResult.mappings.length} automatic ${autoMapResult.mappings.length === 1 ? "match" : "matches"} available.`
                    : "No automatic matches available."}
                </p>
                {mappings.length ? mappings.map((mapping, index) => (
                  <div key={`${mapping.sourceKey}-${mapping.targetBlockId}-${mapping.targetFieldKey}-${index}`} className="grid gap-3 rounded-md border p-3 lg:grid-cols-[minmax(160px,1fr)_minmax(220px,1.5fr)_auto]">
                    <div className="grid gap-2">
                      <Label>Core field</Label>
                      <Select value={mapping.sourceKey} onValueChange={(sourceKey) => updateMapping(index, { sourceKey })} disabled={saving}>
                        <SelectTrigger size="default" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {sourceOptions.map((option) => (
                            <SelectItem key={option.key} value={option.key}>{option.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label>Hub target</Label>
                      <Select value={hubWiringTargetValue(mapping)} onValueChange={(value) => updateTarget(index, value)} disabled={saving || !targetOptions.length}>
                        <SelectTrigger size="default" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {targetOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-end">
                      <Button type="button" variant="outline" className="w-full" onClick={() => removeMapping(index)} disabled={saving}>
                        <Trash2Icon className="size-4" />
                        Remove
                      </Button>
                    </div>
                  </div>
                )) : (
                  <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                    No mappings yet.
                  </div>
                )}
                <div>
                  <Button type="button" variant="outline" onClick={addMapping} disabled={!canAdd || saving}>
                    <PlusIcon className="size-4" />
                    Add mapping
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="border-destructive/40 bg-destructive/5">
              <CardHeader>
                <CardTitle>Not auto-mapped</CardTitle>
                <CardDescription>Core fields with no matching Hub target in the selected template.</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <p className="text-sm text-muted-foreground">Loading Hub template fields...</p>
                ) : !template ? (
                  <p className="text-sm text-muted-foreground">Select a Hub site to check missing fields.</p>
                ) : autoMapResult.unmatched.length ? (
                  <div className="flex flex-wrap gap-2">
                    {autoMapResult.unmatched.map((field) => (
                      <Badge key={field.key} variant="outline" className="border-destructive/30 text-destructive">
                        {field.label}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">All available Core fields have an automatic match.</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Template blocks</CardTitle>
                <CardDescription>Blocks found in the selected site’s default directory template.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                {loading ? (
                  <Skeleton className="h-20 w-full" />
                ) : template?.blocks.length ? template.blocks.map((block) => (
                  <div key={block.id} className="rounded-md border p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{block.title}</span>
                      <Badge variant="secondary">{block.type}</Badge>
                      <span className="text-xs text-muted-foreground">{block.layout_column}</span>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      {block.targets.length ? block.targets.map((target) => target.label).join(", ") : "No mappable fields"}
                    </div>
                  </div>
                )) : (
                  <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                    No default template blocks found.
                  </div>
                )}
              </CardContent>
            </Card>
          </CardGroup>
        </DialogBody>
        <DialogFooter variant="plain">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={onSave} disabled={loading || saving || !siteId}>
            {saving ? "Saving..." : "Save wiring"}
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

type HubWiringSourceOption = {
  key: string
  label: string
}

type HubWiringTargetOption = {
  value: string
  blockId: string
  kind: GoogleMapsHubExportMapping["targetKind"]
  fieldKey: string
  label: string
}

type HubWiringAutoMapResult = {
  mappings: GoogleMapsHubExportMapping[]
  unmatched: HubWiringSourceOption[]
}

const hubWiringSocialFieldKeys = new Set(["instagram", "facebook", "tiktok", "twitter", "linkedin", "youtube"])

function hubWiringSourceFields(fieldSettings: GoogleMapsFieldSetting[]): HubWiringSourceOption[] {
  const options = new Map<string, string>([
    ["businessName", "Title"],
    ["featuredImage", "Featured image"],
    ["google_maps_place_id", "Google Maps Place ID"],
    ["description", "Description"],
    ["address", "Address"],
    ["phone", "Phone"],
    ["website", "Website"],
    ["email", "Email"],
    ["instagram", "Instagram"],
    ["facebook", "Facebook"],
    ["tiktok", "TikTok"],
    ["twitter", "X/Twitter"],
    ["linkedin", "LinkedIn"],
    ["youtube", "YouTube"],
    ["mapsUrl", "Google Maps URL"],
  ])

  fieldSettings.filter((setting) => setting.visible).forEach((setting) => {
    if (readOnlyResultFields.has(setting.key) && setting.key !== "featuredImage" && setting.key !== "mapsUrl") return
    options.set(setting.key, setting.label)
  })

  return Array.from(options.entries()).map(([key, label]) => ({ key, label }))
}

function hubWiringTargetFields(template: HubDirectoryTemplateScan | null): HubWiringTargetOption[] {
  if (!template) return []

  const builtInTargets: HubWiringTargetOption[] = [
    {
      value: hubWiringTargetOptionValue("__directory__", { kind: "directoryTitle", field_key: "title" }),
      blockId: "__directory__",
      kind: "directoryTitle",
      fieldKey: "title",
      label: "Built-in - Title",
    },
    {
      value: hubWiringTargetOptionValue("__directory__", { kind: "directoryFeaturedImage", field_key: "featuredImage" }),
      blockId: "__directory__",
      kind: "directoryFeaturedImage",
      fieldKey: "featuredImage",
      label: "Built-in - Featured image",
    },
  ]
  const blockTargets = (template.blocks ?? []).flatMap((block) => (
    block.targets.map((target) => {
      const value = hubWiringTargetOptionValue(block.id, target)
      return {
        value,
        blockId: block.id,
        kind: target.kind,
        fieldKey: target.field_key,
        label: `${block.title} - ${target.label}`,
      }
    })
  ))

  return [...builtInTargets, ...blockTargets]
}

function hubWiringAutoMap(siteId: string, sourceOptions: HubWiringSourceOption[], targetOptions: HubWiringTargetOption[]): HubWiringAutoMapResult {
  if (!siteId || !sourceOptions.length || !targetOptions.length) {
    return { mappings: [], unmatched: sourceOptions }
  }

  const usedTargets = new Set<string>()
  const mappings: GoogleMapsHubExportMapping[] = []
  const unmatched: HubWiringSourceOption[] = []

  sourceOptions.forEach((source) => {
    const target = hubWiringAutoTarget(source, targetOptions.filter((option) => !usedTargets.has(option.value)))
    if (!target) {
      unmatched.push(source)
      return
    }

    usedTargets.add(target.value)
    mappings.push({
      siteId,
      sourceKey: source.key,
      targetBlockId: target.blockId,
      targetKind: target.kind,
      targetFieldKey: target.fieldKey,
    })
  })

  return { mappings, unmatched }
}

function hubWiringAutoTarget(source: HubWiringSourceOption, targetOptions: HubWiringTargetOption[]) {
  const candidates = targetOptions
    .map((target) => ({ target, score: hubWiringAutoTargetScore(source, target) }))
    .filter((candidate) => candidate.score !== null)
    .sort((a, b) => a.score! - b.score!)

  if (!candidates.length) return null

  const bestScore = candidates[0].score
  const bestCandidates = candidates.filter((candidate) => candidate.score === bestScore)
  return bestCandidates.length === 1 ? bestCandidates[0].target : null
}

function hubWiringAutoTargetScore(source: HubWiringSourceOption, target: HubWiringTargetOption) {
  const sourceKey = source.key
  const sourceLabel = normalizedHubWiringLabel(source.label)
  const targetLabel = normalizedHubWiringLabel(target.label)

  if (sourceKey === "description" && target.kind === "richTextBody") return 0
  if (sourceKey === "businessName" && target.kind === "directoryTitle") return 0
  if (sourceKey === "featuredImage" && target.kind === "directoryFeaturedImage") return 0
  if (sourceKey === "google_maps_place_id" && target.kind === "openingHoursPlaceId") return 0
  if (sourceKey === "address" && target.kind === "googleMapLocationQuery") return 0
  if (sourceKey === "mapsUrl" && target.kind === "coreMenuLink" && target.fieldKey === "directions") return 0
  if ((sourceKey === "phone" || sourceKey === "website" || sourceKey === "email") && target.kind === "coreMenuLink" && target.fieldKey === sourceKey) return 0
  if (hubWiringSocialFieldKeys.has(sourceKey) && target.kind === "coreSocialLink" && target.fieldKey === sourceKey) return 0
  if (target.kind === "customField" && target.fieldKey === sourceKey) return 5
  if (target.kind === "customField" && targetLabel.endsWith(sourceLabel)) return 6

  return null
}

function normalizedHubWiringLabel(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "")
}

function hubWiringTargetOptionValue(blockId: string, target: Pick<HubTemplateTarget, "kind" | "field_key">) {
  return `${blockId}::${target.kind}::${target.field_key}`
}

function hubWiringTargetValue(mapping: GoogleMapsHubExportMapping) {
  return `${mapping.targetBlockId}::${mapping.targetKind}::${mapping.targetFieldKey || hubWiringDefaultTargetFieldKey(mapping.targetKind)}`
}

function hubWiringDefaultTargetFieldKey(targetKind: GoogleMapsHubExportMapping["targetKind"]) {
  if (targetKind === "directoryTitle") return "title"
  if (targetKind === "directoryFeaturedImage") return "featuredImage"
  if (targetKind === "richTextBody") return "body"
  if (targetKind === "googleMapLocationQuery") return "locationQuery"
  if (targetKind === "openingHoursPlaceId") return "placeId"
  return ""
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
      <TableCell column="meta"><Skeleton className="h-8 w-14" /></TableCell>
      <TableCell column="meta"><Skeleton className="h-7 w-20" /></TableCell>
      <TableCell column="meta"><Skeleton className="h-8 w-14" /></TableCell>
      <TableCell column="meta"><Skeleton className="h-4 w-10" /></TableCell>
      <TableCell column="meta"><Skeleton className="h-4 w-12" /></TableCell>
      <TableCell column="meta"><Skeleton className="h-4 w-28" /></TableCell>
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
  const isDescription = id === "result-description"

  return (
    <div className={`grid gap-2 ${isDescription ? "sm:col-span-2" : ""}`}>
      <Label htmlFor={id}>{label}</Label>
      {isDescription ? (
        <AutoHeightTextarea
          id={id}
          value={String(value)}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <Input
          id={id}
          type={type === "number" ? "number" : "text"}
          value={String(value)}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </div>
  )
}

function AutoHeightTextarea({
  value,
  className,
  ...props
}: React.ComponentProps<typeof Textarea>) {
  const ref = React.useRef<HTMLTextAreaElement>(null)

  React.useLayoutEffect(() => {
    const textarea = ref.current
    if (!textarea) return
    textarea.style.height = "auto"
    textarea.style.height = `${textarea.scrollHeight}px`
  }, [value])

  return (
    <Textarea
      ref={ref}
      className={`min-h-10 resize-none overflow-hidden shadow-none ${className ?? ""}`}
      value={value}
      rows={1}
      {...props}
    />
  )
}

function emptyForm(maxResults: number): RunForm {
  return { name: "", keyword: "", location: "", coordinates: "", language: "en", maxResults, status: "active" }
}

function runFormFromRun(run: ProviderRunConfigItem): RunForm {
  const input = parseRunInput(run.input)
  return {
    name: run.name,
    status: run.status,
    keyword: input.keyword,
    location: input.location,
    coordinates: coordinatesValue(input.latitude, input.longitude),
    language: input.language,
    maxResults: input.maxResults,
  }
}

function runPayloadFromForm(form: RunForm) {
  const coordinates = parseCoordinates(form.coordinates)
  return {
    name: form.name,
    keyword: form.keyword,
    location: form.location,
    latitude: coordinates?.latitude ?? null,
    longitude: coordinates?.longitude ?? null,
    language: form.language,
    maxResults: form.maxResults,
    status: form.status,
  }
}

function coordinatesValue(latitude: number | null, longitude: number | null) {
  return latitude === null || longitude === null ? "" : `${latitude}, ${longitude}`
}

function parseCoordinates(value: string) {
  if (!value.trim()) return null

  const parts = value.split(",")
  if (parts.length !== 2) throw new Error("Coordinates must use latitude, longitude.")

  const [latitudeText, longitudeText] = parts
  const latitude = Number(latitudeText?.trim())
  const longitude = Number(longitudeText?.trim())
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) throw new Error("Coordinates must use latitude, longitude.")
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    throw new Error("Coordinates are outside the valid latitude/longitude range.")
  }
  return { latitude, longitude }
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
    settingsByKey.set(setting.key, { ...setting, order: setting.key === "description" ? setting.order : settingsByKey.get(setting.key)?.order ?? setting.order })
  })

  return Array.from(settingsByKey.values())
    .filter((setting) => setting.key === "businessName" || fixedResultFieldKeys.has(setting.key) || (setting.visible && resultFieldHasValue(result, setting)))
    .sort((a, b) => a.order - b.order)
}

function fieldSettingsForResults(results: ProviderResultItem[], savedSettings: GoogleMapsFieldSetting[]) {
  const discovered = mergeDiscoveredFieldSettings(results.flatMap(discoverFieldSettings))
  if (!savedSettings.length) return discovered

  const discoveredAdditionalInfoSettings = discovered.filter((setting) => isAdditionalInfoFieldSetting(setting))
  const savedSourcePaths = new Set(savedSettings.map((setting) => setting.sourcePath))
  const savedKeys = new Set(savedSettings.map((setting) => setting.key))
  const mergedSavedSettings = savedSettings.map((setting) => {
    const discoveredSetting = discoveredAdditionalInfoSettings.find((item) => (
      item.sourcePath === setting.sourcePath || (isAdditionalInfoFieldSetting(setting) && item.key === setting.key)
    ))
    if (!discoveredSetting) return setting

    return {
      ...setting,
      visible: true,
      editable: true,
      type: "tags" as const,
    }
  })
  const missing = discovered
    .filter((setting) => !savedSourcePaths.has(setting.sourcePath) && !savedKeys.has(setting.key))
    .map((setting, index) => {
      const visible = isAdditionalInfoFieldSetting(setting) ? setting.visible : false
      return { ...setting, visible, editable: visible && setting.editable, order: savedSettings.length + index }
    })

  return [...mergedSavedSettings, ...missing].sort((a, b) => a.order - b.order)
}

function fieldSettingsForSave(settings: GoogleMapsFieldSetting[], savedSettings: GoogleMapsFieldSetting[]) {
  const savedSourcePaths = new Set(savedSettings.map((setting) => setting.sourcePath))
  const savedKeys = new Set(savedSettings.map((setting) => setting.key))

  return settings
    .filter((setting) => setting.visible || savedSourcePaths.has(setting.sourcePath) || savedKeys.has(setting.key))
    .map((setting, index) => ({ ...setting, order: index }))
}

function isAdditionalInfoFieldSetting(setting: GoogleMapsFieldSetting) {
  return setting.sourcePath.includes(".additionalInfo.")
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
    if (!isSupportedFieldValue(value)) {
      return
    }
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

function collectAdditionalInfoFieldSettings(
  value: unknown,
  sourcePath: string,
  usedKeys: Set<string>,
  settings: GoogleMapsFieldSetting[]
) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return

  Object.entries(value as Record<string, unknown>).forEach(([group, groupValue]) => {
    const tags = googleMapsAdditionalInfoTags(groupValue)
    if (!tags.length) return

    settings.push(candidateFieldSetting({
      key: group,
      sourcePath: `${sourcePath}.${group}`,
      label: group,
      value: tags,
      visible: true,
      editable: true,
      usedKeys,
      order: settings.length,
    }))
  })
}

function collectRawFieldSettings(
  value: unknown,
  sourcePath: string,
  usedKeys: Set<string>,
  settings: GoogleMapsFieldSetting[]
) {
  if (sourcePath === "raw.additionalInfo") {
    collectAdditionalInfoFieldSettings(value, sourcePath, usedKeys, settings)
    return
  }

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
  label,
}: {
  key: string
  sourcePath: string
  value: unknown
  visible: boolean
  editable: boolean
  usedKeys: Set<string>
  order: number
  label?: string
}): GoogleMapsFieldSetting {
  const cleanKey = uniqueFieldKey(key, usedKeys)
  return {
    key: cleanKey,
    sourcePath,
    label: label ?? resultFieldLabel(cleanKey),
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
  return googleMapsFieldValue(data, setting.key, setting.sourcePath)
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
  return googleMapsFieldKey(value)
}

function formValue(value: unknown): ResultFormValue {
  if (typeof value === "boolean") return value
  if (isStringArray(value)) return value.join(", ")
  return value === null || value === undefined ? "" : String(value)
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

function ContactLinks({ data }: { data: Record<string, unknown> }) {
  const links = contactLinks(data)
  if (!links.length) return <span className="text-muted-foreground">None</span>

  return (
    <div className="flex items-center gap-1">
      {links.map((link) => (
        <Button key={`${link.type}-${link.href}`} asChild variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-foreground">
          <a href={link.href} target={link.type === "email" ? undefined : "_blank"} rel={link.type === "email" ? undefined : "noopener noreferrer"} aria-label={link.label} title={link.label}>
            <ContactIcon type={link.type} />
          </a>
        </Button>
      ))}
    </div>
  )
}

function ContactIcon({ type }: { type: ContactLink["type"] }) {
  if (type === "email") return <MailIcon className="size-4" />
  return <BrandIcon type={type} />
}

function BrandIcon({ type }: { type: Exclude<ContactLink["type"], "email"> }) {
  const path = brandIconPaths[type]

  return (
    <svg viewBox="0 0 24 24" className="size-3.5 fill-current" aria-hidden="true">
      <path d={path} />
    </svg>
  )
}

type ContactLink = {
  href: string
  label: string
  type: "email" | "instagram" | "facebook" | "tiktok" | "twitter" | "linkedin" | "youtube"
}

const brandIconPaths: Record<Exclude<ContactLink["type"], "email">, string> = {
  instagram: "M7.8 2h8.4A5.8 5.8 0 0 1 22 7.8v8.4a5.8 5.8 0 0 1-5.8 5.8H7.8A5.8 5.8 0 0 1 2 16.2V7.8A5.8 5.8 0 0 1 7.8 2Zm0 2A3.8 3.8 0 0 0 4 7.8v8.4A3.8 3.8 0 0 0 7.8 20h8.4a3.8 3.8 0 0 0 3.8-3.8V7.8A3.8 3.8 0 0 0 16.2 4H7.8Zm8.7 2.1a1.4 1.4 0 1 1 0 2.8 1.4 1.4 0 0 1 0-2.8ZM12 7.1a4.9 4.9 0 1 1 0 9.8 4.9 4.9 0 0 1 0-9.8Zm0 2a2.9 2.9 0 1 0 0 5.8 2.9 2.9 0 0 0 0-5.8Z",
  facebook: "M14 8.3V6.8c0-.8.3-1.2 1.3-1.2h1.5V2.2c-.8-.1-1.7-.2-2.5-.2-2.6 0-4.4 1.6-4.4 4.5v1.8H7v3.8h2.9V22H14v-9.9h2.8l.5-3.8H14Z",
  tiktok: "M16.6 2c.4 3 2.1 4.8 5.1 5v3.4a8.8 8.8 0 0 1-5.1-1.6v6.4c0 8.1-8.8 10.6-12.4 4.8-2.3-3.7-.9-10.2 6.5-10.5V13c-1 .2-2 .6-2.6 1.3-1.7 1.8-1.2 5 1.2 5.8 2.3.8 4.3-.9 4.3-3.4V2h3Z",
  twitter: "M13.9 10.5 21.4 2h-1.8l-6.5 7.4L7.9 2H2l7.8 11.2L2 22h1.8l6.8-7.7 5.5 7.7H22l-8.1-11.5Zm-2.4 2.7-.8-1.1L4.4 3.3h2.7l5.1 7.1.8 1.1 6.6 9.2h-2.7l-5.4-7.5Z",
  linkedin: "M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9.8h4v11.7H3V9.8Zm6.4 0h3.8v1.6h.1c.5-.9 1.8-1.9 3.7-1.9 4 0 4.7 2.6 4.7 6v6h-4v-5.3c0-1.3 0-2.9-1.8-2.9s-2.1 1.4-2.1 2.8v5.4h-4V9.8Z",
  youtube: "M23.5 6.2s-.2-1.7-1-2.4c-1-1-2-1-2.5-1.1C16.5 2.5 12 2.5 12 2.5s-4.5 0-8 .2c-.5.1-1.6.1-2.5 1.1-.8.7-1 2.4-1 2.4S0 8.1 0 10v1.8c0 1.9.5 3.8.5 3.8s.2 1.7 1 2.4c1 1 2.2 1 2.8 1.1 2 .2 7.7.2 7.7.2s4.5 0 8-.3c.5 0 1.6 0 2.5-1 .8-.7 1-2.4 1-2.4s.5-1.9.5-3.8V10c0-1.9-.5-3.8-.5-3.8ZM9.5 14.8V7.9l6.5 3.5-6.5 3.4Z",
}

function contactLinks(data: Record<string, unknown>): ContactLink[] {
  const links: ContactLink[] = []
  const email = emailHref(text(data.email))
  if (email) links.push({ href: email, label: "Email", type: "email" })

  contactSocialFields.forEach((field) => {
    const href = safeExternalHref(text(data[field.type]))
    if (href) links.push({ href, label: field.label, type: field.type })
  })

  return links
}

const contactSocialFields: Array<Pick<ContactLink, "label" | "type">> = [
  { type: "instagram", label: "Instagram" },
  { type: "facebook", label: "Facebook" },
  { type: "tiktok", label: "TikTok" },
  { type: "twitter", label: "X/Twitter" },
  { type: "linkedin", label: "LinkedIn" },
  { type: "youtube", label: "YouTube" },
]

function emailHref(value: string | null) {
  if (!value) return null
  const email = value.trim()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? `mailto:${email}` : null
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
