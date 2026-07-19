import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import {
  CopyIcon,
  Loader2Icon,
  PencilIcon,
  PlusIcon,
  SettingsIcon,
  Trash2Icon,
  WorkflowIcon,
} from "lucide-react"

import { CreateAutomationDialog } from "@/components/automations/create-automation-dialog"
import { AutomationSettingsDialog } from "@/components/automations/automation-settings-dialog"
import { DashboardTable } from "@/components/dashboard-table"
import {
  DashboardToolbarButton,
  DashboardToolbarSearch,
  DashboardToolbarSelectTrigger,
} from "@/components/dashboard-toolbar"
import { useShellRuntime } from "@/components/shell-layout"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSortButton,
  type TableSortDirection,
} from "@/components/ui/table"
import {
  deleteAutomation,
  duplicateAutomation,
  getAutomationErrorMessage,
  type AutomationDetail,
  type AutomationListItem,
} from "@/lib/api/automations"
import { normalizeAutomationType } from "@/lib/automations/automation-types"
import { DASHBOARD_ROWS_PER_PAGE_OPTIONS } from "@/lib/custom-shell"
import { useRowSelection } from "@/lib/use-row-selection"

type SortColumn = "name" | "type" | "interval" | "summary" | "updated"

const ALL_TYPES = "__all__"

const intervalOrder = ["1m", "5m", "15m", "1h", "4h", "1d"]
const pageSizeOptions = [...DASHBOARD_ROWS_PER_PAGE_OPTIONS]

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
})

export function AutomationsDashboard({
  initial,
}: {
  initial: AutomationListItem[]
}) {
  const navigate = useNavigate()
  const { config } = useShellRuntime()
  const [automations, setAutomations] = React.useState(initial)
  const [searchQuery, setSearchQuery] = React.useState("")
  const [typeFilter, setTypeFilter] = React.useState<string>(ALL_TYPES)
  const [sortColumn, setSortColumn] = React.useState<SortColumn>("updated")
  const [sortDirection, setSortDirection] =
    React.useState<TableSortDirection>("desc")
  const [currentPage, setCurrentPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(config.dashboardRowsPerPage)
  const [createOpen, setCreateOpen] = React.useState(false)
  const [settingsTarget, setSettingsTarget] =
    React.useState<AutomationListItem | null>(null)
  const [deleteTarget, setDeleteTarget] =
    React.useState<AutomationListItem | null>(null)
  const [massDeleteOpen, setMassDeleteOpen] = React.useState(false)
  const [massDeleting, setMassDeleting] = React.useState(false)
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  // The categories actually present, so the filter only offers real values.
  const typeOptions = React.useMemo(() => {
    const set = new Set<string>()
    for (const automation of automations) {
      set.add(normalizeAutomationType(automation.type))
    }
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [automations])

  const rows = React.useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    const direction = sortDirection === "asc" ? 1 : -1
    return automations
      .filter(
        (automation) =>
          typeFilter === ALL_TYPES ||
          normalizeAutomationType(automation.type) === typeFilter
      )
      .filter(
        (automation) =>
          !query ||
          automation.name.toLowerCase().includes(query) ||
          normalizeAutomationType(automation.type).toLowerCase().includes(query) ||
          automation.interval.toLowerCase().includes(query) ||
          automation.summary.toLowerCase().includes(query)
      )
      .sort((a, b) => {
      if (sortColumn === "name") return a.name.localeCompare(b.name) * direction
      if (sortColumn === "type") {
        return (
          normalizeAutomationType(a.type).localeCompare(
            normalizeAutomationType(b.type)
          ) * direction
        )
      }
      if (sortColumn === "interval") {
        return (
          (intervalOrder.indexOf(a.interval) -
            intervalOrder.indexOf(b.interval)) *
          direction
        )
      }
      if (sortColumn === "summary") {
        return a.summary.localeCompare(b.summary) * direction
      }
      return (Date.parse(a.updated_at) - Date.parse(b.updated_at)) * direction
      })
  }, [automations, searchQuery, typeFilter, sortColumn, sortDirection])

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize))
  const page = Math.min(currentPage, totalPages)
  const paginatedRows = rows.slice((page - 1) * pageSize, page * pageSize)
  const visibleIds = React.useMemo(
    () => paginatedRows.map((automation) => automation.id),
    [paginatedRows]
  )
  const selection = useRowSelection(visibleIds)

  const toggleSort = (column: SortColumn) => {
    setCurrentPage(1)
    if (column === sortColumn) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"))
    } else {
      setSortColumn(column)
      setSortDirection("asc")
    }
  }

  const openAutomation = (automationId: string) =>
    navigate({
      to: "/automations/$automationId",
      params: { automationId },
    })

  const duplicate = async (automation: AutomationListItem) => {
    setBusyId(automation.id)
    setError(null)
    try {
      const copy = await duplicateAutomation(automation.id)
      setAutomations((current) => [toListItem(copy), ...current])
    } catch (duplicateError) {
      setError(getAutomationErrorMessage(duplicateError))
    } finally {
      setBusyId(null)
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setBusyId(deleteTarget.id)
    setError(null)
    try {
      await deleteAutomation(deleteTarget.id)
      setAutomations((current) =>
        current.filter((automation) => automation.id !== deleteTarget.id)
      )
      selection.removeId(deleteTarget.id)
      setDeleteTarget(null)
    } catch (deleteError) {
      setError(getAutomationErrorMessage(deleteError))
    } finally {
      setBusyId(null)
    }
  }

  const confirmMassDelete = async () => {
    const ids = Array.from(selection.selectedIds)
    if (ids.length === 0) return
    setMassDeleting(true)
    setError(null)
    const results = await Promise.allSettled(ids.map(deleteAutomation))
    const deletedIds = new Set(
      ids.filter((_, index) => results[index]?.status === "fulfilled")
    )
    const failedIds = ids.filter((id) => !deletedIds.has(id))
    setAutomations((current) =>
      current.filter((automation) => !deletedIds.has(automation.id))
    )
    selection.setSelectedIds(new Set(failedIds))
    setMassDeleting(false)
    if (failedIds.length > 0) {
      setError(`${failedIds.length} Automation${failedIds.length === 1 ? "" : "s"} could not be deleted.`)
      return
    }
    setMassDeleteOpen(false)
  }

  return (
    <div className="w-full space-y-[var(--shell-gutter,0.75rem)]">
      {error ? (
        <div
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </div>
      ) : null}
      <DashboardTable
        title="Automations"
        icon={
          <WorkflowIcon className="size-4 text-muted-foreground sm:size-[18px]" />
        }
        count={automations.length}
        selectedCount={selection.selectedIds.size}
        onClearSelection={() => selection.setSelectedIds(new Set())}
        controls={
          <>
            {selection.selectedIds.size > 0 ? (
              <DashboardToolbarButton
                type="button"
                variant="outline"
                disabled={massDeleting}
                onClick={() => setMassDeleteOpen(true)}
              >
                {massDeleting ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <Trash2Icon className="size-4" />
                )}
                Delete ({selection.selectedIds.size})
              </DashboardToolbarButton>
            ) : null}
            <Select
              value={typeFilter}
              onValueChange={(value) => {
                setTypeFilter(value)
                setCurrentPage(1)
              }}
            >
              <DashboardToolbarSelectTrigger aria-label="Filter by type">
                <SelectValue />
              </DashboardToolbarSelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_TYPES}>All types</SelectItem>
                {typeOptions.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <DashboardToolbarSearch
              name="automation-search"
              aria-label="Search Automations"
              placeholder="Search Automations..."
              value={searchQuery}
              onChange={(event) => {
                setSearchQuery(event.target.value)
                setCurrentPage(1)
              }}
            />
            <DashboardToolbarButton
              type="button"
              onClick={() => setCreateOpen(true)}
            >
              <PlusIcon className="size-4" />
              Create Automation
            </DashboardToolbarButton>
          </>
        }
        footer={{
          type: "pagination",
          page,
          pageSize,
          total: rows.length,
          totalPages,
          pageSizeOptions,
          onPageChange: setCurrentPage,
          onPageSizeChange: (nextPageSize) => {
            setPageSize(nextPageSize)
            setCurrentPage(1)
          },
        }}
        header={
          <TableHeader>
            <TableRow>
              <TableHead column="select">
                <Checkbox
                  checked={
                    selection.visibleSelected
                      ? true
                      : selection.visiblePartiallySelected
                        ? "indeterminate"
                        : false
                  }
                  aria-label="Select visible Automations"
                  onCheckedChange={selection.toggleVisible}
                />
              </TableHead>
              <SortableHead
                label="Name"
                column="name"
                main
                active={sortColumn}
                direction={sortDirection}
                onSort={toggleSort}
              />
              <SortableHead
                label="Type"
                column="type"
                active={sortColumn}
                direction={sortDirection}
                onSort={toggleSort}
              />
              <SortableHead
                label="Timeframe"
                column="interval"
                active={sortColumn}
                direction={sortDirection}
                onSort={toggleSort}
              />
              <SortableHead
                label="Rules"
                column="summary"
                active={sortColumn}
                direction={sortDirection}
                onSort={toggleSort}
              />
              <SortableHead
                label="Updated"
                column="updated"
                active={sortColumn}
                direction={sortDirection}
                onSort={toggleSort}
              />
              <TableHead column="meta">Actions</TableHead>
            </TableRow>
          </TableHeader>
        }
        isEmpty={paginatedRows.length === 0}
        emptyText={
          searchQuery || typeFilter !== ALL_TYPES
            ? "No Automations match those filters."
            : "No automations yet. Create one to connect indicators into trading rules."
        }
        emptyColSpan={7}
      >
        {paginatedRows.map((automation) => (
          <TableRow key={automation.id}>
            <TableCell column="select">
              <Checkbox
                checked={selection.selectedIds.has(automation.id)}
                aria-label={`Select ${automation.name}`}
                onCheckedChange={() => selection.toggleRow(automation.id)}
              />
            </TableCell>
            <TableCell column="main">
              <button
                type="button"
                className="text-left"
                onClick={() => void openAutomation(automation.id)}
              >
                <span className="block font-medium hover:underline">
                  {automation.name}
                </span>
                <Badge
                  variant={automation.isValid ? "secondary" : "outline"}
                  className="mt-1 text-[10px]"
                >
                  {automation.isValid ? "Ready" : "Draft"}
                </Badge>
              </button>
            </TableCell>
            <TableCell column="meta">
              <Badge variant="outline" className="font-normal">
                {normalizeAutomationType(automation.type)}
              </Badge>
            </TableCell>
            <TableCell column="meta">{automation.interval}</TableCell>
            <TableCell column="mutedMeta">{automation.summary}</TableCell>
            <TableCell column="mutedMeta">
              {dateFormatter.format(new Date(automation.updated_at))}
            </TableCell>
            <TableCell column="meta">
              <div className="flex items-center gap-1">
                {busyId === automation.id ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Edit ${automation.name}`}
                      onClick={() => void openAutomation(automation.id)}
                    >
                      <PencilIcon className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Settings ${automation.name}`}
                      onClick={() => setSettingsTarget(automation)}
                    >
                      <SettingsIcon className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Duplicate ${automation.name}`}
                      onClick={() => void duplicate(automation)}
                    >
                      <CopyIcon className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Delete ${automation.name}`}
                      onClick={() => setDeleteTarget(automation)}
                    >
                      <Trash2Icon className="size-3.5" />
                    </Button>
                  </>
                )}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </DashboardTable>

      <CreateAutomationDialog
        open={createOpen}
        knownTypes={typeOptions}
        onOpenChange={setCreateOpen}
        onCreated={(automation) => void openAutomation(automation.id)}
      />

      <AutomationSettingsDialog
        target={settingsTarget}
        knownTypes={typeOptions}
        onOpenChange={(open) => {
          if (!open) setSettingsTarget(null)
        }}
        onSaved={(saved) => {
          setAutomations((current) =>
            current.map((automation) =>
              automation.id === saved.id ? toListItem(saved) : automation
            )
          )
          setSettingsTarget(null)
        }}
      />

      <Dialog
        open={massDeleteOpen}
        onOpenChange={(open) => {
          if (!massDeleting) setMassDeleteOpen(open)
        }}
      >
        <DialogContent variant="admin" className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete selected Automations</DialogTitle>
            <DialogDescription>
              Existing bots and backtests keep their saved copies.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <p className="text-sm">
              Delete {selection.selectedIds.size} selected Automation
              {selection.selectedIds.size === 1 ? "" : "s"}?
            </p>
          </DialogBody>
          <DialogFooter variant="plain">
            <Button
              type="button"
              variant="outline"
              disabled={massDeleting}
              onClick={() => setMassDeleteOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={massDeleting || selection.selectedIds.size === 0}
              onClick={() => void confirmMassDelete()}
            >
              {massDeleting ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <Trash2Icon className="size-4" />
              )}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && !busyId) setDeleteTarget(null)
        }}
      >
        <DialogContent variant="admin" className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Automation</DialogTitle>
            <DialogDescription>
              Existing bots and backtests keep their saved copy of these rules.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <p className="text-sm">
              Delete <span className="font-medium">{deleteTarget?.name}</span>?
            </p>
          </DialogBody>
          <DialogFooter variant="plain">
            <Button
              type="button"
              variant="outline"
              disabled={Boolean(busyId)}
              onClick={() => setDeleteTarget(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={Boolean(busyId)}
              onClick={() => void confirmDelete()}
            >
              {busyId ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <Trash2Icon className="size-4" />
              )}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function SortableHead({
  label,
  column,
  main = false,
  active,
  direction,
  onSort,
}: {
  label: string
  column: SortColumn
  main?: boolean
  active: SortColumn
  direction: TableSortDirection
  onSort: (column: SortColumn) => void
}) {
  return (
    <TableHead column={main ? "main" : "meta"}>
      <TableSortButton
        active={active === column}
        direction={direction}
        onClick={() => onSort(column)}
      >
        {label}
      </TableSortButton>
    </TableHead>
  )
}

function toListItem(automation: AutomationDetail): AutomationListItem {
  const rules = automation.compiledConfig?.rules.length ?? 0
  return {
    id: automation.id,
    name: automation.name,
    type: automation.type,
    interval: automation.interval,
    isValid:
      automation.compiledConfig !== null && automation.errors.length === 0,
    summary:
      automation.compiledConfig !== null
        ? `${rules} action ${rules === 1 ? "rule" : "rules"}`
        : automation.graph.nodes.length === 0
          ? "Empty draft"
          : "Needs attention",
    updated_at: automation.updated_at,
  }
}
