import * as React from "react"
import { useNavigate, useRouter } from "@tanstack/react-router"
import { FolderOpenIcon, PlusIcon, SettingsIcon, Trash2Icon } from "lucide-react"
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

type SortColumn = "name" | "accounts" | "keywords" | "waiting" | "comments" | "last"

const COLUMNS: SortableColumn<SortColumn>[] = [
  { key: "name", label: "Project", column: "main" },
  { key: "accounts", label: "Accounts", column: "meta", className: "text-right" },
  { key: "keywords", label: "Keywords", column: "meta", className: "hidden text-right sm:table-cell" },
  { key: "waiting", label: "To look at", column: "meta", className: "hidden text-right md:table-cell" },
  { key: "comments", label: "Comments sent", column: "meta", className: "hidden text-right md:table-cell" },
  { key: "last", label: "Last comment", column: "meta", className: "hidden lg:table-cell" },
]

function compare(a: ProjectRow, b: ProjectRow, column: SortColumn): number {
  switch (column) {
    case "accounts":
      return a.accountCount - b.accountCount
    case "keywords":
      return a.keywordCount - b.keywordCount
    case "waiting":
      return a.waitingCount - b.waitingCount
    case "comments":
      return a.commentCount - b.commentCount
    case "last":
      return (
        (a.lastCommentAt ? new Date(a.lastCommentAt).getTime() : 0) -
        (b.lastCommentAt ? new Date(b.lastCommentAt).getTime() : 0)
      )
    default:
      return a.name.localeCompare(b.name)
  }
}

/**
 * Every project as a table: what it holds and how its comments are going.
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
      .sort((a, b) => factor * compare(a, b, sort))
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
              <button
                type="button"
                className="block max-w-full truncate text-left text-sm font-medium group-hover:underline"
                onClick={() => openProject(project.id)}
              >
                {project.name}
              </button>
              <Hint label={project.description}>
                <span className="block truncate text-xs text-muted-foreground">
                  {project.description || "No description yet"}
                </span>
              </Hint>
            </TableCell>
            <TableCell column="meta" className="text-right tabular-nums">
              {project.accountCount}
            </TableCell>
            <TableCell column="meta" className="hidden text-right tabular-nums sm:table-cell">
              {project.keywordCount}
            </TableCell>
            <TableCell column="meta" className="hidden text-right tabular-nums md:table-cell">
              {project.waitingCount}
            </TableCell>
            <TableCell column="meta" className="hidden text-right tabular-nums md:table-cell">
              {project.commentCount}
            </TableCell>
            <TableCell column="meta" className="hidden text-muted-foreground lg:table-cell">
              {project.lastCommentAt ? postedDateText(new Date(project.lastCommentAt)) : "Never"}
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
