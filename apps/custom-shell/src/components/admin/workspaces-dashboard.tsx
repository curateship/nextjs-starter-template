import { capitalise, workspaceWord } from "@/lib/app-options"
import * as React from "react"
import { getRouteApi, useNavigate, useRouter } from "@tanstack/react-router"
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
  SortableTableHeader,
  type SortableColumn,
} from "@/components/shared/sortable-table-header"
import { TableCell, TableHead, TableRow } from "@/components/ui/table"
import {
  deleteWorkspace,
  deleteWorkspaces,
  getWorkspaceErrorMessage,
  type WorkspaceItem,
} from "@/lib/api/people/workspaces"
import { describeBulkResult } from "@/lib/format/bulk-result"
import { plural } from "@/lib/format/plural"
import { renderShellIcon } from "@/lib/custom-shell"
import { DisabledReason } from "@/components/ui/disabled-reason"
import { showErrorToast } from "@/lib/toast/error-toast"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useClearSelectionOnListChange } from "@/lib/hooks/use-clear-selection"
import { useClientPage } from "@/lib/hooks/use-client-page"
import { useSelection } from "@/lib/hooks/use-selection"
import { useTableSort } from "@/lib/hooks/use-table-sort"
import { useShellRuntime } from "@/components/shell/shell-layout"

type WorkspaceSortColumn = "name" | "status"

const WORKSPACE_COLUMNS: SortableColumn<WorkspaceSortColumn>[] = [
  { key: "name", label: "Workspace", column: "main" },
  { key: "status", label: "Status", column: "meta" },
]
const workspacesRoute = getRouteApi("/_authenticated/workspaces")

export function WorkspacesDashboard({
  initialWorkspaces: workspaces,
  baseDomain = "",
}: {
  initialWorkspaces: WorkspaceItem[]
  /** The domain workspaces hang off, for the address field's preview. */
  baseDomain?: string
}) {
  // Read inside the component, never at module level — an app's options file
  // can import its way back here.
  const word = workspaceWord()
  const router = useRouter()
  const navigate = useNavigate()
  const { open: openWorkspaceId } = workspacesRoute.useSearch()
  const { config } = useShellRuntime()
  const [searchQuery, setSearchQuery] = React.useState("")
  const [editing, setEditing] = React.useState<WorkspaceItem | null>(null)
  const [pendingDelete, setPendingDelete] =
    React.useState<WorkspaceItem | null>(null)
  const [massDeleteOpen, setMassDeleteOpen] = React.useState(false)
  const [formOpen, setFormOpen] = React.useState(false)
  const [run, busy] = useAsyncAction(getWorkspaceErrorMessage)
  const { sort, direction: sortDirection, toggleSort } =
    useTableSort<WorkspaceSortColumn>("name")
  const selection = useSelection()
  const selectedIds = selection.selected
  const setOpenWorkspace = React.useCallback(
    (id: string | undefined) => {
      void navigate({
        to: ".",
        search: (previous: Record<string, unknown>) => {
          const next = { ...previous }
          if (id) next.open = id
          else delete next.open
          return next
        },
      })
    },
    [navigate]
  )

  const sortedWorkspaces = React.useMemo(() => {
    const direction = sortDirection === "asc" ? 1 : -1
    const query = searchQuery.trim().toLowerCase()
    return workspaces
      .filter((workspace) => !query || workspace.name.toLowerCase().includes(query))
      .sort((a, b) => {
        if (sort === "status") {
          return (Number(b.active) - Number(a.active)) * direction
        }
        return a.name.localeCompare(b.name) * direction
      })
  }, [searchQuery, sort, sortDirection, workspaces])

  const {
    page: currentPage,
    pageSize,
    visible: paginatedWorkspaces,
    footer,
  } = useClientPage(
    sortedWorkspaces,
    config.dashboardRowsPerPage,
    `${searchQuery}|${sort}|${sortDirection}`
  )
  const visibleIds = paginatedWorkspaces.map((workspace) => workspace.id)

  useClearSelectionOnListChange(
    selection.setSelected,
    `${searchQuery}|${sort}|${sortDirection}|${currentPage}|${pageSize}`
  )

  function openCreateForm() {
    setEditing(null)
    setFormOpen(true)
  }

  function openEditForm(workspace: WorkspaceItem) {
    setEditing(workspace)
    setFormOpen(true)
    setOpenWorkspace(workspace.id)
  }

  React.useEffect(() => {
    if (openWorkspaceId) {
      const workspace = workspaces.find((item) => item.id === openWorkspaceId)
      if (workspace) {
        setEditing(workspace)
        setFormOpen(true)
      }
      return
    }
    if (!formOpen || editing) {
      setEditing(null)
      setFormOpen(false)
    }
  }, [editing, formOpen, openWorkspaceId, workspaces])

  // One request for the whole selection, and the server decides what it can
  // take — one workspace always has to survive, so the last one never goes.
  async function confirmMassDelete() {
    await run(async () => {
      const { deleted, kept } = await deleteWorkspaces([...selectedIds])
      await router.invalidate()
      // Anything that would not go stays ticked, so the rows still on screen
      // are the ones the count is talking about.
      selection.setSelected(new Set(kept))

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
    })
  }

  async function confirmDelete() {
    if (!pendingDelete) return

    await run(async () => {
      await deleteWorkspace(pendingDelete.id)
      await router.invalidate()
      toast.success("Workspace deleted.")
      setPendingDelete(null)
    })
  }

  return (
    <>
      <DashboardTable
        title={capitalise(word.many)}
        icon={renderShellIcon("briefcaseBusiness", "text-muted-foreground")}
        count={sortedWorkspaces.length}
        selectedCount={selectedIds.size}
        onClearSelection={selection.clear}
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
              placeholder="Search workspaces…"
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
          <SortableTableHeader
            columns={WORKSPACE_COLUMNS}
            sort={sort}
            direction={sortDirection}
            onSort={toggleSort}
            leading={
              <TableHead column="select">
                <Checkbox
                  checked={selection.selectAllState(visibleIds)}
                  onCheckedChange={() => selection.toggleVisible(visibleIds)}
                  aria-label="Select visible workspaces"
                />
              </TableHead>
            }
            trailing={<TableHead column="meta">Actions</TableHead>}
          />
        }
        isEmpty={sortedWorkspaces.length === 0}
        emptyText="No workspaces found."
        emptyColSpan={4}
        footer={footer}
      >
        {paginatedWorkspaces.map((workspace) => (
          <TableRow
            key={workspace.id}
            className="group"
            rowAction={() => openEditForm(workspace)}
          >
            <TableCell column="select">
              <Checkbox
                checked={selectedIds.has(workspace.id)}
                onCheckedChange={() => selection.toggle(workspace.id)}
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
            <TableCell column="actions">
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
                <DisabledReason
                  disabled={workspaces.length <= 1}
                  reason="This is your last workspace, and the app needs one. Make another before deleting this."
                >
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
                </DisabledReason>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </DashboardTable>

      <ConfirmDialog
        open={massDeleteOpen}
        onOpenChange={setMassDeleteOpen}
        title={`Delete ${selectedIds.size} ${plural(selectedIds.size, "workspace", "workspaces")}?`}
        description="Their settings and navigation are removed. This cannot be undone."
        confirmLabel="Delete workspaces"
        loading={busy}
        onConfirm={confirmMassDelete}
      />

      <WorkspaceFormDialog
        baseDomain={baseDomain}
        open={formOpen}
        editing={editing}
        onClose={() => {
          setEditing(null)
          setFormOpen(false)
          setOpenWorkspace(undefined)
        }}
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
    </>
  )
}
