import * as React from "react"
import { Link, useNavigate } from "@tanstack/react-router"
import {
  CopyIcon,
  Loader2Icon,
  PlusIcon,
  SettingsIcon,
  Trash2Icon,
  WorkflowIcon,
} from "lucide-react"
import { toast } from "sonner"

import { DashboardTable } from "@/components/shared/dashboard-table"
import { DashboardToolbarButton } from "@/components/shared/dashboard-toolbar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSortButton,
  type TableSortDirection,
} from "@/components/ui/table"
import {
  createAutomation,
  deleteAutomation,
  duplicateAutomation,
  getAutomationErrorMessage,
  toAutomationListItem,
  type AutomationListItem,
  type AutomationsPage,
} from "@/lib/api/automations"
import { dismissErrorToast, showErrorToast } from "@/lib/error-toast"
import { formatDate } from "@/lib/money"

type SortColumn = "name" | "steps" | "updated"

/**
 * The flows list: open, create, duplicate, delete. Deliberately small — the
 * automations-dashboard task rebuilds this page with run history, enable/pause,
 * and the full toolbar once the engine exists.
 */
export function AutomationsListPage({ initial }: { initial: AutomationsPage }) {
  const navigate = useNavigate()
  const [automations, setAutomations] = React.useState(initial.automations)
  const [sort, setSort] = React.useState<SortColumn>("updated")
  const [direction, setDirection] = React.useState<TableSortDirection>("desc")
  const [createOpen, setCreateOpen] = React.useState(false)
  const [createName, setCreateName] = React.useState("")
  const [creating, setCreating] = React.useState(false)
  const [duplicatingId, setDuplicatingId] = React.useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] =
    React.useState<AutomationListItem | null>(null)
  const [deleting, setDeleting] = React.useState(false)

  const toggleSort = (column: SortColumn) => {
    if (column === sort) {
      setDirection((current) => (current === "asc" ? "desc" : "asc"))
      return
    }
    setSort(column)
    setDirection("asc")
  }

  const sorted = React.useMemo(() => {
    const factor = direction === "asc" ? 1 : -1
    return [...automations].sort((left, right) => {
      if (sort === "name") return factor * left.name.localeCompare(right.name)
      if (sort === "steps") return factor * (left.nodeCount - right.nodeCount)
      return factor * left.updated_at.localeCompare(right.updated_at)
    })
  }, [automations, direction, sort])

  const openEditor = (automationId: string) =>
    navigate({
      to: "/admin/automations/$automationId",
      params: { automationId },
    })

  const handleCreate = async () => {
    if (creating || !createName.trim()) return
    setCreating(true)
    try {
      const created = await createAutomation(createName)
      dismissErrorToast()
      toast.success(`Created "${created.name}".`)
      setCreateOpen(false)
      setCreateName("")
      await openEditor(created.id)
    } catch (error) {
      showErrorToast(getAutomationErrorMessage(error))
    } finally {
      setCreating(false)
    }
  }

  const handleDuplicate = async (automation: AutomationListItem) => {
    if (duplicatingId) return
    setDuplicatingId(automation.id)
    try {
      const copy = await duplicateAutomation(automation.id)
      dismissErrorToast()
      setAutomations((current) => [toAutomationListItem(copy), ...current])
      toast.success(`Duplicated as "${copy.name}".`)
    } catch (error) {
      showErrorToast(getAutomationErrorMessage(error))
    } finally {
      setDuplicatingId(null)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget || deleting) return
    setDeleting(true)
    try {
      await deleteAutomation(deleteTarget.id)
      dismissErrorToast()
      setAutomations((current) =>
        current.filter((item) => item.id !== deleteTarget.id)
      )
      toast.success(`Deleted "${deleteTarget.name}".`)
      setDeleteTarget(null)
    } catch (error) {
      showErrorToast(getAutomationErrorMessage(error))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <DashboardTable
        title="Automations"
        icon={<WorkflowIcon />}
        count={automations.length}
        controls={
          <DashboardToolbarButton onClick={() => setCreateOpen(true)}>
            <PlusIcon className="size-4" />
            New automation
          </DashboardToolbarButton>
        }
        header={
          <TableHeader>
            <TableRow>
              <TableHead column="main">
                <TableSortButton
                  active={sort === "name"}
                  direction={direction}
                  onClick={() => toggleSort("name")}
                >
                  Name
                </TableSortButton>
              </TableHead>
              <TableHead column="meta">
                <TableSortButton
                  active={sort === "steps"}
                  direction={direction}
                  onClick={() => toggleSort("steps")}
                >
                  Status
                </TableSortButton>
              </TableHead>
              <TableHead column="meta">
                <TableSortButton
                  active={sort === "updated"}
                  direction={direction}
                  onClick={() => toggleSort("updated")}
                >
                  Updated
                </TableSortButton>
              </TableHead>
              <TableHead column="meta">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
        }
        isEmpty={automations.length === 0}
        emptyText="No automations yet. Create the first one."
        emptyColSpan={4}
        footer={{ type: "summary", count: automations.length, label: "automations" }}
      >
        {sorted.map((automation) => (
          <TableRow key={automation.id}>
            <TableCell column="main">
              <Link
                to="/admin/automations/$automationId"
                params={{ automationId: automation.id }}
                className="block max-w-96 truncate text-left font-medium underline-offset-2 hover:underline"
                title={automation.name}
              >
                {automation.name}
              </Link>
            </TableCell>
            <TableCell column="meta">
              <Badge variant={automation.isValid ? "secondary" : "outline"}>
                {automation.summary}
              </Badge>
            </TableCell>
            <TableCell column="mutedMeta">
              {formatDate(automation.updated_at)}
            </TableCell>
            <TableCell column="meta">
              <div className="flex items-center justify-end gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Duplicate ${automation.name}`}
                  disabled={duplicatingId !== null}
                  onClick={() => void handleDuplicate(automation)}
                >
                  {duplicatingId === automation.id ? (
                    <Loader2Icon className="size-4 animate-spin" />
                  ) : (
                    <CopyIcon className="size-4" />
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Open ${automation.name} in the editor`}
                  onClick={() => void openEditor(automation.id)}
                >
                  <SettingsIcon className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Delete ${automation.name}`}
                  onClick={() => setDeleteTarget(automation)}
                >
                  <Trash2Icon className="size-4" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </DashboardTable>

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          if (!open && creating) return
          setCreateOpen(open)
        }}
      >
        <DialogContent variant="admin" className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New automation</DialogTitle>
            <DialogDescription>
              Name it, then build the flow on the canvas.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Card size="sm">
              <CardContent className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="automation-name">Name</Label>
                  <Input
                    id="automation-name"
                    value={createName}
                    maxLength={80}
                    autoFocus
                    placeholder="Weekly changelog email"
                    onChange={(event) => setCreateName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault()
                        void handleCreate()
                      }
                    }}
                  />
                </div>
              </CardContent>
            </Card>
          </DialogBody>
          <DialogFooter variant="plain">
            <Button
              type="button"
              variant="outline"
              disabled={creating}
              onClick={() => setCreateOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={creating || !createName.trim()}
              onClick={() => void handleCreate()}
            >
              {creating ? <Loader2Icon className="size-4 animate-spin" /> : null}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title={`Delete "${deleteTarget?.name}"?`}
        description="The flow and its canvas are permanently removed. This cannot be undone."
        confirmLabel="Delete"
        loading={deleting}
        onConfirm={() => void handleDelete()}
      />
    </>
  )
}
