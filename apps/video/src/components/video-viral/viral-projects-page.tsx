import * as React from "react"
import { getRouteApi, useNavigate, useRouter } from "@tanstack/react-router"
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  ChartNoAxesCombinedIcon,
  CopyIcon,
  Loader2Icon,
  PinIcon,
  PinOffIcon,
  PlusIcon,
  SettingsIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"

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
import {
  FolderMenu,
  MoveToFolderMenu,
  type FolderApi,
} from "@/components/video-editor/project-folders"
import { ViralProjectDialog } from "@/components/video-viral/viral-project-dialog"
import { getViralErrorMessage } from "@/lib/api/video/viral"
import {
  addSampleViralProject,
  archiveViralProjectsFn,
  deleteViralProjectsFn,
  duplicateViralProjectFn,
  loadViralDeleteSummary,
  pinViralProjectFn,
  viralFolderApi,
  type ViralDeleteSummary,
  type ViralFolderSummary,
} from "@/lib/api/video/viral-projects"
import { describeBulkResult } from "@/lib/format/bulk-result"
import { formatDate } from "@/lib/format/format-time"
import { plural } from "@/lib/format/plural"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useClearSelectionOnListChange } from "@/lib/hooks/use-clear-selection"
import { useSelection } from "@/lib/hooks/use-selection"
import {
  useListSearchNavigate,
  useListSort,
  useSearchBoxText,
} from "@/lib/nav/list-search"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"
import { ARCHIVED_PROJECTS, NO_FOLDER } from "@/lib/video/project-folders"
import { countVideos, type ViralProjectItem } from "@/lib/video/viral"

const listRoute = getRouteApi("/_authenticated/admin/video-viral/")

/** How often the list looks again while a project is searching. */
const SEARCHING_POLL_MS = 5000

const folderApi: FolderApi = {
  ...viralFolderApi,
  errorMessage: getViralErrorMessage,
}

export type ViralProjectSortColumn = "name" | "videos" | "units" | "updated"

const COLUMNS: SortableColumn<ViralProjectSortColumn>[] = [
  { key: "name", label: "Project", column: "main" },
  { key: "videos", label: "Videos", column: "meta" },
  { key: "units", label: "YouTube units", column: "meta" },
  { key: "updated", label: "Changed", column: "meta" },
]

function compare(a: ViralProjectItem, b: ViralProjectItem, column: ViralProjectSortColumn) {
  switch (column) {
    case "videos":
      return a.result_count - b.result_count
    case "units":
      return a.units_spent - b.units_spent
    case "updated":
      return Date.parse(a.updated_at) - Date.parse(b.updated_at)
    default:
      return a.name.localeCompare(b.name)
  }
}

/** "120 videos, 3 hidden channels and 2 followed creators", leaving out none. */
function describeGoing(summary: ViralDeleteSummary) {
  const parts = [
    summary.videos ? countVideos(summary.videos) : null,
    summary.hidden_channels
      ? `${summary.hidden_channels} ${plural(summary.hidden_channels, "hidden channel")}`
      : null,
    summary.creators
      ? `the links to ${summary.creators} ${plural(summary.creators, "followed creator")}`
      : null,
  ].filter((part): part is string => part !== null)
  if (!parts.length) return null
  return parts.length === 1
    ? parts[0]
    : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`
}

/**
 * Every Viral project, pinned ones first: one niche each. A row opens the
 * project's three panels; the cog changes its settings without leaving the
 * list.
 */
export function ViralProjectsPage({
  projects,
  folders,
}: {
  projects: ViralProjectItem[]
  folders: ViralFolderSummary[]
}) {
  const { config } = useShellRuntime()
  const router = useRouter()
  const navigate = useNavigate()
  const listSearch = listRoute.useSearch()
  const setListSearch = useListSearchNavigate()
  const searchQuery = listSearch.q ?? ""
  const folder = listSearch.folder
  const showingArchived = folder === ARCHIVED_PROJECTS
  const openFolderId =
    folder && folder !== NO_FOLDER && !showingArchived ? folder : null
  const currentPage = listSearch.page ?? 1
  const [searchText, setSearchText] = useSearchBoxText(searchQuery, (text) =>
    setListSearch({ q: text.trim() ? text : undefined, page: undefined })
  )
  const sort: ViralProjectSortColumn = listSearch.sort ?? "updated"
  const direction = listSearch.direction ?? "desc"
  const toggleSort = useListSort<ViralProjectSortColumn>({ sort, direction })

  const [pageSize, setPageSize] = React.useState(config.dashboardRowsPerPage)
  const [formOpen, setFormOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<ViralProjectItem | null>(null)
  const [deleteTargets, setDeleteTargets] = React.useState<ViralProjectItem[]>([])
  const [deleteSummary, setDeleteSummary] =
    React.useState<ViralDeleteSummary | null>(null)
  const [run, busy] = useAsyncAction(getViralErrorMessage)
  const selection = useSelection()

  // A project searching in the background changes its count and cover when
  // it finishes, so the list looks again until none is searching.
  const anySearching = projects.some((project) => project.searching)
  React.useEffect(() => {
    if (!anySearching) return
    const timer = setInterval(() => void router.invalidate(), SEARCHING_POLL_MS)
    return () => clearInterval(timer)
  }, [anySearching, router])

  const sorted = React.useMemo(() => {
    const factor = direction === "asc" ? 1 : -1
    return [...projects].sort(
      (a, b) => Number(b.pinned) - Number(a.pinned) || factor * compare(a, b, sort)
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

  const deleteKey = deleteTargets.map((project) => project.id).join(",")
  React.useEffect(() => {
    if (!deleteKey) return
    let active = true
    loadViralDeleteSummary(deleteKey.split(","))
      .then((summary) => {
        if (active) setDeleteSummary(summary)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [deleteKey])

  function open(project: ViralProjectItem) {
    void navigate({
      to: "/admin/video-viral/$projectId",
      params: { projectId: project.id },
    })
  }

  async function createSample() {
    await run(async () => open(await addSampleViralProject()))
  }

  async function handlePin(project: ViralProjectItem) {
    await run(async () => {
      await pinViralProjectFn(project.id, !project.pinned)
      await router.invalidate()
    })
  }

  async function handleArchive(targets: ViralProjectItem[], archived: boolean) {
    await run(async () => {
      const { done_ids: done } = await archiveViralProjectsFn(
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

  async function handleDuplicate(project: ViralProjectItem) {
    await run(async () => {
      const copy = await duplicateViralProjectFn(project.id)
      await router.invalidate()
      toast.success(`"${copy.name}" created. It searches nothing until you press Search.`)
    })
  }

  async function confirmDelete() {
    if (!deleteTargets.length) return
    await run(async () => {
      const { deleted_ids: deleted } = await deleteViralProjectsFn(
        deleteTargets.map((project) => project.id)
      )
      if (!deleted.length) {
        showErrorToast("Nothing was deleted. Those projects may already be gone.")
        return
      }
      selection.clear()
      setDeleteTargets([])
      setDeleteSummary(null)
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

  const selectedProjects = projects.filter((project) =>
    selection.selected.has(project.id)
  )
  const selectedCount = selection.selected.size

  return (
    <>
      <DashboardTable
        title="Viral"
        icon={<ChartNoAxesCombinedIcon />}
        className="shrink-0"
        count={projects.length}
        selectedCount={selectedCount}
        onClearSelection={selection.clear}
        controls={
          <>
            {selectedCount ? (
              <MoveToFolderMenu
                api={folderApi}
                projectIds={selectedProjects.map((project) => project.id)}
                folders={folders}
                disabled={busy}
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
                disabled={busy}
                onClick={() => void handleArchive(selectedProjects, !showingArchived)}
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
                disabled={busy}
                onClick={() => setDeleteTargets(selectedProjects)}
              >
                <Trash2Icon className="size-4" />
                Delete ({selectedCount})
              </DashboardToolbarButton>
            ) : null}
            <DashboardToolbarSearch
              name="viral-project-search"
              aria-label="Search projects"
              placeholder="Search projects…"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
            <FolderMenu
              api={folderApi}
              folders={folders}
              value={folder}
              onChange={(next) => setListSearch({ folder: next, page: undefined })}
              onFoldersChanged={() => router.invalidate()}
            />
            {projects.length === 0 && !searchQuery && !folder ? (
              <DashboardToolbarButton
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => void createSample()}
              >
                Add a sample project
              </DashboardToolbarButton>
            ) : null}
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
              ? "Nothing is archived. Archive keeps a project out of the list without deleting anything."
              : folder === NO_FOLDER
                ? "Every project is in a folder."
                : folder
                  ? "Nothing in this folder yet. Tick projects under All and use Move to folder."
                  : "No projects yet. Make one for a niche: describe it, add a few keywords, and press Search."
        }
        emptyColSpan={6}
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
              project.pinned &&
                "bg-amber-50 hover:bg-amber-100/70 dark:bg-amber-400/10 dark:hover:bg-amber-400/15"
            )}
            rowAction={() => open(project)}
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
                <span className="flex h-12 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                  {project.cover_url ? (
                    <img src={project.cover_url} alt="" className="size-full object-cover" />
                  ) : (
                    <ChartNoAxesCombinedIcon className="size-4 text-muted-foreground" />
                  )}
                </span>
                <div className="grid min-w-0 gap-1">
                  <button
                    type="button"
                    className="flex max-w-full items-center gap-1.5 text-left font-medium group-hover:underline"
                    onClick={() => open(project)}
                  >
                    {project.pinned ? (
                      <PinIcon
                        className="size-3.5 shrink-0 text-muted-foreground"
                        aria-label="Pinned"
                      />
                    ) : null}
                    <span className="truncate">{project.name}</span>
                  </button>
                  <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                    {project.searching ? (
                      <Loader2Icon className="size-3 shrink-0 animate-spin" aria-label="Searching" />
                    ) : null}
                    <span className="truncate">
                      {project.keywords.length
                        ? project.keywords.join(", ")
                        : "No keywords yet"}
                    </span>
                  </span>
                </div>
              </div>
            </TableCell>
            <TableCell column="meta" className="tabular-nums">
              {project.result_count.toLocaleString()}
            </TableCell>
            <TableCell column="meta" className="tabular-nums">
              {project.units_spent.toLocaleString()}
            </TableCell>
            <TableCell column="meta">{formatDate(project.updated_at)}</TableCell>
            <TableCell column="actions">
              {showingArchived ? null : (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={busy}
                  aria-pressed={project.pinned}
                  onClick={() => void handlePin(project)}
                  aria-label={
                    project.pinned ? `Unpin ${project.name}` : `Pin ${project.name} to the top`
                  }
                >
                  {project.pinned ? (
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
                disabled={busy}
                onClick={() => void handleDuplicate(project)}
                aria-label={`Duplicate ${project.name}`}
              >
                <CopyIcon className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={busy}
                onClick={() => void handleArchive([project], !showingArchived)}
                aria-label={
                  showingArchived ? `Bring back ${project.name}` : `Archive ${project.name}`
                }
              >
                {showingArchived ? (
                  <ArchiveRestoreIcon className="size-4" />
                ) : (
                  <ArchiveIcon className="size-4" />
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
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
                onClick={() => setDeleteTargets([project])}
                aria-label={`Delete ${project.name}`}
              >
                <Trash2Icon className="size-4" />
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </DashboardTable>

      <ViralProjectDialog
        open={formOpen}
        project={editing}
        folderId={openFolderId}
        folders={folders}
        onClose={() => {
          setFormOpen(false)
          setEditing(null)
        }}
        onCreated={open}
        onSaved={() => void router.invalidate()}
      />

      <ConfirmDialog
        open={deleteTargets.length > 0}
        onOpenChange={(shown) => {
          if (!shown) {
            setDeleteTargets([])
            setDeleteSummary(null)
          }
        }}
        title={
          deleteTargets.length > 1
            ? `Delete ${deleteTargets.length} projects?`
            : "Delete this project?"
        }
        description={(() => {
          const going = deleteSummary ? describeGoing(deleteSummary) : null
          const goes = going
            ? `Its keywords go for good, and so do ${going}.`
            : "Its keywords go for good."
          const stays = [
            deleteSummary?.starred
              ? `${deleteSummary.starred} starred ${plural(deleteSummary.starred, "video")}`
              : "starred videos",
            "saved breakdowns",
            deleteSummary?.made_projects
              ? `the ${deleteSummary.made_projects} editor ${plural(deleteSummary.made_projects, "project")} made from it`
              : "editor projects made from it",
          ]
          return `${goes} These stay: ${stays.join(", ")}, and creators followed in other projects.`
        })()}
        confirmLabel={deleteTargets.length > 1 ? "Delete projects" : "Delete project"}
        loading={busy}
        onConfirm={confirmDelete}
      />
    </>
  )
}
