import * as React from "react"
import { Link } from "@tanstack/react-router"
import {
  MapPinnedIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  RefreshCwIcon,
  SettingsIcon,
} from "lucide-react"

import { DashboardTable } from "@/components/dashboard-table"
import {
  DashboardToolbarSearch,
  DashboardToolbarSelectTrigger,
} from "@/components/dashboard-toolbar"
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
} from "@/components/ui/table"
import {
  loadGoogleMapsRun,
  loadGoogleMapsRuns,
  refreshGoogleMapsExecution,
  saveGoogleMapsRun,
  scraperError,
  startGoogleMapsRun,
} from "@/scrapers/google-maps/api"
import { importedCount, parseRunInput } from "@/scrapers/google-maps/schema"
import type { ScraperRunItem, ScraperRunStatus } from "@/scrapers/types"

type RunForm = {
  name: string
  keyword: string
  location: string
  language: string
  maxResults: number
  status: ScraperRunStatus
}

const statusLabels = {
  all: "All statuses",
  active: "Active",
  draft: "Draft",
  inactive: "Inactive",
} as const
const pageSizes = [10, 25, 50]

export function GoogleMapsDashboard() {
  const [runs, setRuns] = React.useState<ScraperRunItem[]>([])
  const [hasToken, setHasToken] = React.useState(false)
  const [defaultMax, setDefaultMax] = React.useState(25)
  const [query, setQuery] = React.useState("")
  const [status, setStatus] = React.useState<keyof typeof statusLabels>("all")
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(10)
  const [saving, setSaving] = React.useState(false)
  const [message, setMessage] = React.useState<{ tone: "error" | "success"; text: string } | null>(null)
  const [editing, setEditing] = React.useState<ScraperRunItem | null>(null)
  const [open, setOpen] = React.useState(false)
  const [form, setForm] = React.useState<RunForm>(() => emptyForm(25))

  React.useEffect(() => {
    void loadGoogleMapsRuns()
      .then(({ runs, settings }) => {
        setRuns(runs)
        setHasToken(settings.has_token)
        setDefaultMax(settings.default_max_results)
      })
      .catch((error) => setMessage({ tone: "error", text: scraperError(error) }))
  }, [])

  const filtered = runs.filter((run) => {
    const input = parseRunInput(run.input)
    const term = query.trim().toLowerCase()
    return (status === "all" || run.status === status) &&
      (!term || [run.name, input.keyword, input.location].some((value) => value.toLowerCase().includes(term)))
  })
  const totalPages = Math.ceil(filtered.length / pageSize)
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize)

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(1)
  }, [query, status, pageSize])

  const edit = (run?: ScraperRunItem) => {
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
      setMessage({ tone: "error", text: scraperError(error) })
    } finally {
      setSaving(false)
    }
  }

  const start = async (run: ScraperRunItem) => {
    setMessage(null)
    try {
      await startGoogleMapsRun(run.id)
      setMessage({ tone: "success", text: `Started ${run.name}.` })
    } catch (error) {
      setMessage({ tone: "error", text: scraperError(error) })
    }
  }

  return (
    <div className="w-full pb-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="font-heading text-xl font-semibold">Google Maps</h1>
          <p className="text-sm text-muted-foreground">Saved Apify searches.</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm" className="h-8 gap-2 sm:h-9">
            <Link to="/admin/settings/$tab" params={{ tab: "scrapers" }}>
              <SettingsIcon className="size-4" />
              Settings
            </Link>
          </Button>
          <Button size="sm" className="h-8 gap-2 sm:h-9" onClick={() => edit()}>
            <PlusIcon className="size-4" />
            New Run
          </Button>
        </div>
      </div>

      <DashboardTable
        title="Runs"
        icon={<MapPinnedIcon className="size-4 text-muted-foreground sm:size-[18px]" />}
        count={filtered.length}
        status={message ?? (!hasToken ? { tone: "error", text: "Add an Apify API token in scraper settings before starting runs." } : null)}
        controls={
          <>
            <DashboardToolbarSearch value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search runs..." />
            <Select value={status} onValueChange={(value) => setStatus(value as keyof typeof statusLabels)}>
              <DashboardToolbarSelectTrigger aria-label="Filter by status" labels={Object.values(statusLabels)}>
                <SelectValue />
              </DashboardToolbarSelectTrigger>
              <SelectContent>
                {Object.entries(statusLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
              </SelectContent>
            </Select>
          </>
        }
        header={
          <TableHeader>
            <TableRow>
              <TableHead column="main">Run</TableHead>
              <TableHead column="meta">Location</TableHead>
              <TableHead column="meta">Limit</TableHead>
              <TableHead column="meta">Status</TableHead>
              <TableHead column="meta">Actions</TableHead>
            </TableRow>
          </TableHeader>
        }
        isEmpty={visible.length === 0}
        emptyText="No runs found."
        emptyColSpan={5}
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
            <TableRow key={run.id}>
              <TableCell column="main">
                <Link className="font-medium hover:underline" to="/admin/scrapers/google-maps/runs/$runId" params={{ runId: run.id }}>{run.name}</Link>
                <div className="text-xs text-muted-foreground">{input.keyword}</div>
              </TableCell>
              <TableCell column="meta">{input.location}</TableCell>
              <TableCell column="meta">{input.maxResults}</TableCell>
              <TableCell column="meta"><StatusBadge status={run.status} /></TableCell>
              <TableCell column="meta">
                <div className="flex items-center gap-1">
                  <Button asChild variant="outline" size="sm" className="h-8 sm:h-9">
                    <Link to="/admin/scrapers/google-maps/runs/$runId" params={{ runId: run.id }}>Open</Link>
                  </Button>
                  <Button variant="ghost" size="icon-sm" onClick={() => edit(run)} aria-label={`Edit ${run.name}`}>
                    <PencilIcon className="size-4" />
                  </Button>
                  <Button variant="ghost" size="icon-sm" disabled={run.status !== "active"} onClick={() => void start(run)} aria-label={`Start ${run.name}`}>
                    <PlayIcon className="size-4" />
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
            <DialogTitle>{editing ? "Edit Run" : "New Run"}</DialogTitle>
            <DialogDescription>
              Save a reusable Google Maps search.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="grid gap-4 sm:grid-cols-2">
          <RunField id="name" label="Name" value={form.name} onChange={(value) => setForm({ ...form, name: value })} />
          <RunField id="keyword" label="Keyword" value={form.keyword} onChange={(value) => setForm({ ...form, keyword: value })} />
          <RunField id="location" label="Location" value={form.location} onChange={(value) => setForm({ ...form, location: value })} />
          <RunField id="language" label="Language" value={form.language} onChange={(value) => setForm({ ...form, language: value })} />
          <RunField id="max-results" label="Max results" type="number" value={form.maxResults} onChange={(value) => setForm({ ...form, maxResults: Number(value) })} />
          <div className="grid gap-2">
            <Label htmlFor="status">Status</Label>
            <Select value={form.status} onValueChange={(value) => setForm({ ...form, status: value as ScraperRunStatus })}>
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
    </div>
  )
}

export function GoogleMapsRunResults({ runId }: { runId: string }) {
  const [data, setData] = React.useState<Awaited<ReturnType<typeof loadGoogleMapsRun>> | null>(null)
  const [query, setQuery] = React.useState("")
  const [message, setMessage] = React.useState<{ tone: "error" | "success"; text: string } | null>(null)

  const load = React.useCallback(async () => {
    try {
      setData(await loadGoogleMapsRun(runId))
    } catch (error) {
      setMessage({ tone: "error", text: scraperError(error) })
    }
  }, [runId])

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  const runInput = data?.run ? parseRunInput(data.run.input) : null
  const results = (data?.results ?? []).filter((result) => {
    const term = query.trim().toLowerCase()
    const row = result.data
    return !term || [result.title, row.category, row.address, row.phone, row.website].some((value) => typeof value === "string" && value.toLowerCase().includes(term))
  })

  const startOrRefresh = async () => {
    setMessage(null)
    try {
      if (data?.latest_execution && ["queued", "running"].includes(data.latest_execution.status)) {
        await refreshGoogleMapsExecution(data.latest_execution.id)
      } else {
        await startGoogleMapsRun(runId)
      }
      await load()
      setMessage({ tone: "success", text: "Run updated." })
    } catch (error) {
      setMessage({ tone: "error", text: scraperError(error) })
    }
  }

  return (
    <div className="w-full pb-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <Button asChild variant="link" size="sm" className="h-auto p-0"><Link to="/admin/scrapers/google-maps">Google Maps</Link></Button>
          <h1 className="font-heading text-xl font-semibold">{data?.run.name ?? "Run"}</h1>
          <p className="text-sm text-muted-foreground">
            {runInput ? `${runInput.keyword} in ${runInput.location}` : ""}
            {data?.latest_execution ? ` · ${data.latest_execution.status} · ${importedCount(data.latest_execution.stats)} results` : ""}
          </p>
        </div>
        <Button size="sm" className="h-8 gap-2 sm:h-9" disabled={!data || data.run.status !== "active"} onClick={() => void startOrRefresh()}>
          {data?.latest_execution && ["queued", "running"].includes(data.latest_execution.status) ? <RefreshCwIcon className="size-4" /> : <PlayIcon className="size-4" />}
          {data?.latest_execution && ["queued", "running"].includes(data.latest_execution.status) ? "Refresh" : "Run now"}
        </Button>
      </div>

      <DashboardTable
        title="Results"
        count={results.length}
        status={message}
        controls={<DashboardToolbarSearch value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search results..." />}
        header={
          <TableHeader>
            <TableRow>
              <TableHead column="main">Business</TableHead>
              <TableHead column="preview">Address</TableHead>
              <TableHead column="meta">Rating</TableHead>
              <TableHead column="meta">Phone</TableHead>
              <TableHead column="meta">Website</TableHead>
            </TableRow>
          </TableHeader>
        }
        isEmpty={results.length === 0}
        emptyText="No results found."
        emptyColSpan={5}
        footer={{ type: "summary", count: results.length, label: "results" }}
      >
        {results.map((result) => (
          <TableRow key={result.id}>
            <TableCell column="main">
              <ResultLink href={text(result.data.mapsUrl)}>{result.title}</ResultLink>
              <div className="text-xs text-muted-foreground">{text(result.data.category) ?? "Uncategorized"}</div>
            </TableCell>
            <TableCell column="preview">{text(result.data.address) ?? "Unknown"}</TableCell>
            <TableCell column="meta">{typeof result.data.rating === "number" ? result.data.rating : "Unknown"}</TableCell>
            <TableCell column="meta">{text(result.data.phone) ?? "Unknown"}</TableCell>
            <TableCell column="meta">{text(result.data.website) ? <ResultLink href={text(result.data.website)}>Open</ResultLink> : "None"}</TableCell>
          </TableRow>
        ))}
      </DashboardTable>
    </div>
  )
}

function StatusBadge({ status }: { status: ScraperRunStatus | string }) {
  return <Badge variant={status === "active" ? "default" : "secondary"}>{statusLabels[status as keyof typeof statusLabels] ?? status}</Badge>
}

function RunField({ id, label, type = "text", value, onChange }: { id: string; label: string; type?: string; value: string | number; onChange: (value: string) => void }) {
  return <div className="grid gap-2"><Label htmlFor={id}>{label}</Label><Input id={id} type={type} value={value} onChange={(event) => onChange(event.target.value)} /></div>
}

function ResultLink({ href, children }: { href: string | null; children: React.ReactNode }) {
  return href ? <a href={href} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">{children}</a> : <span className="font-medium">{children}</span>
}

function emptyForm(maxResults: number): RunForm {
  return { name: "", keyword: "", location: "", language: "en", maxResults, status: "active" }
}

function text(value: unknown) {
  return typeof value === "string" && value ? value : null
}
