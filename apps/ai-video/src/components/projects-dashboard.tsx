import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import {
  AlertCircleIcon,
  ClapperboardIcon,
  EditIcon,
  Loader2Icon,
  PlusIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { useShellRuntime } from "@/components/shell-runtime"
import { DashboardTable } from "@/components/dashboard-table"
import {
  DashboardToolbarButton,
  DashboardToolbarSearch,
  DashboardToolbarSelectTrigger,
  DashboardToolbarViewToggle,
} from "@/components/dashboard-toolbar"
import { DashboardNotices } from "@/components/dashboard-notices"
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog"
import {
  Dialog,
  DialogBody,
  DialogContent,
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
  type TableSortDirection,
} from "@/components/ui/table"
import {
  bulkDeleteProjects,
  createProject,
  deleteProject,
  enqueueProjectRenders,
  getProjectErrorMessage,
  listProjects,
  renameProject,
  RENDER_QUALITY_OPTIONS,
  type ProjectItem,
  type RenderQuality,
} from "@/lib/api/video-projects"
import {
  createProjectFromTemplate,
  getTemplateErrorMessage,
  listTemplates,
} from "@/lib/api/video-templates"
import { cn } from "@/lib/utils"
import { dateFormatter, pageSizeOptions } from "@/lib/dashboard-format"
import { useSelection } from "@/lib/use-selection"
import { useBulkDelete } from "@/lib/use-bulk-delete"

type ViewMode = "gallery" | "list"
type ProjectSortColumn = "name" | "clips" | "edited"
type ProjectTypeFilter = "all" | "regular" | "template"
type ProjectModalState =
  | { type: "create" }
  | { type: "rename"; project: ProjectItem }
  | null

// How often the dashboard refreshes while any project is queued/rendering.
const RENDER_STATUS_POLL_MS = 5_000

// Timeline length for list rows / gallery tiles, as m:ss.
function formatDuration(ms: number) {
  const totalSeconds = Math.round(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, "0")}`
}

// Projects dashboard at /admin/video-editor: lists the user's video projects;
// opening one launches the editor at /admin/video-editor/$projectId.
export function ProjectsDashboard() {
  const navigate = useNavigate()
  const { config } = useShellRuntime()
  const [projects, setProjects] = React.useState<ProjectItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [modalError, setModalError] = React.useState<string | null>(null)
  const [searchQuery, setSearchQuery] = React.useState("")
  const [typeFilter, setTypeFilter] = React.useState<ProjectTypeFilter>("all")
  const [viewMode, setViewMode] = React.useState<ViewMode>("list")
  const [sortColumn, setSortColumn] =
    React.useState<ProjectSortColumn>("edited")
  const [sortDirection, setSortDirection] =
    React.useState<TableSortDirection>("desc")
  const [currentPage, setCurrentPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(pageSizeOptions[1])
  const [modalState, setModalState] = React.useState<ProjectModalState>(null)
  const [submitting, setSubmitting] = React.useState(false)
  const [name, setName] = React.useState("")
  // Optional template the new project starts from (null = blank). Templates are
  // lazy-loaded the first time the create modal opens; null = not loaded yet.
  const [templates, setTemplates] = React.useState<
    { id: string; name: string }[] | null
  >(null)
  const [selectedTemplateId, setSelectedTemplateId] = React.useState<
    string | null
  >(null)
  // Bulk export: the ids picked when the quality dialog opened (null = closed).
  const [exportIds, setExportIds] = React.useState<string[] | null>(null)
  const [exportQuality, setExportQuality] = React.useState<RenderQuality>("high")
  const [includeEndCard, setIncludeEndCard] = React.useState(
    config.brandKit.endCard.enabled
  )
  const [exporting, setExporting] = React.useState(false)

  // One-time load; `loading` starts true so no state resets are needed here.
  React.useEffect(() => {
    let active = true

    listProjects()
      .then((data) => {
        if (!active) return
        setProjects(data.projects)
      })
      .catch((loadError) => {
        if (!active) return
        setError(getProjectErrorMessage(loadError))
      })
      .finally(() => {
        if (!active) return
        setLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  // Silent refresh for render-status badges; load errors keep the stale list.
  const refetchProjects = React.useCallback(() => {
    listProjects()
      .then((data) => setProjects(data.projects))
      .catch(() => undefined)
  }, [])

  // Keep render-status badges live: refetch while any project is queued or
  // rendering, stop once everything settles.
  const hasActiveRenders = projects.some(
    (project) =>
      project.render_status === "queued" ||
      project.render_status === "rendering"
  )
  React.useEffect(() => {
    if (!hasActiveRenders) return
    const timer = setInterval(refetchProjects, RENDER_STATUS_POLL_MS)
    return () => clearInterval(timer)
  }, [hasActiveRenders, refetchProjects])

  const filteredProjects = React.useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    const direction = sortDirection === "asc" ? 1 : -1
    return projects
      .filter((project) => !query || project.name.toLowerCase().includes(query))
      .filter(
        (project) => typeFilter === "all" || project.project_type === typeFilter
      )
      .sort((a, b) => {
        if (sortColumn === "clips")
          return (a.clip_count - b.clip_count) * direction
        if (sortColumn === "edited")
          return (
            (new Date(a.updated_at).getTime() -
              new Date(b.updated_at).getTime()) *
            direction
          )
        return a.name.localeCompare(b.name) * direction
      })
  }, [projects, searchQuery, typeFilter, sortColumn, sortDirection])

  const totalPages = Math.ceil(filteredProjects.length / pageSize)
  const paginatedProjects = React.useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize
    return filteredProjects.slice(startIndex, startIndex + pageSize)
  }, [currentPage, filteredProjects, pageSize])

  // Filter/sort/page-size changes restart pagination from the first page.
  function updateSearch(value: string) {
    setSearchQuery(value)
    setCurrentPage(1)
  }

  function updateTypeFilter(value: ProjectTypeFilter) {
    setTypeFilter(value)
    setCurrentPage(1)
  }

  function changePageSize(size: number) {
    setPageSize(size)
    setCurrentPage(1)
  }

  function toggleSort(column: ProjectSortColumn) {
    setCurrentPage(1)
    if (sortColumn === column) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"))
      return
    }

    setSortColumn(column)
    setSortDirection("asc")
  }

  // Both the row click and the pencil-free tile click land in the editor.
  function openProject(project: ProjectItem) {
    void navigate({
      to: "/admin/video-editor/$projectId",
      params: { projectId: project.id },
    })
  }

  function openCreateModal() {
    setModalState({ type: "create" })
    setName("")
    setSelectedTemplateId(null)
    setModalError(null)
    // Lazy-load the user's templates for the picker on first open. On failure
    // it stays null so the next open retries; the picker just won't show.
    if (templates === null) {
      listTemplates()
        .then((data) =>
          setTemplates(data.templates.map((t) => ({ id: t.id, name: t.name })))
        )
        .catch(() => undefined)
    }
  }

  function openRenameModal(project: ProjectItem) {
    setModalState({ type: "rename", project })
    setName(project.name)
    setModalError(null)
  }

  function closeModal() {
    setModalState(null)
    setSubmitting(false)
    setModalError(null)
  }

  // Create then jump straight into the editor for the new project. A selected
  // template copies its timeline into the project; otherwise it starts blank.
  async function handleCreateProject() {
    setSubmitting(true)
    setModalError(null)
    try {
      const projectId = selectedTemplateId
        ? (await createProjectFromTemplate(selectedTemplateId, name)).projectId
        : (await createProject(name)).id
      void navigate({
        to: "/admin/video-editor/$projectId",
        params: { projectId },
      })
    } catch (createError) {
      setModalError(
        selectedTemplateId
          ? getTemplateErrorMessage(createError)
          : getProjectErrorMessage(createError)
      )
      setSubmitting(false)
    }
  }

  async function handleRenameProject() {
    if (modalState?.type !== "rename") return

    setSubmitting(true)
    setModalError(null)
    try {
      const updated = await renameProject(modalState.project.id, name)
      setProjects((current) =>
        current.map((project) =>
          project.id === updated.id ? updated : project
        )
      )
      toast.success("Project renamed.")
      closeModal()
    } catch (renameError) {
      setModalError(getProjectErrorMessage(renameError))
      setSubmitting(false)
    }
  }

  const visibleIds = paginatedProjects.map((project) => project.id)
  const {
    selectedIds,
    toggleSelected,
    allVisibleSelected,
    toggleVisibleSelected,
    clearSelection,
  } = useSelection(visibleIds)

  const { deleteIds, setDeleteIds, deleting, confirmDelete } = useBulkDelete({
    noun: "project",
    deleteOne: deleteProject,
    deleteMany: bulkDeleteProjects,
    setItems: setProjects,
    clearSelection,
    formatError: getProjectErrorMessage,
  })

  function goToPage(page: number) {
    setCurrentPage(Math.max(1, Math.min(page, totalPages || 1)))
  }

  function openExportDialog() {
    setExportIds(Array.from(selectedIds))
    setIncludeEndCard(config.brandKit.endCard.enabled)
  }

  // Queues one render job per selected project and summarizes the outcome
  // (queued / already in progress / skipped with the per-project reason).
  async function confirmExport() {
    if (!exportIds?.length) return
    setExporting(true)
    try {
      const { results } = await enqueueProjectRenders(
        exportIds,
        exportQuality,
        includeEndCard
      )
      const namesById = new Map(
        projects.map((project) => [project.id, project.name])
      )
      const queued = results.filter((item) => item.outcome === "queued").length
      const active = results.filter(
        (item) => item.outcome === "already_active"
      ).length
      const skipped = results.filter((item) => item.outcome === "skipped")
      const parts: string[] = []
      if (queued) parts.push(`Queued ${queued} export${queued === 1 ? "" : "s"}.`)
      if (active) parts.push(`${active} already in progress.`)
      if (skipped.length) {
        const details = skipped
          .map(
            (item) =>
              `${namesById.get(item.project_id) ?? "Unknown project"} (${item.reason ?? "not exportable"})`
          )
          .join(", ")
        parts.push(`Skipped ${skipped.length}: ${details}.`)
      }
      const message = parts.join(" ") || "Nothing to export."
      // Skipped projects → warn (amber); a clean queue → success; nothing
      // to do → neutral info.
      if (skipped.length) toast.warning(message)
      else if (queued || active) toast.success(message)
      else toast(message)
      clearSelection(exportIds)
      setExportIds(null)
      // Pick up the mirrored queued/rendering statuses right away.
      refetchProjects()
    } catch (exportError) {
      toast.error(getProjectErrorMessage(exportError))
    } finally {
      setExporting(false)
    }
  }

  const primaryDisabled = submitting || !name.trim()
  const controls = (
    <>
      {selectedIds.size > 0 ? (
        <>
          <DashboardToolbarButton type="button" onClick={openExportDialog}>
            <UploadIcon className="size-4" />
            Export {selectedIds.size}
          </DashboardToolbarButton>
          <DashboardToolbarButton
            type="button"
            variant="destructive"
            onClick={() => setDeleteIds(Array.from(selectedIds))}
          >
            <Trash2Icon className="size-4" />
            Delete {selectedIds.size}
          </DashboardToolbarButton>
        </>
      ) : null}
      <DashboardToolbarSearch
        name="project-search"
        aria-label="Search projects"
        placeholder="Search projects..."
        value={searchQuery}
        onChange={(event) => updateSearch(event.target.value)}
      />
      <Select
        value={typeFilter}
        onValueChange={(value) => updateTypeFilter(value as ProjectTypeFilter)}
      >
        <DashboardToolbarSelectTrigger aria-label="Filter by project type">
          <SelectValue />
        </DashboardToolbarSelectTrigger>
        <SelectContent>
          <SelectItem value="all">All types</SelectItem>
          <SelectItem value="regular">Regular</SelectItem>
          <SelectItem value="template">Template-based</SelectItem>
        </SelectContent>
      </Select>
      <DashboardToolbarViewToggle viewMode={viewMode} onChange={setViewMode} />
      <DashboardToolbarButton type="button" onClick={openCreateModal}>
        <PlusIcon className="size-4" />
        New Project
      </DashboardToolbarButton>
    </>
  )

  const paginationFooter = {
    type: "pagination" as const,
    page: currentPage,
    pageSize,
    total: filteredProjects.length,
    totalPages,
    pageSizeOptions,
    onPageChange: goToPage,
    onPageSizeChange: changePageSize,
  }

  return (
    <div className="w-full pb-8">
      <DashboardNotices error={error} />

      {viewMode === "gallery" ? (
        <DashboardTable
          title="Projects"
          icon={
            <ClapperboardIcon className="size-4 text-muted-foreground sm:size-[18px]" />
          }
          count={filteredProjects.length}
          controls={controls}
          content={
            <div className="px-5 pt-3 pb-5">
              {loading || paginatedProjects.length === 0 ? (
                <EmptyProjects loading={loading} />
              ) : (
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-5">
                  {paginatedProjects.map((project) => (
                    <ProjectGalleryItem
                      key={project.id}
                      project={project}
                      selected={selectedIds.has(project.id)}
                      onToggle={() => toggleSelected(project.id)}
                      onOpen={() => openProject(project)}
                      onRename={() => openRenameModal(project)}
                      onDelete={() => setDeleteIds([project.id])}
                    />
                  ))}
                </div>
              )}
            </div>
          }
          footer={paginationFooter}
        />
      ) : (
        <DashboardTable
          title="Projects"
          icon={
            <ClapperboardIcon className="size-4 text-muted-foreground sm:size-[18px]" />
          }
          count={filteredProjects.length}
          controls={controls}
          header={
            <TableHeader>
              <TableRow>
                <TableHead column="select">
                  <Checkbox
                    checked={allVisibleSelected}
                    onCheckedChange={toggleVisibleSelected}
                    aria-label="Select visible projects"
                  />
                </TableHead>
                <TableHead column="main">
                  <TableSortButton
                    active={sortColumn === "name"}
                    direction={sortDirection}
                    onClick={() => toggleSort("name")}
                  >
                    Project
                  </TableSortButton>
                </TableHead>
                <TableHead column="meta">Type</TableHead>
                <TableHead column="meta">
                  <TableSortButton
                    active={sortColumn === "clips"}
                    direction={sortDirection}
                    onClick={() => toggleSort("clips")}
                  >
                    Clips
                  </TableSortButton>
                </TableHead>
                <TableHead column="meta">Export</TableHead>
                <TableHead column="meta" className="hidden lg:table-cell">
                  <TableSortButton
                    active={sortColumn === "edited"}
                    direction={sortDirection}
                    onClick={() => toggleSort("edited")}
                  >
                    Last Edited
                  </TableSortButton>
                </TableHead>
                <TableHead column="meta">Actions</TableHead>
              </TableRow>
            </TableHeader>
          }
          isEmpty={loading || paginatedProjects.length === 0}
          emptyText={loading ? "Loading projects..." : "No projects found."}
          emptyColSpan={7}
          footer={paginationFooter}
        >
          {paginatedProjects.map((project) => (
            <ProjectTableRow
              key={project.id}
              project={project}
              selected={selectedIds.has(project.id)}
              onToggle={() => toggleSelected(project.id)}
              onOpen={() => openProject(project)}
              onRename={() => openRenameModal(project)}
              onDelete={() => setDeleteIds([project.id])}
            />
          ))}
        </DashboardTable>
      )}

      <Dialog
        open={!!modalState}
        onOpenChange={(open) => !open && closeModal()}
      >
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>
              {modalState?.type === "rename" ? "Rename Project" : "New Project"}
            </DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-5">
              {modalError ? (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                >
                  <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{modalError}</span>
                </div>
              ) : null}

              <div className="grid gap-2">
                <Label htmlFor="project-name">Name</Label>
                <Input
                  id="project-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Project name"
                  onKeyDown={(event) => {
                    // Enter submits the single-field form.
                    if (event.key !== "Enter" || primaryDisabled) return
                    if (modalState?.type === "rename") {
                      void handleRenameProject()
                    } else {
                      void handleCreateProject()
                    }
                  }}
                />
              </div>

              {/* Template picker (create only). Hidden until templates load and
                  only when the user has at least one; "Blank project" is the
                  default. Selecting one copies its timeline into the project. */}
              {modalState?.type === "create" &&
              templates &&
              templates.length > 0 ? (
                <div className="grid gap-2">
                  <Label htmlFor="project-template">Template</Label>
                  <Select
                    value={selectedTemplateId ?? "blank"}
                    onValueChange={(value) =>
                      setSelectedTemplateId(value === "blank" ? null : value)
                    }
                  >
                    <SelectTrigger id="project-template">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="blank">Blank project</SelectItem>
                      {templates.map((template) => (
                        <SelectItem key={template.id} value={template.id}>
                          {template.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </div>
          </DialogBody>
          <DialogFooter variant="plain">
            <Button type="button" variant="outline" onClick={closeModal}>
              Cancel
            </Button>
            {modalState?.type === "rename" ? (
              <Button
                type="button"
                disabled={primaryDisabled}
                onClick={handleRenameProject}
              >
                {submitting ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : null}
                {submitting ? "Saving" : "Save Changes"}
              </Button>
            ) : (
              <Button
                type="button"
                disabled={primaryDisabled}
                onClick={handleCreateProject}
              >
                {submitting ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <PlusIcon className="size-4" />
                )}
                {submitting ? "Creating" : "Create Project"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        ids={deleteIds}
        noun="Project"
        description={(count) =>
          count === 1
            ? "This removes the project and its timeline. This action cannot be undone."
            : "This removes these projects and their timelines. This action cannot be undone."
        }
        deleting={deleting}
        onClose={() => setDeleteIds(null)}
        onConfirm={confirmDelete}
      />

      <Dialog
        open={!!exportIds}
        onOpenChange={(open) => !open && setExportIds(null)}
      >
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>
              Export{" "}
              {(exportIds?.length ?? 0) === 1
                ? "Project"
                : `${exportIds?.length ?? 0} Projects`}
            </DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Each project is queued for export and rendered in the
                background. Finished exports appear in the Exports gallery.
              </p>
              <div className="grid gap-2">
                <Label htmlFor="bulk-export-quality">Quality</Label>
                <Select
                  value={exportQuality}
                  onValueChange={(value) =>
                    setExportQuality(value as RenderQuality)
                  }
                >
                  <SelectTrigger id="bulk-export-quality" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RENDER_QUALITY_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}{" "}
                        <span className="text-muted-foreground">
                          ({option.hint})
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-3 rounded-md border bg-background p-3">
                <Checkbox
                  id="bulk-export-include-end-card"
                  checked={includeEndCard}
                  onCheckedChange={(checked) =>
                    setIncludeEndCard(checked === true)
                  }
                />
                <Label htmlFor="bulk-export-include-end-card">
                  Include end card
                </Label>
              </div>
            </div>
          </DialogBody>
          <DialogFooter variant="plain">
            <Button
              type="button"
              variant="outline"
              onClick={() => setExportIds(null)}
            >
              Cancel
            </Button>
            <Button type="button" disabled={exporting} onClick={confirmExport}>
              {exporting ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <UploadIcon className="size-4" />
              )}
              {exporting ? "Queueing" : "Export"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ProjectTableRow({
  project,
  selected,
  onToggle,
  onOpen,
  onRename,
  onDelete,
}: {
  project: ProjectItem
  selected: boolean
  onToggle: () => void
  onOpen: () => void
  onRename: () => void
  onDelete: () => void
}) {
  return (
    <TableRow className="group" data-state={selected ? "selected" : undefined}>
      <TableCell column="select">
        <Checkbox
          checked={selected}
          onCheckedChange={onToggle}
          aria-label={`Select ${project.name}`}
        />
      </TableCell>
      <TableCell column="main">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-md border bg-muted"
            onClick={onOpen}
            aria-label={`Open ${project.name}`}
          >
            <ClapperboardIcon className="size-5 text-muted-foreground" />
          </button>
          <div className="min-w-0">
            <button
              type="button"
              className="truncate font-medium group-hover:underline"
              onClick={onOpen}
            >
              {project.name}
            </button>
            <div
              className={
                project.timeline_error
                  ? "text-xs text-destructive"
                  : "text-xs text-muted-foreground"
              }
            >
              {project.timeline_error
                ? "Timeline reset required"
                : formatDuration(project.duration_ms)}
            </div>
          </div>
        </div>
      </TableCell>
      <TableCell column="meta">
        <ProjectTypeBadge project={project} />
      </TableCell>
      <TableCell column="meta">
        {project.timeline_error ? (
          <Badge variant="destructive">Reset</Badge>
        ) : (
          <Badge variant="outline">{project.clip_count}</Badge>
        )}
      </TableCell>
      <TableCell column="meta">
        <RenderStatusBadge status={project.render_status} />
      </TableCell>
      <TableCell column="mutedMeta" className="hidden lg:table-cell">
        {dateFormatter.format(new Date(project.updated_at))}
      </TableCell>
      <TableCell column="meta">
        <div className="flex justify-start gap-1">
          <Button type="button" size="sm" variant="outline" onClick={onOpen}>
            Open
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onRename}
            aria-label="Rename project"
          >
            <EditIcon className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onDelete}
            aria-label="Delete project"
          >
            <Trash2Icon className="size-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}

function ProjectGalleryItem({
  project,
  selected,
  onToggle,
  onOpen,
  onRename,
  onDelete,
}: {
  project: ProjectItem
  selected: boolean
  onToggle: () => void
  onOpen: () => void
  onRename: () => void
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
        className="relative grid aspect-video w-full place-items-center bg-muted"
        onClick={onOpen}
        aria-label={`Open ${project.name}`}
      >
        <ClapperboardIcon className="size-8 text-muted-foreground" />
        <span className="absolute top-2 left-2">
          <RenderStatusBadge status={project.render_status} />
        </span>
        <span className="absolute bottom-2 left-2">
          <Badge variant="secondary">
            {formatDuration(project.duration_ms)}
          </Badge>
        </span>
        <span className="absolute right-2 bottom-2">
          <ProjectTypeBadge project={project} />
        </span>
      </button>
      <div className="space-y-1 bg-card p-3">
        <button
          type="button"
          className="block max-w-full truncate text-left text-sm font-medium hover:underline"
          onClick={onOpen}
        >
          {project.name}
        </button>
        <p className="text-xs text-muted-foreground">
          Edited {dateFormatter.format(new Date(project.updated_at))}
        </p>
      </div>
      <div className="absolute right-2 top-2 flex shrink-0 items-center gap-1 rounded-md bg-background/90 p-1 shadow-sm">
        <div className="flex h-8 w-8 items-center justify-center">
          <Checkbox
            checked={selected}
            onCheckedChange={onToggle}
            className="border-foreground"
            aria-label={`Select ${project.name}`}
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onRename}
          aria-label="Rename project"
        >
          <EditIcon className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onDelete}
          aria-label="Delete project"
        >
          <Trash2Icon className="size-4" />
        </Button>
      </div>
    </div>
  )
}

function EmptyProjects({ loading }: { loading: boolean }) {
  return (
    <div className="grid h-72 place-items-center text-center text-sm text-muted-foreground">
      <div>
        {loading ? (
          <Loader2Icon className="mx-auto mb-3 size-10 animate-spin" />
        ) : (
          <ClapperboardIcon className="mx-auto mb-3 size-10" />
        )}
        <p>{loading ? "Loading projects..." : "No projects found."}</p>
      </div>
    </div>
  )
}

// Latest-render mirror as a small badge; idle projects show nothing.
function RenderStatusBadge({
  status,
}: {
  status: ProjectItem["render_status"]
}) {
  if (status === "idle") return null
  if (status === "queued") return <Badge variant="outline">Queued</Badge>
  if (status === "rendering") {
    return (
      <Badge variant="secondary">
        <Loader2Icon className="size-3 animate-spin" />
        Rendering
      </Badge>
    )
  }
  if (status === "error") {
    return <Badge variant="destructive">Export failed</Badge>
  }
  return <Badge variant="secondary">Exported</Badge>
}

function ProjectTypeBadge({ project }: { project: ProjectItem }) {
  return (
    <Badge
      variant={project.project_type === "template" ? "secondary" : "outline"}
    >
      {project.project_type === "template" ? "Template-based" : "Regular"}
    </Badge>
  )
}
