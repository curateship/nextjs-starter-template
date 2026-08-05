import * as React from "react"
import { Link, useNavigate } from "@tanstack/react-router"
import {
  CopyIcon,
  Loader2Icon,
  PauseIcon,
  PlayIcon,
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
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DisabledReason } from "@/components/ui/disabled-reason"
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
} from "@/components/ui/table"
import {
  getAutomationRunErrorMessage,
  runAutomationNow,
} from "@/lib/api/automation-runs"
import {
  createAutomation,
  deleteAutomations,
  duplicateAutomation,
  getAutomationErrorMessage,
  toAutomationListItem,
  type AutomationListItem,
  type AutomationsPage,
} from "@/lib/api/automations"
import { dismissErrorToast, showErrorToast } from "@/lib/error-toast"
import { useAsyncAction } from "@/lib/use-async-action"
import { formatDate } from "@/lib/format-time"
import { quoteOneLine } from "@/lib/quote-text"
import { useClearSelectionOnListChange } from "@/lib/use-clear-selection"
import { useClientPage } from "@/lib/use-client-page"
import { useLastValue } from "@/lib/use-last-value"
import { useSelection } from "@/lib/use-selection"
import { useTableSort } from "@/lib/use-table-sort"
import { useShellRuntime } from "@/components/shell/shell-layout"

type SortColumn = "name" | "status" | "updated"

/**
 * The flows list: open, create, duplicate, delete. Deliberately small — the
 * automations-dashboard task rebuilds this page with run history, enable/pause,
 * and the full toolbar once the engine exists.
 */
export function AutomationsListPage({ initial }: { initial: AutomationsPage }) {
  const navigate = useNavigate()
  const [automations, setAutomations] = React.useState(initial.automations)
  const { sort, direction, toggleSort } = useTableSort<SortColumn>("updated", "desc", (column) => column === "updated" ? "desc" : "asc")
  const [search, setSearch] = React.useState("")
  const { config, automationPauseBusy, onAutomationPauseChange } =
    useShellRuntime()
  const [confirmPauseOpen, setConfirmPauseOpen] = React.useState(false)
  const [createOpen, setCreateOpen] = React.useState(false)
  const [createName, setCreateName] = React.useState("")
  const [runCreate, creating] = useAsyncAction(getAutomationErrorMessage)
  const [duplicatingId, setDuplicatingId] = React.useState<string | null>(null)
  const [runningId, setRunningId] = React.useState<string | null>(null)
  const [deleteTargets, setDeleteTargets] = React.useState<
    AutomationListItem[] | null
  >(null)
  const [runDelete, deleting] = useAsyncAction(getAutomationErrorMessage)
  const selection = useSelection()
  const selectedIds = selection.selected
  // The confirmation is still on screen while it fades out, after Cancel has
  // already cleared the targets — so its heading reads the names it opened with.
  const closingDeleteTargets = useLastValue(deleteTargets)

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
        if (sort === "status") return factor * left.summary.localeCompare(right.summary)
        return factor * left.updated_at.localeCompare(right.updated_at)
      })
  }, [automations, direction, search, sort])

  // Paging, and the jump back to page 1 when the search or sort changes. The
  // shared helper does that adjustment while drawing rather than in an effect,
  // which is what stops the list drawing once on the old page and again on the
  // new one.
  const { page, pageSize, visible, footer } = useClientPage(
    sorted,
    config.dashboardRowsPerPage,
    `${search}|${sort}|${direction}`
  )

  useClearSelectionOnListChange(
    selection.setSelected,
    `${search}|${sort}|${direction}|${page}|${pageSize}`
  )

  const visibleIds = React.useMemo(
    () => visible.map((automation) => automation.id),
    [visible]
  )

  const selectedAutomations = React.useMemo(
    () => automations.filter((automation) => selectedIds.has(automation.id)),
    [automations, selectedIds]
  )

  const openEditor = (automationId: string) =>
    navigate({
      to: "/admin/automations/$automationId",
      params: { automationId },
    })

  const handleCreate = async () => {
    if (creating || !createName.trim()) return
    await runCreate(async () => {
      const created = await createAutomation(createName)
      toast.success(`Created "${created.name}".`)
      setCreateOpen(false)
      setCreateName("")
      await openEditor(created.id)
    })
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

  /**
   * Sets a flow going and opens the flow with that run already showing in the
   * panel under the canvas. The server walks the flow once before answering, so
   * a run that stopped at an approval checkpoint is already sitting there
   * waiting by the time the editor paints.
   */
  const handleRunNow = async (automation: AutomationListItem) => {
    if (runningId) return
    setRunningId(automation.id)
    try {
      const { runId } = await runAutomationNow(automation.id)
      dismissErrorToast()
      toast.success(`Started "${automation.name}".`)
      await navigate({
        to: "/admin/automations/$automationId",
        params: { automationId: automation.id },
        search: { run: runId },
      })
    } catch (error) {
      showErrorToast(getAutomationRunErrorMessage(error))
    } finally {
      setRunningId(null)
    }
  }

  /**
   * The kill switch. Pausing asks first, because it stops everything at once;
   * resuming does not, because it is the way back out of a mistake and putting
   * a question in front of it is the last thing anybody wants at that moment.
   */
  const handlePauseChange = async (enabled: boolean) => {
    if (automationPauseBusy) return
    // The toast says how many runs were caught mid-flight; nothing on this page
    // needs the number, so the answer is only checked for having worked.
    if (await onAutomationPauseChange(enabled)) setConfirmPauseOpen(false)
  }

  const handleDelete = async () => {
    if (!deleteTargets?.length || deleting) return
    await runDelete(async () => {
      const ids = new Set(deleteTargets.map((item) => item.id))
      await deleteAutomations([...ids])
      setAutomations((current) => current.filter((item) => !ids.has(item.id)))
      toast.success(
        deleteTargets.length === 1 && deleteTargets[0]
          ? `Deleted "${deleteTargets[0].name}".`
          : `Deleted ${deleteTargets.length} automations.`
      )
      selection.clear()
      setDeleteTargets(null)
    })
  }

  // One copy of the switch, shared with the header badge, which is the only
  // place that says "everything is stopped" — this page just offers the toggle.
  const paused = config.automationPause.enabled

  return (
    <>
      <DashboardTable
        title="Automations"
        icon={<WorkflowIcon />}
        count={sorted.length}
        selectedCount={selectedIds.size}
        onClearSelection={selection.clear}
        controls={
          <>
            {selectedIds.size ? (
              <DashboardToolbarButton
                type="button"
                variant="destructive"
                onClick={() => setDeleteTargets(selectedAutomations)}
                disabled={deleting}
              >
                <Trash2Icon className="size-4" />
                Delete ({selectedIds.size})
              </DashboardToolbarButton>
            ) : null}
            <DashboardToolbarSearch
              name="automation-search"
              aria-label="Search automations"
              placeholder="Search automations…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <DashboardToolbarButton
              variant="outline"
              disabled={automationPauseBusy}
              onClick={() =>
                paused ? void handlePauseChange(false) : setConfirmPauseOpen(true)
              }
            >
              {automationPauseBusy ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : paused ? (
                <PlayIcon className="size-4" />
              ) : (
                <PauseIcon className="size-4" />
              )}
              {paused ? "Resume all" : "Pause all"}
            </DashboardToolbarButton>
            <DashboardToolbarButton onClick={() => setCreateOpen(true)}>
              <PlusIcon className="size-4" />
              New automation
            </DashboardToolbarButton>
          </>
        }
        header={
          <TableHeader>
            <TableRow>
              <TableHead column="select">
                <Checkbox
                  checked={selection.selectAllState(visibleIds)}
                  onCheckedChange={() => selection.toggleVisible(visibleIds)}
                  aria-label="Select automations on this page"
                />
              </TableHead>
              <TableHead column="main">
                <TableSortButton
                  active={sort === "name"}
                  direction={direction}
                  onClick={() => toggleSort("name")}
                >
                  Name
                </TableSortButton>
              </TableHead>
              <TableHead column="meta" className="hidden sm:table-cell">
                <TableSortButton
                  active={sort === "status"}
                  direction={direction}
                onClick={() => toggleSort("status")}
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
        emptyColSpan={5}
        footer={footer}
      >
        {visible.map((automation) => (
          <TableRow
            key={automation.id}
            className="group"
            rowAction={() => void openEditor(automation.id)}
          >
            <TableCell column="select">
              <Checkbox
                checked={selectedIds.has(automation.id)}
                onCheckedChange={() => selection.toggle(automation.id)}
                aria-label={`Select ${automation.name}`}
              />
            </TableCell>
            <TableCell column="main">
              <Link
                to="/admin/automations/$automationId"
                params={{ automationId: automation.id }}
                className="block max-w-96 truncate text-left font-medium underline-offset-2 group-hover:underline"
                title={automation.name}
              >
                {automation.name}
              </Link>
            </TableCell>
            <TableCell column="meta" className="hidden sm:table-cell">
              <Badge variant={automation.isValid ? "secondary" : "outline"}>
                {automation.summary}
              </Badge>
            </TableCell>
            <TableCell column="mutedMeta" className="hidden md:table-cell">
              {formatDate(automation.updated_at)}
            </TableCell>
            <TableCell column="actions">
              <div className="flex items-center gap-1">
                <DisabledReason
                  disabled={paused || !automation.isValid}
                  reason={
                    paused
                      ? "Every automation is paused. Resume them to start this flow."
                      : "This flow has something to fix before it can run. Open it and check the steps marked in red."
                  }
                >
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={paused || !automation.isValid || runningId !== null}
                    aria-label={`Run ${automation.name} now`}
                    onClick={() => void handleRunNow(automation)}
                  >
                    {runningId === automation.id ? (
                      <Loader2Icon className="size-4 animate-spin" />
                    ) : (
                      <PlayIcon className="size-4" />
                    )}
                  </Button>
                </DisabledReason>
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
                  onClick={() => setDeleteTargets([automation])}
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
        open={deleteTargets !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTargets(null)
        }}
        title={
          closingDeleteTargets && closingDeleteTargets.length > 1
            ? `Delete ${closingDeleteTargets.length} automations?`
            : closingDeleteTargets?.[0]
              ? `Delete ${quoteOneLine(closingDeleteTargets[0].name)}?`
              : "Delete this automation?"
        }
        description={
          closingDeleteTargets && closingDeleteTargets.length > 1
            ? "The flows and their canvases are permanently removed. This cannot be undone."
            : "The flow and its canvas are permanently removed. This cannot be undone."
        }
        confirmLabel={
          closingDeleteTargets && closingDeleteTargets.length > 1
            ? "Delete automations"
            : "Delete automation"
        }
        loading={deleting}
        onConfirm={() => void handleDelete()}
      />

      <ConfirmDialog
        open={confirmPauseOpen}
        onOpenChange={(open) => {
          if (!open) setConfirmPauseOpen(false)
        }}
        title="Pause every automation?"
        description="Every flow stops as soon as you confirm, and no new one can be started by hand. A run part-way through finishes the step it is on, then holds its place — nothing is thrown away, and everything picks up where it left off when you resume."
        confirmLabel="Pause automations"
        loading={automationPauseBusy}
        onConfirm={() => void handlePauseChange(true)}
      />
    </>
  )
}
