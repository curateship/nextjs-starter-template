import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import {
  Loader2Icon,
  SettingsIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react"

import { DashboardTable } from "@/components/dashboard-table"
import { DashboardToolbarButton } from "@/components/dashboard-toolbar"
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
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
import { Input } from "@/components/ui/input"
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
  createWorkspace,
  deleteWorkspace,
  getWorkspaceErrorMessage,
  updateWorkspace,
  type WorkspaceItem,
} from "@/lib/api/workspaces"
import { iconMeta, renderShellIcon, type IconKey } from "@/lib/ai-video"
import { useSelection } from "@/lib/use-selection"
import { useBulkDelete } from "@/lib/use-bulk-delete"

type WorkspaceForm = {
  name: string
  icon: IconKey
}
type WorkspaceSortColumn = "name" | "status"

const defaultIcon = "briefcaseBusiness" satisfies IconKey

export function WorkspacesDashboard({
  initialWorkspaces: workspaces,
}: {
  initialWorkspaces: WorkspaceItem[]
}) {
  const router = useRouter()
  const [editing, setEditing] = React.useState<WorkspaceItem | null>(null)
  const [formOpen, setFormOpen] = React.useState(false)
  const [form, setForm] = React.useState<WorkspaceForm>({
    name: "",
    icon: defaultIcon,
  })
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [sortColumn, setSortColumn] = React.useState<WorkspaceSortColumn>("name")
  const [sortDirection, setSortDirection] = React.useState<TableSortDirection>("asc")

  const sortedWorkspaces = React.useMemo(() => {
    const direction = sortDirection === "asc" ? 1 : -1
    return [...workspaces].sort((a, b) => {
      if (sortColumn === "status") {
        return (Number(b.active) - Number(a.active)) * direction
      }
      return a.name.localeCompare(b.name) * direction
    })
  }, [sortColumn, sortDirection, workspaces])

  const visibleIds = sortedWorkspaces.map((workspace) => workspace.id)
  const {
    selectedIds,
    toggleSelected,
    selectAllState,
    toggleVisibleSelected,
    clearSelection,
  } = useSelection(visibleIds)

  const { deleteIds, setDeleteIds, deleting, confirmDelete } = useBulkDelete({
    noun: "workspace",
    // No bulk endpoint exists, so single deletes drive both paths: one row at a
    // time, reusing the server's per-workspace guards (last/active handling).
    deleteOne: deleteWorkspace,
    deleteMany: async (ids) => {
      for (const id of ids) {
        await deleteWorkspace(id)
      }
      return { deletedCount: ids.length }
    },
    // Workspaces come from the route loader (props), so refetch instead of
    // filtering local state.
    reload: () => router.invalidate(),
    clearSelection,
    formatError: getWorkspaceErrorMessage,
  })

  const activeWorkspaceId = workspaces.find((workspace) => workspace.active)?.id

  // Bulk delete guard: never remove the last workspace. If the whole list is
  // selected, keep the active one so at least one survives (mirrors the per-row
  // last-workspace guard on the trash button).
  function requestBulkDelete() {
    const ids = Array.from(selectedIds)
    const deletable =
      ids.length >= workspaces.length
        ? ids.filter((id) => id !== activeWorkspaceId)
        : ids
    if (deletable.length === 0) {
      setError("At least one workspace is required")
      return
    }
    setError(null)
    setDeleteIds(deletable)
  }

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
    setForm({ name: "", icon: defaultIcon })
    setError(null)
    setFormOpen(true)
  }

  function openEditForm(workspace: WorkspaceItem) {
    setEditing(workspace)
    setForm({ name: workspace.name, icon: workspace.icon })
    setError(null)
    setFormOpen(true)
  }

  async function saveWorkspace() {
    const name = form.name.trim()
    if (!name) {
      setError("Workspace name is required")
      return
    }

    setBusy(true)
    setError(null)
    try {
      if (editing) {
        await updateWorkspace(editing.id, name, form.icon)
      } else {
        await createWorkspace(name, form.icon)
      }
      await router.invalidate()
      setFormOpen(false)
      setEditing(null)
    } catch (error) {
      setError(getWorkspaceErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="w-full pb-8">
      <DashboardTable
        title="Workspaces"
        icon={renderShellIcon(
          "briefcaseBusiness",
          "size-4 text-muted-foreground sm:size-[18px]"
        )}
        count={sortedWorkspaces.length}
        status={error ? { tone: "error", text: error } : null}
        selectedCount={selectedIds.size}
        onClearSelection={() => clearSelection()}
        controls={
          <>
            {selectedIds.size > 0 ? (
              <DashboardToolbarButton
                type="button"
                variant="destructive"
                onClick={requestBulkDelete}
              >
                <Trash2Icon className="size-4" />
                Delete {selectedIds.size}
              </DashboardToolbarButton>
            ) : null}
            <DashboardToolbarButton type="button" onClick={openCreateForm}>
              <PlusIcon className="size-4" />
              Add Workspace
            </DashboardToolbarButton>
          </>
        }
        header={
          <TableHeader>
            <TableRow>
              <TableHead column="select">
                <Checkbox
                  checked={selectAllState}
                  onCheckedChange={toggleVisibleSelected}
                  aria-label="Select all workspaces"
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
          type: "summary",
          count: sortedWorkspaces.length,
          label: "workspaces",
        }}
      >
        {sortedWorkspaces.map((workspace) => (
          <TableRow
            key={workspace.id}
            className="group"
            data-state={selectedIds.has(workspace.id) ? "selected" : undefined}
          >
            <TableCell column="select">
              <Checkbox
                checked={selectedIds.has(workspace.id)}
                onCheckedChange={() => toggleSelected(workspace.id)}
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
                    className="truncate font-medium text-left hover:underline"
                    onClick={() => openEditForm(workspace)}
                  >
                    {workspace.name}
                  </button>
                  <div className="text-xs text-muted-foreground">
                    Private project
                  </div>
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
                  size="icon-sm"
                  onClick={() => openEditForm(workspace)}
                  aria-label={`Edit ${workspace.name}`}
                  title={`Edit ${workspace.name}`}
                >
                  <SettingsIcon className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={workspaces.length <= 1}
                  onClick={() => setDeleteIds([workspace.id])}
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

      <WorkspaceFormDialog
        open={formOpen}
        editing={editing}
        form={form}
        saving={busy}
        error={error}
        onFormChange={setForm}
        onOpenChange={setFormOpen}
        onSave={() => void saveWorkspace()}
      />

      <DeleteConfirmDialog
        ids={deleteIds}
        noun="Workspace"
        description={(count) =>
          count === 1
            ? "This permanently removes the workspace and everything in it. This action cannot be undone."
            : "This permanently removes these workspaces and everything in them. This action cannot be undone."
        }
        deleting={deleting}
        onClose={() => setDeleteIds(null)}
        onConfirm={confirmDelete}
      />
    </div>
  )
}

function WorkspaceFormDialog({
  open,
  editing,
  form,
  saving,
  error,
  onFormChange,
  onOpenChange,
  onSave,
}: {
  open: boolean
  editing: WorkspaceItem | null
  form: WorkspaceForm
  saving: boolean
  error: string | null
  onFormChange: (form: WorkspaceForm) => void
  onOpenChange: (open: boolean) => void
  onSave: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Edit Workspace" : "Add Workspace"}
          </DialogTitle>
          <DialogDescription>
            Choose the name and icon shown in the workspace switcher.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Card size="sm">
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <FieldLabel htmlFor="workspace-name">Name</FieldLabel>
                <Input
                  id="workspace-name"
                  value={form.name}
                  disabled={saving}
                  onChange={(event) =>
                    onFormChange({ ...form, name: event.target.value })
                  }
                />
              </div>
              <div className="grid gap-2">
                <FieldLabel htmlFor="workspace-icon">Icon</FieldLabel>
                <Select
                  value={form.icon}
                  disabled={saving}
                  onValueChange={(value) =>
                    onFormChange({ ...form, icon: value as IconKey })
                  }
                >
                  <SelectTrigger id="workspace-icon" className="w-full sm:w-fit">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(iconMeta).map(([icon, meta]) => (
                      <SelectItem key={icon} value={icon}>
                        {renderShellIcon(icon as IconKey)}
                        {meta.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </DialogBody>
        <DialogFooter variant="plain">
          <>
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="button" disabled={saving} onClick={onSave}>
              {saving ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : null}
              {saving ? "Saving..." : "Save"}
            </Button>
          </>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
