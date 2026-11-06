import * as React from "react"
import { ProjectBansLink } from "./project-bans-link"
import { useNavigate, useRouter } from "@tanstack/react-router"
import { FolderOpenIcon, PinIcon, PlusIcon, SettingsIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { DashboardTable } from "@/components/shared/dashboard-table"
import {
  DashboardToolbarButton,
  DashboardToolbarSearch,
} from "@/components/shared/dashboard-toolbar"
import {
  SelectAllTableHead,
  SortableTableHeader,
  type SortableColumn,
} from "@/components/shared/sortable-table-header"
import { useShellRuntime } from "@/components/shell/shell-layout"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { TableCell, TableHead, TableRow } from "@/components/ui/table"
import {
  getProjectErrorMessage,
  removeProjects,
  type ProjectRow,
} from "@/lib/api/social/projects"
import { describeBulkResult } from "@/lib/format/bulk-result"
import { useSelection } from "@/lib/hooks/use-selection"
import { useTableSort } from "@/lib/hooks/use-table-sort"
import { postedDateText } from "@/lib/social/wording"
import { showErrorToast } from "@/lib/toast/error-toast"

import { Hint } from "../hint"
import { NewProjectDialog } from "./project-dialogs"

type SortColumn = "name" | "accounts" | "posts" | "last"

/**
 * Tyler, 5 Nov 2026: Posts and Last post replace Keywords, To look at,
 * Comments sent and Last comment, which belong to a network's Commenting
 * (part 25 of `workspace/tasks/Projects/commenting-dashboard.md`).
 */
const COLUMNS: SortableColumn<SortColumn>[] = [
  { key: "name", label: "Project", column: "main" },
  { key: "accounts", label: "Accounts", column: "meta", className: "text-right" },
  { key: "posts", label: "Posts", column: "meta", className: "hidden text-right sm:table-cell" },
  { key: "last", label: "Last post", column: "meta", className: "hidden md:table-cell" },
]

function compare(a: ProjectRow, b: ProjectRow, column: SortColumn): number {
  switch (column) {
    case "accounts":
      return a.accountCount - b.accountCount
    case "posts":
      return a.postCount - b.postCount
    case "last":
      return (
        (a.lastPostAt ? new Date(a.lastPostAt).getTime() : 0) -
        (b.lastPostAt ? new Date(b.lastPostAt).getTime() : 0)
      )
    default:
      return a.name.localeCompare(b.name)
  }
}

/**
 * Every project as a table: its accounts and how its own posts are going.
 * Tyler, 12 Oct 2026: "project needs a table dashboard".
 *
 * Built like the Voices dashboard. A row opens that project's own
 * three-column dashboard, which is a page of its own because it is where the
 * work is done. Delete keeps any project that still holds accounts or
 * keywords and says why.
 */
export function ProjectsTable({ initial }: { initial: ProjectRow[] }) {
  const { config } = useShellRuntime()
  const router = useRouter()
  const navigate = useNavigate()
  const projects = initial

  const [search, setSearch] = React.useState("")
  const { sort, direction, toggleSort } = useTableSort<SortColumn>("name")
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(config.dashboardRowsPerPage)
  const selection = useSelection()
  const [creating, setCreating] = React.useState(false)
  const [deleteTargets, setDeleteTargets] = React.useState<ProjectRow[]>([])
  const [deleting, setDeleting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const openProject = (projectId: string) =>
    void navigate({ to: "/admin/projects/$projectId", params: { projectId } })

  const refresh = React.useCallback(async () => {
    try {
      await router.invalidate()
      setError(null)
    } catch (loadError) {
      setError(getProjectErrorMessage(loadError))
    }
  }, [router])

  const shown = React.useMemo(() => {
    const query = search.trim().toLowerCase()
    const factor = direction === "asc" ? 1 : -1
    return projects
      .filter(
        (project) =>
          !query ||
          project.name.toLowerCase().includes(query) ||
          project.description.toLowerCase().includes(query)
      )
      // Pinned projects come first whatever the sort, as in Project.
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || factor * compare(a, b, sort))
  }, [direction, projects, search, sort])

  const totalPages = Math.max(1, Math.ceil(shown.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const visible = shown.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const visibleIds = visible.map((project) => project.id)

  async function remove(targets: ProjectRow[]) {
    setDeleting(true)
    try {
      const { deleted, kept } = await removeProjects(targets.map((project) => project.id))
      if (deleted.length) {
        toast.success(
          describeBulkResult({ done: deleted.length, kept: 0, one: "project", many: "projects", verb: "deleted" })
        )
      }
      // Each refusal already names the project and what it still holds.
      if (kept.length) showErrorToast(kept.map((one) => one.reason).join(" "))
      selection.setSelected(new Set(kept.map((one) => one.id)))
      setDeleteTargets([])
      await refresh()
    } catch (deleteError) {
      showErrorToast(getProjectErrorMessage(deleteError))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <DashboardTable
        title="Projects"
        icon={<FolderOpenIcon />}
        count={shown.length}
        error={error ? { message: error, onRetry: () => void refresh() } : null}
        selectedCount={selection.selected.size}
        onClearSelection={selection.clear}
        controls={
          <>
            {selection.selected.size ? (
              <DashboardToolbarButton
                type="button"
                variant="destructive"
                onClick={() =>
                  setDeleteTargets(projects.filter((project) => selection.selected.has(project.id)))
                }
              >
                <Trash2Icon className="size-4" />
                Delete ({selection.selected.size})
              </DashboardToolbarButton>
            ) : null}
            <DashboardToolbarSearch
              name="project-search"
              aria-label="Search projects"
              placeholder="Search projects…"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                setPage(1)
              }}
            />
            <DashboardToolbarButton type="button" onClick={() => setCreating(true)}>
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
              <SelectAllTableHead
                noun="projects"
                checked={selection.selectAllState(visibleIds)}
                onCheckedChange={() => selection.toggleVisible(visibleIds)}
              />
            }
            trailing={<TableHead column="meta">Actions</TableHead>}
          />
        }
        isEmpty={shown.length === 0}
        emptyText={
          projects.length
            ? "No projects match that."
            : "No projects yet. A project is one thing you promote: what it is, the Reddit accounts that comment for it, and the keywords that find posts for them."
        }
        emptyColSpan={COLUMNS.length + 2}
        footer={{
          type: "pagination",
          page: currentPage,
          pageSize,
          total: shown.length,
          totalPages,
          onPageChange: (next) => setPage(Math.max(1, Math.min(next, totalPages))),
          onPageSizeChange: (next) => {
            setPage(1)
            setPageSize(next)
          },
        }}
      >
        {visible.map((project) => (
          <TableRow key={project.id} className="group" rowAction={() => openProject(project.id)}>
            <TableCell column="select">
              <Checkbox
                checked={selection.selected.has(project.id)}
                onCheckedChange={() => selection.toggle(project.id)}
                aria-label={`Select ${project.name}`}
              />
            </TableCell>
            <TableCell column="main" className="max-w-0">
              <span className="flex min-w-0 items-center gap-1.5">
                {project.pinned ? <PinIcon className="size-3.5 shrink-0 fill-amber-400 text-amber-500" aria-label="Pinned" /> : null}
                <button
                  type="button"
                  className="block min-w-0 truncate text-left text-sm font-medium group-hover:underline"
                  onClick={() => openProject(project.id)}
                >
                  {project.name}
                </button>
              </span>
              <Hint label={project.description}>
                <span className="block truncate text-xs text-muted-foreground">
                  {project.description || "No description yet"}
                </span>
              </Hint>
              <ProjectBansLink projectId={project.id} count={project.bannedRecently} />
            </TableCell>
            <TableCell column="meta" className="text-right tabular-nums">
              {project.accountCount}
            </TableCell>
            <TableCell column="meta" className="hidden text-right tabular-nums sm:table-cell">
              {project.postCount}
            </TableCell>
            <TableCell column="meta" className="hidden text-muted-foreground md:table-cell">
              {project.lastPostAt ? postedDateText(new Date(project.lastPostAt)) : "Never"}
            </TableCell>
            <TableCell column="actions">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => openProject(project.id)}
                aria-label={`Open ${project.name}`}
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

      <NewProjectDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={async (projectId) => {
          setCreating(false)
          openProject(projectId)
        }}
      />

      <ConfirmDialog
        open={deleteTargets.length > 0}
        onOpenChange={(open) => {
          if (!open) setDeleteTargets([])
        }}
        title={
          deleteTargets.length === 1
            ? `Delete ${deleteTargets[0].name}?`
            : `Delete ${deleteTargets.length} projects?`
        }
        description="Only an empty project can be deleted. One that still holds accounts or keywords is kept, and the message says what it holds. Nothing else is deleted with it."
        confirmLabel={deleteTargets.length === 1 ? "Delete project" : "Delete projects"}
        loading={deleting}
        onConfirm={() => void remove(deleteTargets)}
      />
    </>
  )
}
