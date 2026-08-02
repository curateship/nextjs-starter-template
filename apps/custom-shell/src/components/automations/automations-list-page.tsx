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
import {
  DashboardToolbarButton,
  DashboardToolbarSearch,
} from "@/components/shared/dashboard-toolbar"
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
import { formatDate } from "@/lib/format-time"
import { quoteOneLine } from "@/lib/quote-text"
import { useLastValue } from "@/lib/use-last-value"
import { useShellRuntime } from "@/components/shell/shell-layout"

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
  const [search, setSearch] = React.useState("")
  const [page, setPage] = React.useState(1)
  const { config } = useShellRuntime()
  const [pageSize, setPageSize] = React.useState(config.dashboardRowsPerPage)
  const [createOpen, setCreateOpen] = React.useState(false)
  const [createName, setCreateName] = React.useState("")
  const [creating, setCreating] = React.useState(false)
  const [duplicatingId, setDuplicatingId] = React.useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] =
    React.useState<AutomationListItem | null>(null)
  const [deleting, setDeleting] = React.useState(false)
  // The confirmation is still on screen while it fades out, after Cancel has
  // already cleared the target — so its heading reads the name it opened with.
  const closingDeleteTarget = useLastValue(deleteTarget)

  const toggleSort = (column: SortColumn) => {
    if (column === sort) {
      setDirection((current) => (current === "asc" ? "desc" : "asc"))
      return
    }
    setSort(column)
    setDirection("asc")
  }

  // The loader brings the whole list in one go, so finding and paging happen
  // here. If it ever grows past that, this wants a server parameter instead.
  const sorted = React.useMemo(() => {
    const factor = direction === "asc" ? 1 : -1
    const query = search.trim().toLowerCase()
    return automations
      .filter(
        (item) =>
          !query ||
          item.name.toLowerCase().includes(query) ||
          item.summary.toLowerCase().includes(query)
      )
      .sort((left, right) => {
        if (sort === "name") return factor * left.name.localeCompare(right.name)
        if (sort === "steps") return factor * (left.nodeCount - right.nodeCount)
        return factor * left.updated_at.localeCompare(right.updated_at)
      })
  }, [automations, direction, search, sort])

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const visible = React.useMemo(
    () => sorted.slice((page - 1) * pageSize, page * pageSize),
    [page, pageSize, sorted]
  )

  React.useEffect(() => {
    setPage(1)
  }, [search, sort, direction, pageSize])

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
        count={sorted.length}
        controls={
          <>
            <DashboardToolbarSearch
              name="automation-search"
              aria-label="Search automations"
              placeholder="Search automations…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <DashboardToolbarButton onClick={() => setCreateOpen(true)}>
              <PlusIcon className="size-4" />
              New automation
            </DashboardToolbarButton>
          </>
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
              <TableHead column="meta">Actions</TableHead>
            </TableRow>
          </TableHeader>
        }
        isEmpty={sorted.length === 0}
        emptyText={
          search.trim()
            ? "No automations match that search."
            : "No automations yet. Create the first one."
        }
        emptyColSpan={4}
        footer={{
          type: "pagination",
          page,
          pageSize,
          total: sorted.length,
          totalPages,
          onPageChange: (next) => setPage(Math.max(1, Math.min(next, totalPages))),
          onPageSizeChange: (next) => {
            setPage(1)
            setPageSize(next)
          },
        }}
      >
        {visible.map((automation) => (
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
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
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
                  size="icon"
                  aria-label={`Open ${automation.name} in the editor`}
                  onClick={() => void openEditor(automation.id)}
                >
                  <SettingsIcon className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
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
          <DialogFooter>
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
              Create automation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title={
          closingDeleteTarget
            ? `Delete ${quoteOneLine(closingDeleteTarget.name)}?`
            : "Delete this automation?"
        }
        description="The flow and its canvas are permanently removed. This cannot be undone."
        confirmLabel="Delete automation"
        loading={deleting}
        onConfirm={() => void handleDelete()}
      />
    </>
  )
}
