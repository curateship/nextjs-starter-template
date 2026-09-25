"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "@/components/app-link"
import { useRouter } from "@/lib/navigation-client"
import Copy from "lucide-react/dist/esm/icons/copy.js"
import Loader2 from "lucide-react/dist/esm/icons/loader-circle.js"
import Pause from "lucide-react/dist/esm/icons/pause.js"
import Play from "lucide-react/dist/esm/icons/play.js"
import Plus from "lucide-react/dist/esm/icons/plus.js"
import Trash2 from "lucide-react/dist/esm/icons/trash-2.js"
import Workflow from "lucide-react/dist/esm/icons/workflow.js"

import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import {
  AdminBulkDeleteButton,
  ConfirmDestructive,
  AdminListFooter,
  AdminRowAction,
  AdminRowActions,
  AdminSortButton,
  AdminTableShell, AdminListPending,
  RelativeDate,
  useAdminBulkSelection,
  useAdminSort,
} from "@/components/admin/layout/list"
import {
  TableRightActions,
  TableRightActionsButton,
  TableRightActionsSearch,
  TableRightActionsSelectTrigger,
} from "@/components/admin/layout/content/table-right-actions"
import { useClearSelectionOnListChange } from "@/lib/use-clear-selection"
import { useResetPageOnListChange } from "@/lib/use-reset-page"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { AutomationListItem, AutomationSchedule, AutomationStatus } from "@/features/automations/domain/types"
import {
  createAutomation,
  deleteAutomations,
  duplicateAutomation,
  getAutomationsBySite,
  runAutomationNow,
  setAutomationStatus,
} from "@/lib/actions/automations/automation-actions"
import { showActionError, showActionSuccess } from "@/lib/utils/admin-action-feedback"

type SortColumn = "name" | "status" | "lastRun" | "nextRun" | "updated"
type StatusFilter = "all" | AutomationStatus

const EMPTY_COUNTS = { all: 0, draft: 0, active: 0, paused: 0 }
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

function formatDateTime(value: string | null, fallback = "—", timezone?: string) {
  if (!value) return fallback
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", ...(timezone ? { timeZone: timezone } : {}) }).format(new Date(value))
  } catch {
    return fallback
  }
}

function formatSchedule(schedule: AutomationSchedule | null) {
  if (!schedule) return "Not configured"
  if (schedule.frequency === "once") return `Once · ${formatDateTime(schedule.runAt, "—", schedule.timezone)}`
  if (schedule.frequency === "daily") return `Daily · ${schedule.time}`
  if (schedule.frequency === "weekly") return `${WEEKDAYS[schedule.dayOfWeek]} · ${schedule.time}`
  return `Monthly, day ${schedule.dayOfMonth} · ${schedule.time}`
}

function StatusBadge({ status }: { status: AutomationStatus }) {
  if (status === "active") return <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">Active</Badge>
  if (status === "paused") return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200">Paused</Badge>
  return <Badge variant="secondary">Draft</Badge>
}

export function AutomationsDashboard() {
  const router = useRouter()
  const { currentSite, loading: siteLoading, pageSize } = useSiteSwitcher()
  const [items, setItems] = useState<AutomationListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState<StatusFilter>("all")
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [counts, setCounts] = useState(EMPTY_COUNTS)
  const [createOpen, setCreateOpen] = useState(false)
  const [createName, setCreateName] = useState("")
  const [creating, setCreating] = useState(false)
  const [deleteIds, setDeleteIds] = useState<string[]>([])
  const [deleting, setDeleting] = useState(false)
  const [workingId, setWorkingId] = useState<string | null>(null)
  const loadRequestRef = useRef(0)
  const selection = useAdminBulkSelection()
  const sort = useAdminSort<SortColumn>()
  // Everything that changes what the table shows, minus the page itself.
  const listQueryKey = `${currentSite?.id}|${search}|${status}|${sort.sortColumn}|${sort.sortDirection}`
  // Searching, filtering or re-sorting from a later page would otherwise
  // land you past the end of the shorter result.
  useResetPageOnListChange(setPage, listQueryKey)
  // Ticks never survive a change to what the table is showing — the page
  // and rows-per-page included, so a bulk action only ever means rows on
  // screen.
  useClearSelectionOnListChange(selection, `${listQueryKey}|${page}|${pageSize}`)


  const load = useCallback(async () => {
    if (siteLoading) return
    const requestId = ++loadRequestRef.current
    if (!currentSite?.id) {
      setItems([])
      setTotal(0)
      setCounts(EMPTY_COUNTS)
      setLoading(false)
      return
    }
    setLoading(true)
    const result = await getAutomationsBySite({ data: { siteId: currentSite.id, options: {
      page,
      pageSize,
      search,
      status,
      sortColumn: sort.sortColumn,
      sortDirection: sort.sortDirection,
    } } })
    if (requestId !== loadRequestRef.current) return
    if (result.error) showActionError(result.error)
    setItems(result.data)
    setTotal(result.total)
    setCounts(result.statusCounts)
    setLoading(false)
  }, [currentSite?.id, page, pageSize, search, siteLoading, sort.sortColumn, sort.sortDirection, status])

  useEffect(() => { void load() }, [load])

  const visibleIds = useMemo(() => items.map((item) => item.id), [items])

  async function handleCreate() {
    if (!currentSite?.id || !createName.trim()) return
    setCreating(true)
    const result = await createAutomation({ data: { siteId: currentSite.id, name: createName } })
    setCreating(false)
    if (result.error || !result.data) return showActionError(result.error || "Failed to create automation")
    setCreateOpen(false)
    setCreateName("")
    router.push(`/admin/automations/${result.data.id}`)
  }

  async function handleDelete() {
    if (!deleteIds.length) return
    setDeleting(true)
    const result = await deleteAutomations({ data: { automationIds: deleteIds } })
    setDeleting(false)
    if (result.error || !result.success) return showActionError(result.error || "Failed to delete automation")
    setDeleteIds([])
    selection.clearSelection()
    showActionSuccess(deleteIds.length === 1 ? "Automation deleted." : "Automations deleted.")
    await load()
  }

  async function handleStatus(item: AutomationListItem) {
    setWorkingId(item.id)
    const result = await setAutomationStatus({ data: { automationId: item.id, status: item.status === "active" ? "paused" : "active" } })
    setWorkingId(null)
    if (result.error) return showActionError(result.error)
    await load()
  }

  async function handleRun(item: AutomationListItem) {
    setWorkingId(item.id)
    const result = await runAutomationNow({ data: { automationId: item.id } })
    setWorkingId(null)
    if (result.error) return showActionError(result.error)
    showActionSuccess(
      result.data?.status === "waiting"
        ? "Paused — this run needs your approval."
        : "Automation run finished.",
    )
    await load()
  }

  async function handleDuplicate(item: AutomationListItem) {
    setWorkingId(item.id)
    const result = await duplicateAutomation({ data: { automationId: item.id } })
    setWorkingId(null)
    if (result.error) return showActionError(result.error)
    showActionSuccess("Automation duplicated.")
    await load()
  }

  function handleSort(column: SortColumn) {
    sort.toggleSort(column)
    setPage(1)
    selection.clearSelection()
  }

  return (
    <>
      <StickyHeader />
      <AdminLayout>
        <DashboardSubheader items={[{ label: "Automations" }]} />
        <AdminTableShell
          title="Automations"
          icon={<Workflow className="size-[18px] text-muted-foreground" />}
          count={total}
          selectedCount={selection.selectedCount}
          onClearSelection={selection.clearSelection}
          titleActions={
            <AdminBulkDeleteButton
              deleting={deleting}
              selectedCount={selection.selectedCount}
              onClick={() => setDeleteIds(Array.from(selection.selectedIds))}
            />
          }
          controls={
            <TableRightActions>
              <TableRightActionsSearch
                value={search}
                placeholder="Search automations"
                onChange={(event) => { setSearch(event.target.value); setPage(1); selection.clearSelection() }}
              />
              <Select value={status} onValueChange={(value) => { setStatus(value as StatusFilter); setPage(1); selection.clearSelection() }}>
                <TableRightActionsSelectTrigger aria-label="Automation status">
                  <SelectValue />
                </TableRightActionsSelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All ({counts.all})</SelectItem>
                  <SelectItem value="active">Active ({counts.active})</SelectItem>
                  <SelectItem value="paused">Paused ({counts.paused})</SelectItem>
                  <SelectItem value="draft">Draft ({counts.draft})</SelectItem>
                </SelectContent>
              </Select>
              <TableRightActionsButton onClick={() => setCreateOpen(true)}>
                <Plus className="size-4" /> New automation
              </TableRightActionsButton>
            </TableRightActions>
          }
          footer={!loading ? <AdminListFooter currentPage={page} pageSize={pageSize} total={total} onPageChange={setPage} /> : null}
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead column="select">
                  <Checkbox
                    checked={selection.isPageSelected(visibleIds)}
                    onCheckedChange={() => selection.togglePage(visibleIds)}
                    aria-label="Select all automations"
                  />
                </TableHead>
                <TableHead column="main"><AdminSortButton active={sort.sortColumn === "name"} direction={sort.sortDirection} onClick={() => handleSort("name")}>Automation</AdminSortButton></TableHead>
                <TableHead column="content">Schedule</TableHead>
                <TableHead column="meta"><AdminSortButton active={sort.sortColumn === "status"} direction={sort.sortDirection} onClick={() => handleSort("status")}>Status</AdminSortButton></TableHead>
                <TableHead column="meta"><AdminSortButton active={sort.sortColumn === "lastRun"} direction={sort.sortDirection} onClick={() => handleSort("lastRun")}>Last run</AdminSortButton></TableHead>
                <TableHead column="meta"><AdminSortButton active={sort.sortColumn === "nextRun"} direction={sort.sortDirection} onClick={() => handleSort("nextRun")}>Next run</AdminSortButton></TableHead>
                <TableHead column="meta">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && items.length === 0 ? (
                <AdminListPending />
              ) : items.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="h-28 text-center text-muted-foreground">{search.trim() || status !== "all" ? "No automations found matching your search." : "No automations found."}</TableCell></TableRow>
              ) : items.map((item) => {
                const working = workingId === item.id
                return (
                  <TableRow key={item.id} data-state={selection.selectedIds.has(item.id) ? "selected" : undefined}>
                    <TableCell column="select"><Checkbox checked={selection.selectedIds.has(item.id)} onCheckedChange={() => selection.toggleOne(item.id)} aria-label={`Select ${item.name}`} /></TableCell>
                    <TableCell column="main">
                      <Link href={`/admin/automations/${item.id}`} className="font-medium hover:underline">{item.name}</Link>
                      <div className="text-xs text-muted-foreground">{item.nodeCount} nodes · Updated <RelativeDate date={item.updatedAt} /></div>
                    </TableCell>
                    <TableCell column="content" className="text-sm text-muted-foreground">{formatSchedule(item.schedule)}<div className="text-xs">{item.schedule?.timezone}</div></TableCell>
                    <TableCell column="meta"><StatusBadge status={item.status} /></TableCell>
                    <TableCell column="mutedMeta">{item.lastRunAt ? formatDateTime(item.lastRunAt) : "Never"}</TableCell>
                    <TableCell column="mutedMeta">{formatDateTime(item.nextRunAt, item.status === "active" ? "Not scheduled" : "—")}</TableCell>
                    <TableCell column="meta">
                      <AdminRowActions>
                        <AdminRowAction icon={working ? Loader2 : Play} className={working ? "[&_svg]:animate-spin" : undefined} label="Run now" disabled={working} onClick={() => void handleRun(item)} />
                        <AdminRowAction icon={item.status === "active" ? Pause : Workflow} label={item.status === "active" ? "Pause" : "Activate"} disabled={working} onClick={() => void handleStatus(item)} />
                        <AdminRowAction icon={Copy} label="Duplicate" disabled={working} onClick={() => void handleDuplicate(item)} />
                        {/* Red until task 24 settles one look for a row delete. */}
                        <AdminRowAction icon={Trash2} className="text-destructive hover:text-destructive" label="Delete" disabled={working} onClick={() => setDeleteIds([item.id])} />
                      </AdminRowActions>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </AdminTableShell>
      </AdminLayout>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New automation</DialogTitle><DialogDescription>Create a draft, then build its workflow on the canvas.</DialogDescription></DialogHeader>
          <div className="grid gap-2"><Label htmlFor="automation-name">Name</Label><Input id="automation-name" autoFocus value={createName} onChange={(event) => setCreateName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void handleCreate() }} placeholder="Article publishing workflow" maxLength={255} /></div>
          <DialogFooter showCloseButton><Button onClick={() => void handleCreate()} disabled={creating || !createName.trim()}>{creating ? <Loader2 className="animate-spin" /> : <Plus />}Create</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDestructive
        action="delete-ai-automation"
        open={deleteIds.length > 0}
        title={`Delete ${deleteIds.length === 1 ? "automation" : `${deleteIds.length} automations`}?`}
        description="This cannot be undone."
        impactRequest={currentSite?.id && deleteIds.length ? { target: "ai-automation", siteId: currentSite.id, ids: deleteIds } : undefined}
        disabled={deleting}
        onCancel={() => { if (!deleting) setDeleteIds([]) }}
        onConfirm={handleDelete}
      />
    </>
  )
}
