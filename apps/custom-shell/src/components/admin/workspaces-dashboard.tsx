import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { toast } from "sonner"
import { PlusIcon, SettingsIcon, Trash2Icon } from "lucide-react"

import { DashboardTable } from "@/components/shared/dashboard-table"
import {
  DashboardToolbarButton,
  DashboardToolbarSearch,
} from "@/components/shared/dashboard-toolbar"
import { WorkspaceFormDialog } from "@/components/shared/workspace-form-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  TableCell,
  TableHead,
  TableHeader,
  TableSortButton,
  TableRow,
  type TableSortDirection,
} from "@/components/ui/table"
import {
  deleteWorkspace,
  deleteWorkspaces,
  getWorkspaceErrorMessage,
  type WorkspaceItem,
} from "@/lib/api/workspaces"
import { describeBulkResult } from "@/lib/bulk-result"
import {
  DASHBOARD_ROWS_PER_PAGE_OPTIONS,
  renderShellIcon,
} from "@/lib/custom-shell"
import { dismissErrorToast, showErrorToast } from "@/lib/error-toast"
import { useClearSelectionOnListChange } from "@/lib/use-clear-selection"
import { useShellRuntime } from "@/components/shell/shell-layout"

type WorkspaceSortColumn = "name" | "status"

const pageSizeOptions = [...DASHBOARD_ROWS_PER_PAGE_OPTIONS]

export function WorkspacesDashboard({
  initialWorkspaces: workspaces,
}: {
  initialWorkspaces: WorkspaceItem[]
}) {
  const router = useRouter()
  const { config } = useShellRuntime()
  const [searchQuery, setSearchQuery] = React.useState("")
  const [currentPage, setCurrentPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(config.dashboardRowsPerPage)
  const [editing, setEditing] = React.useState<WorkspaceItem | null>(null)
  const [pendingDelete, setPendingDelete] =
    React.useState<WorkspaceItem | null>(null)
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const [massDeleteOpen, setMassDeleteOpen] = React.useState(false)
  const [formOpen, setFormOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [sortColumn, setSortColumn] = React.useState<WorkspaceSortColumn>("name")
  const [sortDirection, setSortDirection] = React.useState<TableSortDirection>("asc")

  const sortedWorkspaces = React.useMemo(() => {
    const direction = sortDirection === "asc" ? 1 : -1
    const query = searchQuery.trim().toLowerCase()
    return workspaces
      .filter((workspace) => !query || workspace.name.toLowerCase().includes(query))
      .sort((a, b) => {
        if (sortColumn === "status") {
          return (Number(b.active) - Number(a.active)) * direction
        }
        return a.name.localeCompare(b.name) * direction
      })
  }, [searchQuery, sortColumn, sortDirection, workspaces])

  const totalPages = Math.ceil(sortedWorkspaces.length / pageSize)
  const paginatedWorkspaces = React.useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize
    return sortedWorkspaces.slice(startIndex, startIndex + pageSize)
  }, [currentPage, pageSize, sortedWorkspaces])

  React.useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, sortColumn, sortDirection, pageSize])

  useClearSelectionOnListChange(
    setSelectedIds,
    `${searchQuery}|${sortColumn}|${sortDirection}|${currentPage}|${pageSize}`
  )

  function toggleSort(column: WorkspaceSortColumn) {
    if (sortColumn === column) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"))
      return
    }

    setSortColumn(column)
    setSortDirection("asc")
  }

  function openCreateForm() {
    setEditing(null)
    setFormOpen(true)
  }

  function openEditForm(workspace: WorkspaceItem) {
    setEditing(workspace)
    setFormOpen(true)
  }

  function toggleSelection(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleVisibleSelection() {
    const visibleIds = paginatedWorkspaces.map((workspace) => workspace.id)
    setSelectedIds((current) => {
      const next = new Set(current)
      if (visibleIds.every((id) => next.has(id))) {
        visibleIds.forEach((id) => next.delete(id))
      } else {
        visibleIds.forEach((id) => next.add(id))
      }
      return next
    })
  }

  const visibleSelected =
    paginatedWorkspaces.length > 0 &&
    paginatedWorkspaces.every((workspace) => selectedIds.has(workspace.id))
  const visiblePartiallySelected =
    !visibleSelected &&
    paginatedWorkspaces.some((workspace) => selectedIds.has(workspace.id))

  // One request for the whole selection, and the server decides what it can
  // take — one workspace always has to survive, so the last one never goes.
  async function confirmMassDelete() {
    dismissErrorToast()
    setBusy(true)
    try {
      const { deleted, kept } = await deleteWorkspaces([...selectedIds])
      await router.invalidate()
      // Anything that would not go stays ticked, so the rows still on screen
      // are the ones the count is talking about.
      setSelectedIds(new Set(kept))

      if (deleted.length === 0) {
        showErrorToast(
          "No workspaces were deleted. One workspace always has to stay, and the others may already be gone."
        )
        return
      }

      toast.success(
        describeBulkResult({
          done: deleted.length,
          kept: kept.length,
          one: "workspace",
          many: "workspaces",
          verb: "deleted",
        })
      )
      setMassDeleteOpen(false)
    } catch (error) {
      showErrorToast(getWorkspaceErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return

    dismissErrorToast()
    setBusy(true)
    try {
      await deleteWorkspace(pendingDelete.id)
      await router.invalidate()
      toast.success("Workspace deleted.")
      setPendingDelete(null)
    } catch (error) {
      showErrorToast(getWorkspaceErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="w-full pb-8">
      <DashboardTable
        title="Workspaces"
        icon={renderShellIcon("briefcaseBusiness", "text-muted-foreground")}
        count={sortedWorkspaces.length}
        selectedCount={selectedIds.size}
        onClearSelection={() => setSelectedIds(new Set())}
        controls={
          <>
            {selectedIds.size ? (
              <DashboardToolbarButton
                type="button"
                variant="destructive"
                onClick={() => setMassDeleteOpen(true)}
                disabled={busy || selectedIds.size >= workspaces.length}
              >
                <Trash2Icon className="size-4" />
                Delete ({selectedIds.size})
              </DashboardToolbarButton>
            ) : null}
            <DashboardToolbarSearch
              name="workspace-search"
              aria-label="Search workspaces"
              placeholder="Search workspaces..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
            <DashboardToolbarButton type="button" onClick={openCreateForm}>
              <PlusIcon className="size-4" />
              New workspace
            </DashboardToolbarButton>
          </>
        }
        header={
          <TableHeader>
            <TableRow>
              <TableHead column="select">
                <Checkbox
                  checked={
                    visibleSelected
                      ? true
                      : visiblePartiallySelected
                        ? "indeterminate"
                        : false
                  }
                  onCheckedChange={toggleVisibleSelection}
                  aria-label="Select visible workspaces"
                />
              </TableHead>
              <TableHead column="main">
                <TableSortButton active={sortColumn === "name"} direction={sortDirection} onClick={() => toggleSort("name")}>
                  Workspace
                </TableSortButton>
              </TableHead>
              <TableHead column="meta">
                <TableSortButton active={sortColumn === "status"} direction={sortDirection} onClick={() => toggleSort("status")}>
                  Status
                </TableSortButton>
              </TableHead>
              <TableHead column="meta">Actions</TableHead>
            </TableRow>
          </TableHeader>
        }
        isEmpty={sortedWorkspaces.length === 0}
        emptyText="No workspaces found."
        emptyColSpan={4}
        footer={{
          type: "pagination",
          page: currentPage,
          pageSize,
          total: sortedWorkspaces.length,
          totalPages,
          onPageChange: (page) =>
            setCurrentPage(Math.max(1, Math.min(page, totalPages || 1))),
          onPageSizeChange: (nextSize) => {
            setCurrentPage(1)
            setPageSize(nextSize)
          },
          pageSizeOptions,
        }}
      >
        {paginatedWorkspaces.map((workspace) => (
          <TableRow key={workspace.id} className="group">
            <TableCell column="select">
              <Checkbox
                checked={selectedIds.has(workspace.id)}
                onCheckedChange={() => toggleSelection(workspace.id)}
                aria-label={`Select ${workspace.name}`}
              />
            </TableCell>
            <TableCell column="main">
              <div className="flex items-center gap-3">
                <span className="flex h-8 min-w-8 shrink-0 items-center justify-center border-border">
                  {workspace.favicon ? (
                    <img
                      src={workspace.favicon}
                      alt={`${workspace.name} favicon`}
                      className="h-8 w-auto object-contain"
                    />
                  ) : (
                    renderShellIcon(workspace.icon)
                  )}
                </span>
                <div className="min-w-0">
                  <button
                    type="button"
                    className="block max-w-full truncate text-left font-medium group-hover:underline"
                    onClick={() => openEditForm(workspace)}
                    title={workspace.name}
                  >
                    {workspace.name}
                  </button>
                </div>
              </div>
            </TableCell>
            <TableCell column="meta">
              {workspace.active ? (
                <Badge>Active</Badge>
              ) : (
                <Badge variant="secondary">Inactive</Badge>
              )}
            </TableCell>
            <TableCell column="meta">
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => openEditForm(workspace)}
                  aria-label={`Edit ${workspace.name}`}
                  title={`Edit ${workspace.name}`}
                >
                  <SettingsIcon className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={workspaces.length <= 1}
                  onClick={() => setPendingDelete(workspace)}
                  aria-label={`Delete ${workspace.name}`}
                  title={`Delete ${workspace.name}`}
                >
                  <Trash2Icon className="size-4" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </DashboardTable>

      <ConfirmDialog
        open={massDeleteOpen}
        onOpenChange={setMassDeleteOpen}
        title={`Delete ${selectedIds.size} ${selectedIds.size === 1 ? "workspace" : "workspaces"}?`}
        description="Their settings and navigation are removed. This cannot be undone."
        confirmLabel="Delete workspaces"
        loading={busy}
        onConfirm={confirmMassDelete}
      />

      <WorkspaceFormDialog
        open={formOpen}
        editing={editing}
        onClose={() => setFormOpen(false)}
      />

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null)
        }}
        title="Delete this workspace?"
        description={`${pendingDelete?.name ?? "This workspace"} and its settings are removed. This cannot be undone.`}
        confirmLabel="Delete workspace"
        loading={busy}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  )
}
