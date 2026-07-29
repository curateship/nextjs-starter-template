import * as React from "react"
import { Link, useNavigate } from "@tanstack/react-router"
import {
  Loader2Icon,
  PlusIcon,
  ShieldCheckIcon,
  Trash2Icon,
  WorkflowIcon,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { DashboardNotices } from "@/components/dashboard-notices"
import { DashboardTable } from "@/components/dashboard-table"
import {
  DashboardToolbarButton,
  DashboardToolbarSearch,
} from "@/components/dashboard-toolbar"
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog"
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
import { Switch } from "@/components/ui/switch"
import {
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSortButton,
} from "@/components/ui/table"
import {
  createAutomation,
  deleteAutomations,
  getAutomationErrorMessage,
  listAutomations,
  setAutomationEnabled,
  type AutomationListItem,
  type AutomationRunStatus,
} from "@/lib/api/automations"
import { dateFormatter, pageSizeOptions } from "@/lib/dashboard-format"
import { useBulkDelete } from "@/lib/use-bulk-delete"
import { useSelection } from "@/lib/use-selection"
import { useTableSort } from "@/lib/use-table-sort"

type AutomationSortColumn =
  | "name"
  | "trigger"
  | "enabled"
  | "lastRun"
  | "nextRun"
  | "updated"

const RUN_STATUS_LABELS: Record<AutomationRunStatus, string> = {
  queued: "Queued",
  running: "Running",
  waiting_approval: "Needs approval",
  completed: "Completed",
  failed: "Failed",
  canceled: "Canceled",
}

function RunStatusBadge({ status }: { status: AutomationRunStatus | null }) {
  if (!status) {
    return <span className="text-xs text-muted-foreground">Never ran</span>
  }
  return (
    <Badge
      variant="outline"
      className={
        status === "failed"
          ? "border-destructive/40 text-destructive"
          : status === "completed"
            ? "border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
            : status === "waiting_approval"
              ? "border-amber-500/40 text-amber-600 dark:text-amber-400"
              : undefined
      }
    >
      {status === "running" ? (
        <Loader2Icon className="size-3 animate-spin" />
      ) : status === "waiting_approval" ? (
        <ShieldCheckIcon className="size-3" />
      ) : null}
      {RUN_STATUS_LABELS[status]}
    </Badge>
  )
}

// Automations list: rows open the canvas editor; the enabled switch controls
// the schedule + creator-posted triggers (manual Run always works).
export function AutomationsDashboard() {
  const navigate = useNavigate()
  const [automations, setAutomations] = React.useState<AutomationListItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [searchQuery, setSearchQuery] = React.useState("")
  const [currentPage, setCurrentPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(pageSizeOptions[1])
  const [createOpen, setCreateOpen] = React.useState(false)
  const [newName, setNewName] = React.useState("")
  const [creating, setCreating] = React.useState(false)
  const [createError, setCreateError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let active = true
    listAutomations()
      .then((data) => {
        if (!active) return
        setAutomations(data.automations)
      })
      .catch((loadError) => {
        if (!active) return
        setError(getAutomationErrorMessage(loadError))
      })
      .finally(() => {
        if (!active) return
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const { sortColumn, sortDirection, toggleSort } =
    useTableSort<AutomationSortColumn>("updated", "desc")

  const filteredAutomations = React.useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return automations
    return automations.filter((automation) =>
      automation.name.toLowerCase().includes(query)
    )
  }, [automations, searchQuery])

  const sortedAutomations = React.useMemo(() => {
    const dir = sortDirection === "asc" ? 1 : -1
    const ts = (value: string | null) => (value ? new Date(value).getTime() : 0)
    return filteredAutomations.slice().sort((a, b) => {
      if (sortColumn === "name") return a.name.localeCompare(b.name) * dir
      if (sortColumn === "trigger")
        return a.schedule_summary.localeCompare(b.schedule_summary) * dir
      if (sortColumn === "enabled")
        return (Number(a.enabled) - Number(b.enabled)) * dir
      if (sortColumn === "lastRun")
        return (ts(a.last_run_at) - ts(b.last_run_at)) * dir
      if (sortColumn === "nextRun")
        return (ts(a.next_run_at) - ts(b.next_run_at)) * dir
      return (ts(a.updated_at) - ts(b.updated_at)) * dir
    })
  }, [filteredAutomations, sortColumn, sortDirection])

  const totalPages = Math.ceil(sortedAutomations.length / pageSize)
  const paginatedAutomations = React.useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return sortedAutomations.slice(start, start + pageSize)
  }, [currentPage, sortedAutomations, pageSize])

  function updateSearch(value: string) {
    setSearchQuery(value)
    setCurrentPage(1)
  }
  function changePageSize(size: number) {
    setPageSize(size)
    setCurrentPage(1)
  }
  function goToPage(page: number) {
    setCurrentPage(Math.max(1, Math.min(page, totalPages || 1)))
  }
  function handleCreateOpenChange(open: boolean) {
    if (creating) return
    setCreateOpen(open)
    if (!open) {
      setNewName("")
      setCreateError(null)
    }
  }

  const visibleIds = paginatedAutomations.map((automation) => automation.id)
  const {
    selectedIds,
    toggleSelected,
    selectAllState,
    toggleVisibleSelected,
    clearSelection,
  } = useSelection(visibleIds)

  // Optimistic enabled toggle; reverts on failure.
  async function handleToggleEnabled(automationId: string, enabled: boolean) {
    setAutomations((current) =>
      current.map((automation) =>
        automation.id === automationId ? { ...automation, enabled } : automation
      )
    )
    try {
      const saved = await setAutomationEnabled(automationId, enabled)
      setAutomations((current) =>
        current.map((automation) =>
          automation.id === automationId
            ? {
                ...automation,
                enabled: saved.enabled,
                next_run_at: saved.next_run_at,
              }
            : automation
        )
      )
    } catch (toggleError) {
      setAutomations((current) =>
        current.map((automation) =>
          automation.id === automationId
            ? { ...automation, enabled: !enabled }
            : automation
        )
      )
      toast.error(getAutomationErrorMessage(toggleError))
    }
  }

  async function handleCreateSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmedName = newName.trim()
    if (!trimmedName) {
      setCreateError("Automation name is required.")
      return
    }

    setCreating(true)
    setCreateError(null)
    try {
      const { automationId } = await createAutomation(trimmedName)
      await navigate({
        to: "/admin/automations/$automationId",
        params: { automationId },
      })
    } catch (submitError) {
      setCreateError(getAutomationErrorMessage(submitError))
      setCreating(false)
    }
  }

  const { deleteIds, setDeleteIds, deleting, confirmDelete } = useBulkDelete({
    noun: "automation",
    deleteMany: deleteAutomations,
    setItems: setAutomations,
    clearSelection,
    formatError: getAutomationErrorMessage,
  })

  const controls = (
    <>
      {selectedIds.size > 0 ? (
        <DashboardToolbarButton
          type="button"
          variant="destructive"
          onClick={() => setDeleteIds(Array.from(selectedIds))}
        >
          <Trash2Icon className="size-4" />
          Delete {selectedIds.size}
        </DashboardToolbarButton>
      ) : null}
      <DashboardToolbarSearch
        name="automation-search"
        aria-label="Search automations"
        placeholder="Search automations..."
        value={searchQuery}
        onChange={(event) => updateSearch(event.target.value)}
      />
      <DashboardToolbarButton
        type="button"
        onClick={() => handleCreateOpenChange(true)}
      >
        <PlusIcon className="size-4" />
        New Automation
      </DashboardToolbarButton>
    </>
  )

  return (
    <div className="w-full pb-8">
      <DashboardNotices error={error} />

      <DashboardTable
        title="Automations"
        icon={
          <WorkflowIcon className="size-4 text-muted-foreground sm:size-[18px]" />
        }
        count={filteredAutomations.length}
        controls={controls}
        selectedCount={selectedIds.size}
        onClearSelection={() => clearSelection()}
        header={
          <TableHeader>
            <TableRow>
              <TableHead column="select">
                <Checkbox
                  checked={selectAllState}
                  onCheckedChange={toggleVisibleSelected}
                  aria-label="Select visible automations"
                />
              </TableHead>
              <TableHead column="main">
                <TableSortButton
                  active={sortColumn === "name"}
                  direction={sortDirection}
                  onClick={() => toggleSort("name")}
                >
                  Automation
                </TableSortButton>
              </TableHead>
              <TableHead column="meta">
                <TableSortButton
                  active={sortColumn === "trigger"}
                  direction={sortDirection}
                  onClick={() => toggleSort("trigger")}
                >
                  Trigger
                </TableSortButton>
              </TableHead>
              <TableHead column="meta">
                <TableSortButton
                  active={sortColumn === "enabled"}
                  direction={sortDirection}
                  onClick={() => toggleSort("enabled")}
                >
                  Enabled
                </TableSortButton>
              </TableHead>
              <TableHead column="meta">
                <TableSortButton
                  active={sortColumn === "lastRun"}
                  direction={sortDirection}
                  onClick={() => toggleSort("lastRun")}
                >
                  Last run
                </TableSortButton>
              </TableHead>
              <TableHead column="meta" className="hidden lg:table-cell">
                <TableSortButton
                  active={sortColumn === "nextRun"}
                  direction={sortDirection}
                  onClick={() => toggleSort("nextRun")}
                >
                  Next run
                </TableSortButton>
              </TableHead>
              <TableHead column="meta" className="hidden lg:table-cell">
                <TableSortButton
                  active={sortColumn === "updated"}
                  direction={sortDirection}
                  onClick={() => toggleSort("updated")}
                >
                  Updated
                </TableSortButton>
              </TableHead>
              <TableHead column="meta">Actions</TableHead>
            </TableRow>
          </TableHeader>
        }
        isEmpty={!loading && paginatedAutomations.length === 0}
        emptyText="No automations yet. Create one to chain pipeline steps into a runnable workflow."
        emptyColSpan={8}
        footer={{
          type: "pagination",
          page: currentPage,
          pageSize,
          total: filteredAutomations.length,
          totalPages,
          pageSizeOptions,
          onPageChange: goToPage,
          onPageSizeChange: changePageSize,
        }}
      >
        {paginatedAutomations.map((automation) => (
          <AutomationTableRow
            key={automation.id}
            automation={automation}
            selected={selectedIds.has(automation.id)}
            onToggle={() => toggleSelected(automation.id)}
            onToggleEnabled={(enabled) =>
              handleToggleEnabled(automation.id, enabled)
            }
            onDelete={() => setDeleteIds([automation.id])}
          />
        ))}
      </DashboardTable>

      <Dialog open={createOpen} onOpenChange={handleCreateOpenChange}>
        <DialogContent
          variant="admin"
          className="sm:max-w-md"
          showCloseButton={!creating}
        >
          <DialogHeader>
            <DialogTitle>New Automation</DialogTitle>
            <DialogDescription>
              Name your automation, then build its steps in the canvas editor.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Card size="sm">
              <CardHeader>
                <CardTitle>Automation</CardTitle>
              </CardHeader>
              <CardContent>
                <form
                  id="create-automation-form"
                  className="grid gap-2"
                  onSubmit={handleCreateSubmit}
                >
                  <FieldLabel htmlFor="automation-name">Name</FieldLabel>
                  <Input
                    id="automation-name"
                    value={newName}
                    onChange={(event) => {
                      setNewName(event.target.value)
                      if (createError) setCreateError(null)
                    }}
                    placeholder="Study viral reels"
                    maxLength={120}
                    aria-invalid={createError ? true : undefined}
                    aria-describedby={
                      createError ? "automation-name-error" : undefined
                    }
                    disabled={creating}
                    autoFocus
                  />
                </form>
              </CardContent>
            </Card>
            {createError ? (
              <p
                id="automation-name-error"
                role="alert"
                className="text-sm text-destructive"
              >
                {createError}
              </p>
            ) : null}
          </DialogBody>
          <DialogFooter variant="plain">
            <Button
              type="button"
              variant="outline"
              disabled={creating}
              onClick={() => handleCreateOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="create-automation-form"
              disabled={creating}
            >
              {creating ? <Loader2Icon className="size-4 animate-spin" /> : null}
              {creating ? "Creating" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        ids={deleteIds}
        noun="Automation"
        description={(count) =>
          `This removes ${count === 1 ? "the automation" : "these automations"} and ${count === 1 ? "its" : "their"} run history. Videos, templates, and projects the runs created are kept. This action cannot be undone.`
        }
        deleting={deleting}
        onClose={() => setDeleteIds(null)}
        onConfirm={confirmDelete}
      />
    </div>
  )
}

function AutomationTableRow({
  automation,
  selected,
  onToggle,
  onToggleEnabled,
  onDelete,
}: {
  automation: AutomationListItem
  selected: boolean
  onToggle: () => void
  onToggleEnabled: (enabled: boolean) => void
  onDelete: () => void
}) {
  return (
    <TableRow className="group" data-state={selected ? "selected" : undefined}>
      <TableCell column="select">
        <Checkbox
          checked={selected}
          onCheckedChange={onToggle}
          aria-label={`Select ${automation.name}`}
        />
      </TableCell>
      <TableCell column="main">
        <Link
          to="/admin/automations/$automationId"
          params={{ automationId: automation.id }}
          className="flex min-w-0 flex-col"
        >
          <span className="block max-w-full truncate font-medium group-hover:underline">
            {automation.name}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {automation.node_count}{" "}
            {automation.node_count === 1 ? "node" : "nodes"}
          </span>
        </Link>
      </TableCell>
      <TableCell column="mutedMeta">{automation.schedule_summary}</TableCell>
      <TableCell column="meta">
        <Switch
          checked={automation.enabled}
          onCheckedChange={onToggleEnabled}
          aria-label={`Enable ${automation.name}`}
        />
      </TableCell>
      <TableCell column="meta">
        <div className="flex flex-col gap-0.5">
          <RunStatusBadge status={automation.last_run_status} />
          {automation.last_run_at ? (
            <span className="text-[10px] text-muted-foreground">
              {dateFormatter.format(new Date(automation.last_run_at))}
            </span>
          ) : null}
        </div>
      </TableCell>
      <TableCell column="mutedMeta" className="hidden lg:table-cell">
        {automation.next_run_at
          ? dateFormatter.format(new Date(automation.next_run_at))
          : "—"}
      </TableCell>
      <TableCell column="mutedMeta" className="hidden lg:table-cell">
        {dateFormatter.format(new Date(automation.updated_at))}
      </TableCell>
      <TableCell column="meta">
        <div className="flex justify-start gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onDelete}
            aria-label={`Delete ${automation.name}`}
          >
            <Trash2Icon className="size-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}
