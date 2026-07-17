import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import {
  Loader2Icon,
  PlusIcon,
  SettingsIcon,
  Trash2Icon,
} from "lucide-react"

import { DashboardTable } from "@/components/dashboard-table"
import { DashboardToolbarButton } from "@/components/dashboard-toolbar"
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
  createWorkspace,
  deleteWorkspace,
  getWorkspaceErrorMessage,
  updateWorkspace,
  type WorkspaceItem,
} from "@/lib/api/workspaces"
import { iconMeta, renderShellIcon, type IconKey } from "@/lib/custom-shell"

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
  const [pendingDelete, setPendingDelete] = React.useState<
    WorkspaceItem[] | null
  >(null)
  const [formOpen, setFormOpen] = React.useState(false)
  const [form, setForm] = React.useState<WorkspaceForm>({
    name: "",
    icon: defaultIcon,
  })
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
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

  const selectedWorkspaces = sortedWorkspaces.filter((workspace) =>
    selected.has(workspace.id)
  )
  const allSelected =
    sortedWorkspaces.length > 0 &&
    selectedWorkspaces.length === sortedWorkspaces.length
  // At least one workspace must remain, so a selection covering every
  // workspace can't be mass-deleted.
  const massDeleteBlocked =
    selectedWorkspaces.length >= workspaces.length

  function toggleSort(column: WorkspaceSortColumn) {
    if (sortColumn === column) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"))
      return
    }

    setSortColumn(column)
    setSortDirection("asc")
  }

  function toggleAll() {
    setSelected(
      allSelected
        ? new Set()
        : new Set(sortedWorkspaces.map((workspace) => workspace.id))
    )
  }

  function toggleOne(workspaceId: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(workspaceId)) {
        next.delete(workspaceId)
      } else {
        next.add(workspaceId)
      }
      return next
    })
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

  function openDeleteConfirm(targets: WorkspaceItem[]) {
    setError(null)
    setPendingDelete(targets)
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

  async function confirmDelete() {
    if (!pendingDelete?.length) return

    setBusy(true)
    setError(null)
    try {
      for (const workspace of pendingDelete) {
        await deleteWorkspace(workspace.id)
      }
      await router.invalidate()
      setSelected((current) => {
        const next = new Set(current)
        for (const workspace of pendingDelete) next.delete(workspace.id)
        return next
      })
      setPendingDelete(null)
    } catch (error) {
      setError(getWorkspaceErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="w-full">
      <DashboardTable
        title="Projects"
        icon={renderShellIcon(
          "briefcaseBusiness",
          "size-4 text-muted-foreground sm:size-[18px]"
        )}
        count={sortedWorkspaces.length}
        selectedCount={selectedWorkspaces.length}
        onClearSelection={() => setSelected(new Set())}
        controls={
          <>
            {selectedWorkspaces.length > 0 ? (
              <DashboardToolbarButton
                type="button"
                variant="destructive"
                disabled={busy || massDeleteBlocked}
                title={
                  massDeleteBlocked
                    ? "At least one workspace must remain"
                    : undefined
                }
                onClick={() => openDeleteConfirm(selectedWorkspaces)}
              >
                <Trash2Icon className="size-4" />
                Delete ({selectedWorkspaces.length})
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
                  checked={
                    allSelected
                      ? true
                      : selectedWorkspaces.length > 0
                        ? "indeterminate"
                        : false
                  }
                  onCheckedChange={toggleAll}
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
              <TableHead column="actions">Actions</TableHead>
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
            data-state={selected.has(workspace.id) ? "selected" : undefined}
          >
            <TableCell column="select">
              <Checkbox
                checked={selected.has(workspace.id)}
                onCheckedChange={() => toggleOne(workspace.id)}
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
                    className="block max-w-full truncate text-left font-medium hover:underline"
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
            <TableCell column="actions">
              <div className="flex items-center justify-end gap-1">
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
                  onClick={() => openDeleteConfirm([workspace])}
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
        onOpenChange={(open) => {
          if (busy) return
          setFormOpen(open)
        }}
        onSave={() => void saveWorkspace()}
      />

      <DeleteWorkspacesDialog
        workspaces={pendingDelete}
        deleting={busy}
        error={error}
        onOpenChange={(open) => {
          if (busy) return
          if (!open) setPendingDelete(null)
        }}
        onConfirm={() => void confirmDelete()}
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
      <DialogContent variant="admin" className="sm:max-w-lg">
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
              <CardTitle>Workspace details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="workspace-name">Name</Label>
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
                <Label htmlFor="workspace-icon">Icon</Label>
                <Select
                  value={form.icon}
                  disabled={saving}
                  onValueChange={(value) =>
                    onFormChange({ ...form, icon: value as IconKey })
                  }
                >
                  <SelectTrigger id="workspace-icon" className="w-full">
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

function DeleteWorkspacesDialog({
  workspaces,
  deleting,
  error,
  onOpenChange,
  onConfirm,
}: {
  workspaces: WorkspaceItem[] | null
  deleting: boolean
  error: string | null
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}) {
  const count = workspaces?.length ?? 0
  const label =
    count === 1
      ? (workspaces?.[0]?.name ?? "this workspace")
      : `${count} workspaces`

  return (
    <Dialog open={count > 0} onOpenChange={onOpenChange}>
      <DialogContent variant="admin" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {count === 1 ? "Delete Workspace" : "Delete Workspaces"}
          </DialogTitle>
          <DialogDescription>
            This deletes {count === 1 ? "the workspace" : "these workspaces"}.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <p className="text-sm">
            Delete <span className="font-medium">{label}</span>?
          </p>
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
              disabled={deleting}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleting}
              onClick={onConfirm}
            >
              {deleting ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <Trash2Icon className="size-4" />
              )}
              {count > 1 ? `Delete (${count})` : "Delete"}
            </Button>
          </>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
