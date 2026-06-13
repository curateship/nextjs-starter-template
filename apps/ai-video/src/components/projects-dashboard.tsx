import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import {
  AlertCircleIcon,
  ClapperboardIcon,
  EditIcon,
  GridIcon,
  ListIcon,
  Loader2Icon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { DashboardTable } from "@/components/dashboard-table"
import {
  DashboardToolbarButton,
  dashboardToolbarButtonActiveClassName,
  dashboardToolbarButtonGroupClassName,
  dashboardToolbarButtonGroupItemClassName,
  DashboardToolbarSearch,
} from "@/components/dashboard-toolbar"
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
  getProjectErrorMessage,
  listProjects,
  renameProject,
  type ProjectItem,
} from "@/lib/api/video-projects"
import { cn } from "@/lib/utils"
import { dateFormatter, pageSizeOptions } from "@/lib/dashboard-format"
import { useSelection } from "@/lib/use-selection"
import { useBulkDelete } from "@/lib/use-bulk-delete"

type ViewMode = "gallery" | "list"
type ProjectSortColumn = "name" | "clips" | "edited"
type ProjectModalState =
  | { type: "create" }
  | { type: "rename"; project: ProjectItem }
  | null

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
  const [projects, setProjects] = React.useState<ProjectItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [modalError, setModalError] = React.useState<string | null>(null)
  const [notice, setNotice] = React.useState<string | null>(null)
  const [searchQuery, setSearchQuery] = React.useState("")
  const [viewMode, setViewMode] = React.useState<ViewMode>("list")
  const [sortColumn, setSortColumn] = React.useState<ProjectSortColumn>("edited")
  const [sortDirection, setSortDirection] =
    React.useState<TableSortDirection>("desc")
  const [currentPage, setCurrentPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(pageSizeOptions[1])
  const [modalState, setModalState] = React.useState<ProjectModalState>(null)
  const [submitting, setSubmitting] = React.useState(false)
  const [name, setName] = React.useState("")

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

  const filteredProjects = React.useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    const direction = sortDirection === "asc" ? 1 : -1
    return projects
      .filter((project) => !query || project.name.toLowerCase().includes(query))
      .sort((a, b) => {
        if (sortColumn === "clips") return (a.clip_count - b.clip_count) * direction
        if (sortColumn === "edited")
          return (
            (new Date(a.updated_at).getTime() -
              new Date(b.updated_at).getTime()) *
            direction
          )
        return a.name.localeCompare(b.name) * direction
      })
  }, [projects, searchQuery, sortColumn, sortDirection])

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
    setModalError(null)
    setError(null)
    setNotice(null)
  }

  function openRenameModal(project: ProjectItem) {
    setModalState({ type: "rename", project })
    setName(project.name)
    setModalError(null)
    setError(null)
    setNotice(null)
  }

  function closeModal() {
    setModalState(null)
    setSubmitting(false)
    setModalError(null)
  }

  // Create then jump straight into the editor for the new project.
  async function handleCreateProject() {
    setSubmitting(true)
    setModalError(null)
    try {
      const created = await createProject(name)
      void navigate({
        to: "/admin/video-editor/$projectId",
        params: { projectId: created.id },
      })
    } catch (createError) {
      setModalError(getProjectErrorMessage(createError))
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
      setNotice("Project renamed.")
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
    setNotice,
    setError,
    formatError: getProjectErrorMessage,
  })

  function goToPage(page: number) {
    setCurrentPage(Math.max(1, Math.min(page, totalPages || 1)))
  }

  const primaryDisabled = submitting || !name.trim()
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
        name="project-search"
        aria-label="Search projects"
        placeholder="Search projects..."
        value={searchQuery}
        onChange={(event) => updateSearch(event.target.value)}
      />
      <div className={dashboardToolbarButtonGroupClassName}>
        <DashboardToolbarButton
          type="button"
          variant="ghost"
          className={cn(
            dashboardToolbarButtonGroupItemClassName,
            viewMode === "list" && dashboardToolbarButtonActiveClassName
          )}
          onClick={() => setViewMode("list")}
          aria-label="List view"
        >
          <ListIcon className="size-4" />
        </DashboardToolbarButton>
        <DashboardToolbarButton
          type="button"
          variant="ghost"
          className={cn(
            dashboardToolbarButtonGroupItemClassName,
            viewMode === "gallery" && dashboardToolbarButtonActiveClassName
          )}
          onClick={() => setViewMode("gallery")}
          aria-label="Grid view"
        >
          <GridIcon className="size-4" />
        </DashboardToolbarButton>
      </div>
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
      {notice ? (
        <div className="mb-4 rounded-md border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
          {notice}
        </div>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

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
                <TableHead column="meta">
                  <TableSortButton
                    active={sortColumn === "clips"}
                    direction={sortDirection}
                    onClick={() => toggleSort("clips")}
                  >
                    Clips
                  </TableSortButton>
                </TableHead>
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
          emptyColSpan={5}
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

      <Dialog
        open={!!deleteIds}
        onOpenChange={(open) => !open && setDeleteIds(null)}
      >
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>
              Delete{" "}
              {(deleteIds?.length ?? 0) === 1
                ? "Project"
                : `${deleteIds?.length ?? 0} Projects`}
              ?
            </DialogTitle>
          </DialogHeader>
          <DialogBody>
            <p className="text-sm text-muted-foreground">
              This removes{" "}
              {(deleteIds?.length ?? 0) === 1
                ? "the project and its timeline"
                : "these projects and their timelines"}
              . This action cannot be undone.
            </p>
          </DialogBody>
          <DialogFooter variant="plain">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteIds(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleting}
              onClick={confirmDelete}
            >
              {deleting ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : null}
              {deleting ? "Deleting" : "Delete"}
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
            <div className="text-xs text-muted-foreground">
              {formatDuration(project.duration_ms)}
            </div>
          </div>
        </div>
      </TableCell>
      <TableCell column="meta">
        <Badge variant="outline">{project.clip_count}</Badge>
      </TableCell>
      <TableCell column="mutedMeta" className="hidden lg:table-cell">
        {dateFormatter.format(new Date(project.updated_at))}
      </TableCell>
      <TableCell column="meta">
        <div className="flex justify-start gap-1">
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
        <span className="absolute bottom-2 left-2">
          <Badge variant="secondary">{formatDuration(project.duration_ms)}</Badge>
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
