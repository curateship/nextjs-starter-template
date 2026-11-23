import * as React from "react"
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  ClockIcon,
  FilmIcon,
  ImageIcon,
  Loader2Icon,
  PlayIcon,
  PlusIcon,
  RefreshCwIcon,
  SparklesIcon,
  Trash2Icon,
} from "lucide-react"

import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { DashboardNotices } from "@/components/dashboard-notices"
import { DashboardTable } from "@/components/dashboard-table"
import {
  DashboardToolbarButton,
  DashboardToolbarSearch,
  DashboardToolbarSelectTrigger,
  DashboardToolbarViewToggle,
} from "@/components/dashboard-toolbar"
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FieldLabel } from "@/components/ui/field-label"
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
  type TableSortDirection,
} from "@/components/ui/table"
import {
  bulkDeleteAiVideoGenerations,
  deleteAiVideoGeneration,
  getAiVideoGenerationErrorMessage,
  insertAiVideoGeneration,
  listAiVideoGenerations,
  retryAiVideoGeneration,
  type AiVideoGenerationListItem,
} from "@/lib/api/ai-video-generations"
import {
  getProjectErrorMessage,
  listProjects,
  type ProjectItem,
} from "@/lib/api/video-projects"
import { cn } from "@/lib/utils"
import { dateFormatter, pageSizeOptions } from "@/lib/dashboard-format"
import { useBulkDelete } from "@/lib/use-bulk-delete"
import { useSelection } from "@/lib/use-selection"

type ViewMode = "gallery" | "list"
type SortColumn = "prompt" | "project" | "status" | "created"
type StatusFilter = "all" | "active" | "ready" | "error"

// While any generation is still running, re-list to move it toward ready/error.
const GENERATION_POLL_MS = 6_000

const ACTIVE_STATUSES = new Set(["queued", "processing"])

const statusFilterLabels: Record<StatusFilter, string> = {
  all: "All Statuses",
  active: "In Progress",
  ready: "Ready",
  error: "Failed",
}

const statusRank: Record<AiVideoGenerationListItem["status"], number> = {
  processing: 0,
  queued: 1,
  error: 2,
  ready: 3,
}

export function AiGenerationsDashboard() {
  const [generations, setGenerations] = React.useState<
    AiVideoGenerationListItem[]
  >([])
  const [projects, setProjects] = React.useState<ProjectItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [searchQuery, setSearchQuery] = React.useState("")
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("all")
  const [projectFilter, setProjectFilter] = React.useState<string>("all")
  const [viewMode, setViewMode] = React.useState<ViewMode>("gallery")
  const [sortColumn, setSortColumn] = React.useState<SortColumn>("created")
  const [sortDirection, setSortDirection] =
    React.useState<TableSortDirection>("desc")
  const [currentPage, setCurrentPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(pageSizeOptions[1])
  const [previewId, setPreviewId] = React.useState<string | null>(null)
  const [insertId, setInsertId] = React.useState<string | null>(null)
  const [retryingId, setRetryingId] = React.useState<string | null>(null)

  React.useEffect(() => {
    let active = true

    Promise.all([listAiVideoGenerations(), listProjects()])
      .then(([generationData, projectData]) => {
        if (!active) return
        setGenerations(generationData.generations)
        setProjects(projectData.projects)
      })
      .catch((loadError) => {
        if (!active) return
        setError(
          getAiVideoGenerationErrorMessage(loadError) ||
            getProjectErrorMessage(loadError)
        )
      })
      .finally(() => {
        if (!active) return
        setLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  // Keep in-progress rows live without disturbing anything the user has open:
  // silently re-list while any generation is queued or processing.
  const refetchGenerations = React.useCallback(() => {
    listAiVideoGenerations()
      .then((data) => setGenerations(data.generations))
      .catch(() => undefined)
  }, [])

  const hasActiveGenerations = generations.some((item) =>
    ACTIVE_STATUSES.has(item.status)
  )
  React.useEffect(() => {
    if (!hasActiveGenerations) return
    const timer = setInterval(refetchGenerations, GENERATION_POLL_MS)
    return () => clearInterval(timer)
  }, [hasActiveGenerations, refetchGenerations])

  const projectOptions = React.useMemo(() => {
    const seen = new Map<string, string>()
    for (const item of generations) {
      if (!seen.has(item.project_id)) {
        seen.set(item.project_id, item.project_name)
      }
    }
    return Array.from(seen, ([id, name]) => ({ id, name })).sort((a, b) =>
      a.name.localeCompare(b.name)
    )
  }, [generations])

  // Only regular projects can receive a clip (templates aren't editable reels).
  const insertTargets = React.useMemo(
    () =>
      projects
        .filter((project) => project.project_type === "regular")
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name)),
    [projects]
  )

  const filteredGenerations = React.useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    const direction = sortDirection === "asc" ? 1 : -1

    return generations
      .filter((item) => {
        const matchesSearch =
          !query ||
          `${item.prompt} ${item.project_name} ${item.model}`
            .toLowerCase()
            .includes(query)
        const matchesStatus =
          statusFilter === "all" ||
          (statusFilter === "active"
            ? ACTIVE_STATUSES.has(item.status)
            : item.status === statusFilter)
        const matchesProject =
          projectFilter === "all" || item.project_id === projectFilter
        return matchesSearch && matchesStatus && matchesProject
      })
      .sort((a, b) => {
        if (sortColumn === "project") {
          return a.project_name.localeCompare(b.project_name) * direction
        }
        if (sortColumn === "status") {
          return (statusRank[a.status] - statusRank[b.status]) * direction
        }
        if (sortColumn === "prompt") {
          return a.prompt.localeCompare(b.prompt) * direction
        }
        return (
          (new Date(a.created_at).getTime() -
            new Date(b.created_at).getTime()) *
          direction
        )
      })
  }, [
    generations,
    projectFilter,
    searchQuery,
    sortColumn,
    sortDirection,
    statusFilter,
  ])

  const totalPages = Math.ceil(filteredGenerations.length / pageSize)
  const currentPageForResults = Math.min(currentPage, totalPages || 1)
  const paginatedGenerations = React.useMemo(() => {
    const startIndex = (currentPageForResults - 1) * pageSize
    return filteredGenerations.slice(startIndex, startIndex + pageSize)
  }, [currentPageForResults, filteredGenerations, pageSize])

  const visibleIds = paginatedGenerations.map((item) => item.id)
  const {
    selectedIds,
    toggleSelected,
    selectAllState,
    toggleVisibleSelected,
    clearSelection,
  } = useSelection(visibleIds)

  const { deleteIds, setDeleteIds, deleting, confirmDelete } = useBulkDelete({
    noun: "generation",
    deleteOne: deleteAiVideoGeneration,
    deleteMany: bulkDeleteAiVideoGenerations,
    setItems: setGenerations,
    clearSelection,
    formatError: getAiVideoGenerationErrorMessage,
  })

  const previewItem =
    generations.find((item) => item.id === previewId) ?? null
  const insertItem = generations.find((item) => item.id === insertId) ?? null

  function replaceGeneration(updated: AiVideoGenerationListItem) {
    setGenerations((current) =>
      current.map((item) => (item.id === updated.id ? updated : item))
    )
  }

  async function handleRetry(item: AiVideoGenerationListItem) {
    setRetryingId(item.id)
    try {
      const updated = await retryAiVideoGeneration(item.id)
      replaceGeneration(updated)
      toast.success("Retrying generation.")
    } catch (retryError) {
      toast.error(getAiVideoGenerationErrorMessage(retryError))
    } finally {
      setRetryingId(null)
    }
  }

  function toggleSort(column: SortColumn) {
    if (sortColumn === column) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"))
      return
    }
    setSortColumn(column)
    setSortDirection(column === "created" ? "desc" : "asc")
  }

  function goToPage(page: number) {
    setCurrentPage(Math.max(1, Math.min(page, totalPages || 1)))
  }

  const controls = (
    <>
      {selectedIds.size > 0 ? (
        <DashboardToolbarButton
          type="button"
          variant="destructive"
          onClick={() => setDeleteIds(Array.from(selectedIds))}
        >
          <Trash2Icon className="size-4" />
          Delete {selectedIds.size}
        </DashboardToolbarButton>
      ) : null}
      <DashboardToolbarSearch
        name="ai-generation-search"
        aria-label="Search generations"
        placeholder="Search generations..."
        value={searchQuery}
        onChange={(event) => setSearchQuery(event.target.value)}
      />
      <Select
        value={statusFilter}
        onValueChange={(value) => setStatusFilter(value as StatusFilter)}
      >
        <DashboardToolbarSelectTrigger
          aria-label="Filter generations by status"
        >
          <SelectValue />
        </DashboardToolbarSelectTrigger>
        <SelectContent>
          {(Object.keys(statusFilterLabels) as StatusFilter[]).map((value) => (
            <SelectItem key={value} value={value}>
              {statusFilterLabels[value]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={projectFilter} onValueChange={setProjectFilter}>
        <DashboardToolbarSelectTrigger
          aria-label="Filter generations by project"
        >
          <SelectValue />
        </DashboardToolbarSelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Projects</SelectItem>
          {projectOptions.map((project) => (
            <SelectItem key={project.id} value={project.id}>
              {project.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <DashboardToolbarViewToggle viewMode={viewMode} onChange={setViewMode} />
    </>
  )

  return (
    <div className="w-full pb-8">
      <DashboardNotices error={error} />

      {viewMode === "gallery" ? (
        <DashboardTable
          title="AI Generations"
          icon={
            <SparklesIcon className="text-muted-foreground" />
          }
          count={filteredGenerations.length}
          controls={controls}
          selectedCount={selectedIds.size}
          onClearSelection={() => clearSelection()}
          content={
            <div className="px-5 pt-3 pb-5">
              {loading ? null : paginatedGenerations.length === 0 ? (
                <EmptyGenerations />
              ) : (
                <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8">
                  {paginatedGenerations.map((item) => (
                    <GenerationGalleryItem
                      key={item.id}
                      item={item}
                      selected={selectedIds.has(item.id)}
                      retrying={retryingId === item.id}
                      onToggle={() => toggleSelected(item.id)}
                      onOpen={() => setPreviewId(item.id)}
                      onInsert={() => setInsertId(item.id)}
                      onRetry={() => handleRetry(item)}
                      onDelete={() => setDeleteIds([item.id])}
                    />
                  ))}
                </div>
              )}
            </div>
          }
          footer={{
            type: "pagination",
            page: currentPageForResults,
            pageSize,
            total: filteredGenerations.length,
            totalPages,
            pageSizeOptions,
            onPageChange: goToPage,
            onPageSizeChange: setPageSize,
          }}
        />
      ) : (
        <DashboardTable
          title="AI Generations"
          icon={
            <SparklesIcon className="text-muted-foreground" />
          }
          count={filteredGenerations.length}
          controls={controls}
          selectedCount={selectedIds.size}
          onClearSelection={() => clearSelection()}
          header={
            <TableHeader>
              <TableRow>
                <TableHead column="select">
                  <Checkbox
                    checked={selectAllState}
                    onCheckedChange={toggleVisibleSelected}
                    aria-label="Select visible generations"
                  />
                </TableHead>
                <TableHead column="main">
                  <TableSortButton
                    active={sortColumn === "prompt"}
                    direction={sortDirection}
                    onClick={() => toggleSort("prompt")}
                  >
                    Generation
                  </TableSortButton>
                </TableHead>
                <TableHead column="meta">
                  <TableSortButton
                    active={sortColumn === "project"}
                    direction={sortDirection}
                    onClick={() => toggleSort("project")}
                  >
                    Project
                  </TableSortButton>
                </TableHead>
                <TableHead column="meta">
                  <TableSortButton
                    active={sortColumn === "status"}
                    direction={sortDirection}
                    onClick={() => toggleSort("status")}
                  >
                    Status
                  </TableSortButton>
                </TableHead>
                <TableHead column="meta" className="hidden lg:table-cell">
                  <TableSortButton
                    active={sortColumn === "created"}
                    direction={sortDirection}
                    onClick={() => toggleSort("created")}
                  >
                    Created
                  </TableSortButton>
                </TableHead>
                <TableHead column="meta">Actions</TableHead>
              </TableRow>
            </TableHeader>
          }
          isEmpty={!loading && paginatedGenerations.length === 0}
          emptyText="No generations found."
          emptyColSpan={6}
          footer={{
            type: "pagination",
            page: currentPageForResults,
            pageSize,
            total: filteredGenerations.length,
            totalPages,
            pageSizeOptions,
            onPageChange: goToPage,
            onPageSizeChange: setPageSize,
          }}
        >
          {paginatedGenerations.map((item) => (
            <GenerationTableRow
              key={item.id}
              item={item}
              selected={selectedIds.has(item.id)}
              retrying={retryingId === item.id}
              onToggle={() => toggleSelected(item.id)}
              onOpen={() => setPreviewId(item.id)}
              onInsert={() => setInsertId(item.id)}
              onRetry={() => handleRetry(item)}
              onDelete={() => setDeleteIds([item.id])}
            />
          ))}
        </DashboardTable>
      )}

      <GenerationPreviewDialog
        item={previewItem}
        retrying={retryingId === previewItem?.id}
        onOpenChange={(open) => !open && setPreviewId(null)}
        onInsert={() => previewItem && setInsertId(previewItem.id)}
        onRetry={() => previewItem && handleRetry(previewItem)}
        onDelete={() => previewItem && setDeleteIds([previewItem.id])}
      />

      <InsertGenerationDialog
        item={insertItem}
        projects={insertTargets}
        onOpenChange={(open) => !open && setInsertId(null)}
      />

      <DeleteConfirmDialog
        ids={deleteIds}
        noun="Generation"
        description={() =>
          "This removes only the history entry. The generated video stays in the media library and in any project it was inserted into."
        }
        deleting={deleting}
        onClose={() => setDeleteIds(null)}
        onConfirm={confirmDelete}
      />
    </div>
  )
}

function GenerationTableRow({
  item,
  selected,
  retrying,
  onToggle,
  onOpen,
  onInsert,
  onRetry,
  onDelete,
}: {
  item: AiVideoGenerationListItem
  selected: boolean
  retrying: boolean
  onToggle: () => void
  onOpen: () => void
  onInsert: () => void
  onRetry: () => void
  onDelete: () => void
}) {
  return (
    <TableRow className="group" data-state={selected ? "selected" : undefined}>
      <TableCell column="select">
        <Checkbox
          checked={selected}
          onCheckedChange={onToggle}
          aria-label={`Select generation ${item.prompt}`}
        />
      </TableCell>
      <TableCell column="main">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-md border bg-muted"
            onClick={onOpen}
            aria-label="Preview generation"
          >
            <GenerationThumbnail item={item} iconClassName="size-5" />
          </button>
          <div className="min-w-0">
            <button
              type="button"
              className="block max-w-[320px] truncate text-left font-medium group-hover:underline"
              onClick={onOpen}
            >
              {item.prompt}
            </button>
            <div className="text-xs text-muted-foreground">
              {item.model} · {item.duration_seconds}s · {item.aspect_ratio}
            </div>
          </div>
        </div>
      </TableCell>
      <TableCell column="meta">
        <span className="block max-w-[160px] truncate">
          {item.project_name}
        </span>
      </TableCell>
      <TableCell column="meta">
        <StatusBadge item={item} />
      </TableCell>
      <TableCell column="mutedMeta" className="hidden lg:table-cell">
        {dateFormatter.format(new Date(item.created_at))}
      </TableCell>
      <TableCell column="meta">
        <div className="flex justify-start gap-1">
          <GenerationRowActions
            item={item}
            retrying={retrying}
            onInsert={onInsert}
            onRetry={onRetry}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onDelete}
            aria-label="Delete generation"
          >
            <Trash2Icon className="size-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}

// The status-specific action (Insert for ready, Retry for failed) that precedes
// the shared Delete button in every row/tile.
function GenerationRowActions({
  item,
  retrying,
  onInsert,
  onRetry,
}: {
  item: AiVideoGenerationListItem
  retrying: boolean
  onInsert: () => void
  onRetry: () => void
}) {
  if (item.status === "ready" && item.media) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={onInsert}
        aria-label="Insert into a project"
        title="Insert into a project"
      >
        <PlusIcon className="size-4" />
      </Button>
    )
  }
  if (item.status === "error") {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={onRetry}
        disabled={retrying}
        aria-label="Retry generation"
        title="Retry generation"
      >
        {retrying ? (
          <Loader2Icon className="size-4 animate-spin" />
        ) : (
          <RefreshCwIcon className="size-4" />
        )}
      </Button>
    )
  }
  return null
}

function GenerationGalleryItem({
  item,
  selected,
  retrying,
  onToggle,
  onOpen,
  onInsert,
  onRetry,
  onDelete,
}: {
  item: AiVideoGenerationListItem
  selected: boolean
  retrying: boolean
  onToggle: () => void
  onOpen: () => void
  onInsert: () => void
  onRetry: () => void
  onDelete: () => void
}) {
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-lg border bg-muted",
        selected && "border-destructive ring-2 ring-destructive/25"
      )}
    >
      <button
        type="button"
        className={cn(
          "relative grid w-full place-items-center bg-muted",
          aspectClassName(item.aspect_ratio)
        )}
        onClick={onOpen}
        aria-label="Preview generation"
      >
        <GenerationThumbnail item={item} iconClassName="size-8" />
        {item.status === "ready" && item.media ? (
          <span className="pointer-events-none absolute inset-0 grid place-items-center bg-black/25 opacity-0 transition-opacity group-hover:opacity-100">
            <PlayIcon className="size-8 fill-white text-white" />
          </span>
        ) : null}
        <span className="absolute top-2 left-2">
          <StatusBadge item={item} />
        </span>
      </button>

      <div
        className={cn(
          "absolute top-2 right-2 flex items-center gap-1 rounded-md bg-background/90 p-1 shadow-sm transition-opacity focus-within:opacity-100 group-hover:opacity-100",
          selected ? "opacity-100" : "opacity-0"
        )}
      >
        <div className="flex h-8 w-8 items-center justify-center">
          <Checkbox
            checked={selected}
            onCheckedChange={onToggle}
            className="border-foreground"
            aria-label={`Select generation ${item.prompt}`}
          />
        </div>
        <GenerationRowActions
          item={item}
          retrying={retrying}
          onInsert={onInsert}
          onRetry={onRetry}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onDelete}
          aria-label="Delete generation"
        >
          <Trash2Icon className="size-4" />
        </Button>
      </div>

      <div className="space-y-2 bg-card p-3">
        <button
          type="button"
          className="block max-w-full truncate text-left text-sm font-medium hover:underline"
          onClick={onOpen}
        >
          {item.prompt}
        </button>
        <div className="truncate text-xs text-muted-foreground">
          {item.project_name} · {item.duration_seconds}s · {item.aspect_ratio}
        </div>
      </div>
    </div>
  )
}

function GenerationPreviewDialog({
  item,
  retrying,
  onOpenChange,
  onInsert,
  onRetry,
  onDelete,
}: {
  item: AiVideoGenerationListItem | null
  retrying: boolean
  onOpenChange: (open: boolean) => void
  onInsert: () => void
  onRetry: () => void
  onDelete: () => void
}) {
  const videoUrl = item?.media
    ? (item.media.proxy_url ?? item.media.url)
    : null
  return (
    <Dialog open={!!item} onOpenChange={onOpenChange}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>Generation Preview</DialogTitle>
          <DialogDescription>
            Preview this AI generation and insert it into a project or retry a
            failed run.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {item ? (
            <>
              <div className="mx-auto grid max-h-[48vh] min-h-64 w-full max-w-xl place-items-center overflow-hidden rounded-lg border bg-muted">
                {item.status === "ready" && videoUrl ? (
                  <video
                    src={videoUrl}
                    poster={item.first_frame_image_url ?? undefined}
                    controls
                    playsInline
                    className="max-h-[48vh] w-full object-contain"
                  />
                ) : item.status === "error" ? (
                  <div className="grid h-64 place-items-center text-center text-sm text-muted-foreground">
                    <div>
                      <AlertCircleIcon className="mx-auto mb-3 size-10 text-destructive" />
                      <p>This generation failed. Retry to run it again.</p>
                    </div>
                  </div>
                ) : item.status === "ready" ? (
                  <div className="grid h-64 place-items-center text-center text-sm text-muted-foreground">
                    <div>
                      <FilmIcon className="mx-auto mb-3 size-10" />
                      <p>The generated video is no longer available.</p>
                    </div>
                  </div>
                ) : (
                  <div className="grid h-64 place-items-center text-center text-sm text-muted-foreground">
                    <div>
                      <Loader2Icon className="mx-auto mb-3 size-10 animate-spin" />
                      <p>Generating this clip…</p>
                    </div>
                  </div>
                )}
              </div>

              <Card size="sm">
                <CardHeader>
                  <CardTitle>Details</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="grid gap-3 text-sm sm:grid-cols-2">
                    <MetaRow label="Project" value={item.project_name} />
                    <MetaRow label="Status" value={statusLabel(item.status)} />
                    <MetaRow label="Model" value={item.model} />
                    <MetaRow
                      label="Duration"
                      value={`${item.duration_seconds}s · ${item.aspect_ratio}`}
                    />
                    <MetaRow
                      label="Created"
                      value={dateFormatter.format(new Date(item.created_at))}
                    />
                    <MetaRow
                      label="Updated"
                      value={dateFormatter.format(new Date(item.updated_at))}
                    />
                  </div>

                  <div className="grid gap-2">
                    <FieldLabel>Prompt</FieldLabel>
                    <div className="min-h-20 rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
                      {item.prompt}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : null}
        </DialogBody>
        <DialogFooter variant="plain" className="justify-between">
          <Button type="button" variant="destructive" onClick={onDelete}>
            <Trash2Icon className="size-4" />
            Delete
          </Button>
          <div className="flex gap-2">
            {item?.status === "error" ? (
              <Button type="button" onClick={onRetry} disabled={retrying}>
                {retrying ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <RefreshCwIcon className="size-4" />
                )}
                {retrying ? "Retrying" : "Retry"}
              </Button>
            ) : null}
            {item?.status === "ready" && item.media ? (
              <Button type="button" onClick={onInsert}>
                <PlusIcon className="size-4" />
                Insert into project
              </Button>
            ) : null}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function InsertGenerationDialog({
  item,
  projects,
  onOpenChange,
}: {
  item: AiVideoGenerationListItem | null
  projects: ProjectItem[]
  onOpenChange: (open: boolean) => void
}) {
  const [targetId, setTargetId] = React.useState("")
  const [inserting, setInserting] = React.useState(false)
  const [insertError, setInsertError] = React.useState<string | null>(null)

  // Reset the picker only when a *different* generation opens the dialog, keyed
  // by id. Depending on `item` itself would re-run on every background list
  // refresh (which hands us an equivalent object) and wipe the user's choice
  // mid-selection. project_id for a given generation never changes.
  const openId = item?.id ?? null
  const defaultProjectId = item?.project_id ?? ""
  React.useEffect(() => {
    if (openId) {
      setTargetId(defaultProjectId)
      setInsertError(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId])

  async function handleInsert() {
    if (!item || !targetId) return
    setInserting(true)
    setInsertError(null)
    try {
      const result = await insertAiVideoGeneration(item.id, targetId)
      toast.success(
        `Added to ${result.project_name}. Open that project to see the clip.`
      )
      onOpenChange(false)
    } catch (error) {
      setInsertError(getAiVideoGenerationErrorMessage(error))
    } finally {
      setInserting(false)
    }
  }

  return (
    <Dialog
      open={!!item}
      onOpenChange={(open) => {
        if (!inserting) onOpenChange(open)
      }}
    >
      <DialogContent variant="admin" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Insert into a project</DialogTitle>
          <DialogDescription>
            Add this generated clip to one of your projects.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Card size="sm">
            <CardHeader>
              <CardTitle>Destination</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-2">
                <FieldLabel
                  htmlFor="insert-generation-project"
                  hint="The clip is added on a new track at the end of the project's timeline. Open the project to arrange it."
                >
                  Project
                </FieldLabel>
                <Select value={targetId} onValueChange={setTargetId}>
                  <SelectTrigger
                    id="insert-generation-project"
                    className="w-full sm:w-fit"
                    aria-label="Choose a project"
                  >
                    <SelectValue placeholder="Choose a project" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {projects.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    You don't have any projects yet. Create one in the editor
                    first.
                  </p>
                ) : null}
              </div>
            </CardContent>
          </Card>
          {insertError ? (
            <p role="alert" className="text-sm text-destructive">
              {insertError}
            </p>
          ) : null}
        </DialogBody>
        <DialogFooter variant="plain">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={inserting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleInsert}
            disabled={inserting || !targetId}
          >
            {inserting ? <Loader2Icon className="size-4 animate-spin" /> : null}
            {inserting ? "Inserting" : "Insert"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Poster for a generation: the first-frame image (which is literally the clip's
// opening frame). Falls back to an icon when the image is unavailable.
function GenerationThumbnail({
  item,
  iconClassName,
}: {
  item: AiVideoGenerationListItem
  iconClassName?: string
}) {
  if (item.first_frame_image_url) {
    return (
      <img
        src={item.first_frame_image_url}
        alt=""
        className="h-full w-full object-cover"
        draggable={false}
      />
    )
  }
  const Icon = item.status === "ready" ? FilmIcon : ImageIcon
  return (
    <Icon className={cn("text-muted-foreground", iconClassName ?? "size-8")} />
  )
}

function StatusBadge({ item }: { item: AiVideoGenerationListItem }) {
  if (item.status === "ready") {
    return (
      <Badge variant="secondary" className="bg-background/90">
        <CheckCircle2Icon className="size-3" />
        Ready
      </Badge>
    )
  }
  if (item.status === "error") {
    return (
      <Badge variant="destructive" className="bg-background/90">
        <AlertCircleIcon className="size-3" />
        Failed
      </Badge>
    )
  }
  if (item.status === "processing") {
    return (
      <Badge variant="secondary" className="bg-background/90">
        <Loader2Icon className="size-3 animate-spin" />
        Generating
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="bg-background/90">
      <ClockIcon className="size-3" />
      Queued
    </Badge>
  )
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="truncate font-medium">{value}</div>
    </div>
  )
}

function EmptyGenerations() {
  return (
    <div className="grid h-72 place-items-center text-center text-sm text-muted-foreground">
      <div>
        <SparklesIcon className="mx-auto mb-3 size-10" />
        <p>No AI generations yet.</p>
        <p className="mt-1">
          Generate an AI video from a project's editor and it will appear here.
        </p>
      </div>
    </div>
  )
}

function statusLabel(status: AiVideoGenerationListItem["status"]) {
  if (status === "ready") return "Ready"
  if (status === "error") return "Failed"
  if (status === "processing") return "Generating"
  return "Queued"
}

function aspectClassName(aspectRatio: AiVideoGenerationListItem["aspect_ratio"]) {
  return aspectRatio === "16:9" ? "aspect-video" : "aspect-[9/16]"
}
