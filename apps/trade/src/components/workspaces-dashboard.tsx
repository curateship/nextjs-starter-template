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
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
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
  const [pendingDelete, setPendingDelete] =
    React.useState<WorkspaceItem | null>(null)
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const [massDeleteOpen, setMassDeleteOpen] = React.useState(false)
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

  function toggleSelection(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleVisibleSelection() {
    setSelectedIds((current) =>
      current.size === sortedWorkspaces.length
        ? new Set()
        : new Set(sortedWorkspaces.map((workspace) => workspace.id))
    )
  }

  // One workspace always has to survive, so the last one cannot be selected away.
  async function confirmMassDelete() {
    setBusy(true)
    setError(null)
    try {
      for (const id of selectedIds) {
        await deleteWorkspace(id)
      }
      await router.invalidate()
      setSelectedIds(new Set())
      setMassDeleteOpen(false)
    } catch (error) {
      setError(getWorkspaceErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return

    setBusy(true)
    setError(null)
    try {
      await deleteWorkspace(pendingDelete.id)
      await router.invalidate()
      setPendingDelete(null)
    } catch (error) {
      setError(getWorkspaceErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="w-full pb-8">
      {error ? <Message>{error}</Message> : null}

      <DashboardTable
        title="Projects"
        icon={renderShellIcon(
          "briefcaseBusiness",
          "size-4 text-muted-foreground sm:size-[18px]"
        )}
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
                    selectedIds.size === sortedWorkspaces.length &&
                    sortedWorkspaces.length > 0
                      ? true
                      : selectedIds.size
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
          type: "summary",
          count: sortedWorkspaces.length,
          label: "workspaces",
        }}
      >
        {sortedWorkspaces.map((workspace) => (
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

      <Dialog open={massDeleteOpen} onOpenChange={setMassDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Delete {selectedIds.size}{" "}
              {selectedIds.size === 1 ? "workspace" : "workspaces"}?
            </DialogTitle>
            <DialogDescription>
              Their settings and navigation are removed. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setMassDeleteOpen(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmMassDelete}
              disabled={busy}
            >
              {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
              Delete workspaces
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <WorkspaceFormDialog
        open={formOpen}
        editing={editing}
        form={form}
        saving={busy}
        onFormChange={setForm}
        onOpenChange={setFormOpen}
        onSave={() => void saveWorkspace()}
      />

      <DeleteWorkspaceDialog
        workspace={pendingDelete}
        deleting={busy}
        onOpenChange={(open) => {
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
  onFormChange,
  onOpenChange,
  onSave,
}: {
  open: boolean
  editing: WorkspaceItem | null
  form: WorkspaceForm
  saving: boolean
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
              <CardTitle>Workspace</CardTitle>
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

function DeleteWorkspaceDialog({
  workspace,
  deleting,
  onOpenChange,
  onConfirm,
}: {
  workspace: WorkspaceItem | null
  deleting: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}) {
  return (
    <Dialog open={Boolean(workspace)} onOpenChange={onOpenChange}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>Delete Workspace</DialogTitle>
          <DialogDescription>
            {workspace?.name ?? "This workspace"} and its settings are removed.
            This cannot be undone.
          </DialogDescription>
        </DialogHeader>
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
              Delete
            </Button>
          </>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Message({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {children}
    </div>
  )
}
