import * as React from "react"
import { getRouteApi, useNavigate, useRouter } from "@tanstack/react-router"
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  CopyIcon,
  ImagesIcon,
  Loader2Icon,
  PinIcon,
  PinOffIcon,
  PlusIcon,
  SettingsIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"

import { CarouselProjectFormDialog } from "@/components/carousel-studio/carousel-project-form-dialog"
import { DashboardTable } from "@/components/shared/dashboard-table"
import {
  DashboardToolbarButton,
  DashboardToolbarSearch,
} from "@/components/shared/dashboard-toolbar"
import {
  SortableTableHeader,
  type SortableColumn,
} from "@/components/shared/sortable-table-header"
import { useShellRuntime } from "@/components/shell/shell-layout"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { TableCell, TableHead, TableRow } from "@/components/ui/table"
import { useKeyedAction } from "@/components/video-assets/use-keyed-action"
import { FolderMenu, MoveToFolderMenu } from "@/components/video-editor/project-folders"
import {
  archiveCarouselProjects,
  carouselFolderApi,
  deleteCarouselProjects,
  duplicateCarouselProject,
  getCarouselProjectErrorMessage,
  loadCarouselProjectDeleteSummary,
  pinCarouselProject,
  type CarouselFolderSummary,
  type CarouselProjectItem,
  type CarouselProjectListResponse,
} from "@/lib/api/video/carousel-projects"
import { describeBulkResult } from "@/lib/format/bulk-result"
import { formatDate } from "@/lib/format/format-time"
import { plural } from "@/lib/format/plural"
import { useClearSelectionOnListChange } from "@/lib/hooks/use-clear-selection"
import { useSelection } from "@/lib/hooks/use-selection"
import { useListSearchNavigate, useListSort, useSearchBoxText } from "@/lib/nav/list-search"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"
import { ARCHIVED_PROJECTS, NO_FOLDER } from "@/lib/video/project-folders"
import { PINNED_ROW_CLASS } from "@/lib/video/pinned-look"

const route = getRouteApi("/_authenticated/admin/video-carousels/")

export type CarouselProjectSortColumn = "name" | "carousels" | "slides" | "format" | "updated"

const COLUMNS: SortableColumn<CarouselProjectSortColumn>[] = [
  { key: "name", label: "Project", column: "main" },
  { key: "carousels", label: "Carousels", column: "meta" },
  { key: "slides", label: "Slides", column: "meta" },
  { key: "format", label: "Shape", column: "meta" },
  { key: "updated", label: "Changed", column: "meta" },
]

function compareProjects(
  a: CarouselProjectItem,
  b: CarouselProjectItem,
  column: CarouselProjectSortColumn
) {
  switch (column) {
    case "carousels":
      return a.carousel_count - b.carousel_count
    case "slides":
      return a.slide_count - b.slide_count
    case "format":
      return a.formats.join(",").localeCompare(b.formats.join(","))
    case "updated":
      return Date.parse(a.updated_at) - Date.parse(b.updated_at)
    default:
      return a.name.localeCompare(b.name)
  }
}

/**
 * The carousel projects table, built like the video projects table (Tyler,
 * 1 Nov 2026; workspace/docs/carousel-project-carousels.md): pinned first,
 * then the newest change, or one folder's worth, or the archived ones. A row
 * opens the carousel editor on the carousel last open in it.
 */
export function CarouselProjectsPage({
  initial,
  folders,
}: {
  initial: CarouselProjectListResponse
  folders: CarouselFolderSummary[]
}) {
  const { config } = useShellRuntime()
  const router = useRouter()
  const navigate = useNavigate()
  const listSearch = route.useSearch()
  const setListSearch = useListSearchNavigate()
  const searchQuery = listSearch.q ?? ""
  const folder = listSearch.folder
  const showingArchived = folder === ARCHIVED_PROJECTS
  const openFolderId = folder && folder !== NO_FOLDER && !showingArchived ? folder : null
  const currentPage = listSearch.page ?? 1
  const [searchText, setSearchText] = useSearchBoxText(searchQuery, (text) =>
    setListSearch({ q: text.trim() ? text : undefined, page: undefined })
  )
  const sort: CarouselProjectSortColumn = listSearch.sort ?? "updated"
  const direction = listSearch.direction ?? "desc"
  const toggleSort = useListSort<CarouselProjectSortColumn>({ sort, direction })

  const [pageSize, setPageSize] = React.useState(config.dashboardRowsPerPage)
  const [formOpen, setFormOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<CarouselProjectItem | null>(null)
  const [deleteTargets, setDeleteTargets] = React.useState<CarouselProjectItem[]>([])
  const [deleteCounts, setDeleteCounts] = React.useState<{
    key: string
    carousels: number
    exports: number
  } | null>(null)
  const { run, isBusy } = useKeyedAction(getCarouselProjectErrorMessage)
  const bulkBusy = isBusy("bulk") || isBusy("delete")
  const rowBusy = (id: string) =>
    isBusy(`pin:${id}`) || isBusy(`duplicate:${id}`) || isBusy(`archive:${id}`)
  const selection = useSelection()

  const projects = initial.projects
  const sorted = React.useMemo(() => {
    const factor = direction === "asc" ? 1 : -1
    return [...projects].sort(
      (a, b) => Number(b.pinned) - Number(a.pinned) || factor * compareProjects(a, b, sort)
    )
  }, [direction, projects, sort])
  const totalPages = Math.ceil(sorted.length / pageSize)
  const visible = React.useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return sorted.slice(start, start + pageSize)
  }, [currentPage, pageSize, sorted])
  const visibleIds = visible.map((project) => project.id)

  useClearSelectionOnListChange(
    selection.setSelected,
    `${searchQuery}|${folder}|${sort}|${direction}|${currentPage}|${pageSize}`
  )

  // What the delete window says goes, counted when it opens.
  const deleteKey = deleteTargets.map((project) => project.id).join(",")
  React.useEffect(() => {
    if (!deleteKey) return
    let active = true
    loadCarouselProjectDeleteSummary(deleteKey.split(","))
      .then((summary) => {
        if (active) setDeleteCounts({ key: deleteKey, ...summary })
      })
      .catch((error) => {
        if (active) showErrorToast(getCarouselProjectErrorMessage(error))
      })
    return () => {
      active = false
    }
  }, [deleteKey])
  const counts = deleteCounts?.key === deleteKey ? deleteCounts : null

  /** Opens the carousel editor on the carousel it remembers, or the one named. */
  function openEditor(project: CarouselProjectItem, carouselId?: string) {
    void navigate({
      to: "/admin/video-carousels/$projectId",
      params: { projectId: project.id },
      search: { carousel: carouselId },
    })
  }

  async function handlePin(project: CarouselProjectItem) {
    await run(`pin:${project.id}`, async () => {
      await pinCarouselProject(project.id, !project.pinned)
      await router.invalidate()
    })
  }

  async function handleArchive(targets: CarouselProjectItem[], archived: boolean, key = "bulk") {
    await run(key, async () => {
      const { done_ids: done } = await archiveCarouselProjects(
        targets.map((project) => project.id),
        archived
      )
      selection.clear()
      await router.invalidate()
      toast.success(
        describeBulkResult({
          done: done.length,
          kept: targets.length - done.length,
          one: "project",
          many: "projects",
          verb: archived ? "archived" : "brought back",
        })
      )
    })
  }

  async function handleDuplicate(project: CarouselProjectItem) {
    await run(`duplicate:${project.id}`, async () => {
      const copy = await duplicateCarouselProject(project.id)
      await router.invalidate()
      toast.success(`"${copy.name}" created.`)
    })
  }

  async function confirmDelete() {
    if (!deleteTargets.length) return
    await run("delete", async () => {
      const { deleted_ids: deleted } = await deleteCarouselProjects(
        deleteTargets.map((project) => project.id)
      )
      if (!deleted.length) {
        showErrorToast("Nothing was deleted. Those projects may already be gone.")
        return
      }
      selection.clear()
      setDeleteTargets([])
      await router.invalidate()
      toast.success(
        describeBulkResult({
          done: deleted.length,
          kept: deleteTargets.length - deleted.length,
          one: "project",
          many: "projects",
          verb: "deleted",
        })
      )
    })
  }

  const selected = projects.filter((project) => selection.selected.has(project.id))
  const selectedCount = selection.selected.size
  const hasMoreThanLoaded = initial.total > projects.length

  return (
    <>
      <DashboardTable
        title="Carousels"
        icon={<ImagesIcon />}
        className="shrink-0"
        count={initial.total}
        selectedCount={selectedCount}
        onClearSelection={selection.clear}
        controls={
          <>
            {selectedCount ? (
              <MoveToFolderMenu
                api={carouselFolderApi}
                projectIds={selected.map((project) => project.id)}
                folders={folders}
                disabled={bulkBusy}
                onMoved={async () => {
                  selection.clear()
                  await router.invalidate()
                }}
              />
            ) : null}
            {selectedCount ? (
              <DashboardToolbarButton
                type="button"
                variant="outline"
                disabled={bulkBusy}
                onClick={() => void handleArchive(selected, !showingArchived)}
              >
                {showingArchived ? (
                  <ArchiveRestoreIcon className="size-4" />
                ) : (
                  <ArchiveIcon className="size-4" />
                )}
                {showingArchived ? "Bring back" : "Archive"} ({selectedCount})
              </DashboardToolbarButton>
            ) : null}
            {selectedCount ? (
              <DashboardToolbarButton
                type="button"
                variant="destructive"
                disabled={bulkBusy}
                onClick={() => setDeleteTargets(selected)}
              >
                <Trash2Icon className="size-4" />
                Delete ({selectedCount})
              </DashboardToolbarButton>
            ) : null}
            <DashboardToolbarSearch
              name="carousel-project-search"
              aria-label="Search carousel projects"
              placeholder="Search projects…"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
            <FolderMenu
              api={carouselFolderApi}
              folders={folders}
              value={folder}
              onChange={(next) => setListSearch({ folder: next, page: undefined })}
              onFoldersChanged={() => router.invalidate()}
            />
            <DashboardToolbarButton
              type="button"
              onClick={() => {
                setEditing(null)
                setFormOpen(true)
              }}
            >
              <PlusIcon className="size-4" />
              New project
            </DashboardToolbarButton>
          </>
        }
        header={
          <SortableTableHeader
            columns={COLUMNS}
            sort={sort}
            direction={direction}
            onSort={toggleSort}
            leading={
              <TableHead column="select">
                <Checkbox
                  checked={selection.selectAllState(visibleIds)}
                  onCheckedChange={() => selection.toggleVisible(visibleIds)}
                  aria-label="Select visible projects"
                />
              </TableHead>
            }
            trailing={<TableHead column="meta">Actions</TableHead>}
          />
        }
        isEmpty={sorted.length === 0}
        emptyText={
          searchQuery
            ? "No projects match that search."
            : showingArchived
              ? "Nothing is archived. Archive keeps a finished project out of the list without deleting anything."
              : folder === NO_FOLDER
                ? "Every project is in a folder."
                : folder
                  ? "Nothing in this folder yet. Tick projects under All and use Move to folder."
                  : "No carousel projects yet. Make one to start a carousel."
        }
        emptyColSpan={7}
        footer={{
          type: "pagination",
          page: currentPage,
          pageSize,
          total: sorted.length,
          totalPages,
          onPageChange: (next) => setListSearch({ page: next > 1 ? next : undefined }),
          onPageSizeChange: (size) => {
            setPageSize(size)
            setListSearch({ page: undefined })
          },
        }}
      >
        {visible.map((project) => (
          <TableRow
            key={project.id}
            className={cn(
              "group",
              // Pinned reads as pinned from across the list, as on the video projects table.
              project.pinned && PINNED_ROW_CLASS
            )}
            rowAction={() => openEditor(project)}
          >
            <TableCell column="select">
              <Checkbox
                checked={selection.selected.has(project.id)}
                onCheckedChange={() => selection.toggle(project.id)}
                aria-label={`Select ${project.name}`}
              />
            </TableCell>
            <TableCell column="main">
              <div className="flex items-center gap-3">
                <span className="flex h-12 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                  {project.thumbnail_url ? (
                    <img src={project.thumbnail_url} alt="" className="size-full object-cover" />
                  ) : (
                    <ImagesIcon className="size-4 text-muted-foreground" />
                  )}
                </span>
                <button
                  type="button"
                  className="flex min-w-0 max-w-full items-center gap-1.5 text-left font-medium group-hover:underline"
                  onClick={() => openEditor(project)}
                >
                  {project.pinned ? (
                    <PinIcon className="size-3.5 shrink-0 text-muted-foreground" aria-label="Pinned" />
                  ) : null}
                  <span className="truncate">{project.name}</span>
                </button>
              </div>
            </TableCell>
            <TableCell column="meta">{project.carousel_count}</TableCell>
            <TableCell column="meta">{project.slide_count}</TableCell>
            <TableCell column="meta">{project.formats.join(", ")}</TableCell>
            <TableCell column="meta">{formatDate(project.updated_at)}</TableCell>
            <TableCell column="actions">
              <div className="flex items-center gap-1">
                {showingArchived ? null : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={rowBusy(project.id)}
                    aria-pressed={project.pinned}
                    onClick={() => void handlePin(project)}
                    aria-label={project.pinned ? `Unpin ${project.name}` : `Pin ${project.name} to the top`}
                  >
                    {isBusy(`pin:${project.id}`) ? (
                      <Loader2Icon className="size-4 animate-spin" />
                    ) : project.pinned ? (
                      <PinOffIcon className="size-4" />
                    ) : (
                      <PinIcon className="size-4" />
                    )}
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={rowBusy(project.id)}
                  onClick={() => void handleDuplicate(project)}
                  aria-label={`Duplicate ${project.name}`}
                >
                  {isBusy(`duplicate:${project.id}`) ? (
                    <Loader2Icon className="size-4 animate-spin" />
                  ) : (
                    <CopyIcon className="size-4" />
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={rowBusy(project.id)}
                  onClick={() => void handleArchive([project], !showingArchived, `archive:${project.id}`)}
                  aria-label={showingArchived ? `Bring back ${project.name}` : `Archive ${project.name}`}
                >
                  {isBusy(`archive:${project.id}`) ? (
                    <Loader2Icon className="size-4 animate-spin" />
                  ) : showingArchived ? (
                    <ArchiveRestoreIcon className="size-4" />
                  ) : (
                    <ArchiveIcon className="size-4" />
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={rowBusy(project.id)}
                  onClick={() => {
                    setEditing(project)
                    setFormOpen(true)
                  }}
                  aria-label={`Settings for ${project.name}`}
                >
                  <SettingsIcon className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={rowBusy(project.id)}
                  onClick={() => setDeleteTargets([project])}
                  aria-label={`Delete ${project.name}`}
                >
                  <Trash2Icon className="size-4" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </DashboardTable>

      {hasMoreThanLoaded ? (
        <p className="text-sm text-muted-foreground">
          Showing the {projects.length} most recently changed of {initial.total} projects. Search to
          find the older ones.
        </p>
      ) : null}

      <CarouselProjectFormDialog
        open={formOpen}
        project={editing}
        folderId={openFolderId}
        folders={folders}
        onClose={() => {
          setFormOpen(false)
          setEditing(null)
        }}
        onCreated={(created, carouselId) => openEditor(created, carouselId)}
        onSaved={() => void router.invalidate()}
      />

      <ConfirmDialog
        open={deleteTargets.length > 0}
        onOpenChange={(open) => {
          if (!open) setDeleteTargets([])
        }}
        title={
          deleteTargets.length > 1
            ? `Delete ${deleteTargets.length} projects?`
            : "Delete this project?"
        }
        description={
          counts
            ? `${counts.carousels} ${plural(counts.carousels, "carousel")} ${counts.carousels === 1 ? "goes" : "go"} for good. ${counts.exports ? `Their ${counts.exports} kept ${plural(counts.exports, "export")} stay on the Exports page, and the` : "The"} pictures stay in your media library.`
            : "Every carousel in it goes for good. Kept exports and the pictures in your media library stay."
        }
        confirmLabel={deleteTargets.length > 1 ? "Delete projects" : "Delete project"}
        loading={isBusy("delete")}
        onConfirm={confirmDelete}
      />
    </>
  )
}
