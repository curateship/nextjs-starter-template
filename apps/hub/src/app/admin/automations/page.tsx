"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import {
  Clock,
  Loader2,
  Pause,
  Play,
  Plus,
  Settings,
  Trash2,
  Workflow,
} from "lucide-react"

import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import {
  TableRightActions,
  TableRightActionsButton,
  TableRightActionsSearch,
  TableRightActionsSelectTrigger,
} from "@/components/admin/layout/content/table-right-actions"
import {
  AdminBulkDeleteButton,
  ConfirmDestructive,
  AdminErrorDialog,
  AdminListFooter,
  AdminListSkeleton,
  AdminSortButton,
  AdminTableShell,
  formatRelativeDate,
  useAdminBulkSelection,
  useAdminSort,
} from "@/components/admin/layout/list"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  deleteAiAutomations,
  getAiAutomationsBySite,
  getConfiguredAIProvidersForSiteAction,
  runAiAutomationNow,
  updateAiAutomation,
} from "@/lib/actions/ai-automations/automation-actions"
import type {
  AiAgentAutomation,
  AiAutomationStatus,
  AiAutomationStatusCounts,
  AutomationSortColumn,
  AutomationStatusFilter,
} from "@/lib/actions/ai-automations/types"
import {
  AutomationCreateDialog,
  AutomationSettingsDialog,
  type ConfiguredProvider,
} from "./_components/automation-dialogs"


const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
const EMPTY_STATUS_COUNTS: AiAutomationStatusCounts = { all: 0, active: 0, paused: 0, draft: 0 }

function formatDateTime(value: string | null) {
  if (!value) return "Not scheduled"
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}

function formatSchedule(automation: AiAgentAutomation) {
  const recurrence = automation.recurrence
  const time = recurrence.time
  if (recurrence.frequency === "daily") return `Daily at ${time}`
  if (recurrence.frequency === "weekly") return `${WEEKDAYS[recurrence.dayOfWeek ?? 1]} at ${time}`
  return `Monthly on day ${recurrence.dayOfMonth ?? 1} at ${time}`
}

function getStatusBadge(status: AiAutomationStatus) {
  if (status === "active") {
    return <Badge className="bg-green-100 text-green-800">Active</Badge>
  }
  if (status === "paused") {
    return <Badge className="bg-yellow-100 text-yellow-800">Paused</Badge>
  }
  return <Badge variant="secondary">Draft</Badge>
}

export default function AutomationsPage() {
  const { currentSite, loading: siteLoading, pageSize } = useSiteSwitcher()
  const [automations, setAutomations] = useState<AiAgentAutomation[]>([])
  const [providers, setProviders] = useState<ConfiguredProvider[]>([])
  const [loading, setLoading] = useState(true)
  const [providersLoading, setProvidersLoading] = useState(false)
  const [filterStatus, setFilterStatus] = useState<AutomationStatusFilter>("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [statusCounts, setStatusCounts] = useState<AiAutomationStatusCounts>(EMPTY_STATUS_COUNTS)
  const [createOpen, setCreateOpen] = useState(false)
  const [settingsAutomation, setSettingsAutomation] = useState<AiAgentAutomation | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [massDeleteConfirmOpen, setMassDeleteConfirmOpen] = useState(false)
  const [massDeleting, setMassDeleting] = useState(false)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [runningId, setRunningId] = useState<string | null>(null)
  const [errorDialogOpen, setErrorDialogOpen] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const automationSelection = useAdminBulkSelection()
  const automationSort = useAdminSort<AutomationSortColumn>()

  const showError = useCallback((message: string) => {
    setErrorMessage(message)
    setErrorDialogOpen(true)
  }, [])

  const loadAutomations = useCallback(async () => {
    if (siteLoading) return
    if (!currentSite?.id) {
      setAutomations([])
      setTotal(0)
      setStatusCounts(EMPTY_STATUS_COUNTS)
      setLoading(false)
      return
    }

    setLoading(true)
    const { data, total: totalCount, statusCounts: nextStatusCounts, error } = await getAiAutomationsBySite(currentSite.id, {
      page: currentPage,
      pageSize,
      search: searchQuery,
      status: filterStatus,
      sortColumn: automationSort.sortColumn,
      sortDirection: automationSort.sortDirection,
    })
    if (error) showError(error)
    setAutomations(data ?? [])
    setTotal(totalCount)
    setStatusCounts(nextStatusCounts)
    setLoading(false)
  }, [
    automationSort.sortColumn,
    automationSort.sortDirection,
    currentPage,
    currentSite?.id,
    filterStatus,
    pageSize,
    searchQuery,
    showError,
    siteLoading,
  ])

  const loadProviders = useCallback(async () => {
    if (!currentSite?.id) {
      setProviders([])
      return
    }

    setProvidersLoading(true)
    const { data, error } = await getConfiguredAIProvidersForSiteAction(currentSite.id)
    if (error) showError(error)
    setProviders(data ?? [])
    setProvidersLoading(false)
  }, [currentSite?.id, showError])

  useEffect(() => {
    loadAutomations()
  }, [loadAutomations])

  useEffect(() => {
    loadProviders()
  }, [loadProviders])

  const visibleAutomationIds = automations.map((automation) => automation.id)

  const handleAutomationUpdated = (automation: AiAgentAutomation) => {
    setSettingsAutomation(automation)
    setAutomations((current) => current.map((item) => item.id === automation.id ? { ...item, ...automation } : item))
  }

  const handleReferenceCountChange = (automationId: string, delta: number) => {
    setAutomations((current) => current.map((item) => item.id === automationId
      ? { ...item, references_count: Math.max(0, (item.references_count ?? 0) + delta) }
      : item
    ))
  }

  const confirmDelete = async () => {
    if (!pendingDeleteId) return
    const automationId = pendingDeleteId
    const { success, error } = await deleteAiAutomations([automationId])
    if (error) {
      setErrorMessage(error)
      return
    }
    if (success) {
      setPendingDeleteId(null)
      loadAutomations()
    }
  }

  const confirmMassDelete = async () => {
    setMassDeleting(true)
    const { success, error } = await deleteAiAutomations(Array.from(automationSelection.selectedIds))
    if (error) setErrorMessage(error)
    if (success) {
      automationSelection.clearSelection()
      setMassDeleteConfirmOpen(false)
      loadAutomations()
    }
    setMassDeleting(false)
  }

  const handleToggleStatus = async (automation: AiAgentAutomation) => {
    const nextStatus: AiAutomationStatus = automation.status === "active" ? "paused" : "active"
    setUpdatingId(automation.id)
    const { data, error } = await updateAiAutomation(automation.id, { status: nextStatus })
    if (error) showError(error)
    if (data) {
      setAutomations((current) => current.map((item) => item.id === data.id ? { ...item, ...data } : item))
    }
    setUpdatingId(null)
  }

  const handleRunNow = async (automation: AiAgentAutomation) => {
    setRunningId(automation.id)
    const { error } = await runAiAutomationNow(automation.id)
    if (error) showError(error)
    await loadAutomations()
    setRunningId(null)
  }

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(event.target.value)
    setCurrentPage(1)
    automationSelection.clearSelection()
  }

  const handleSort = (column: AutomationSortColumn) => {
    automationSort.toggleSort(column)
    setCurrentPage(1)
    automationSelection.clearSelection()
  }

  return (
    <>
      <StickyHeader />
      <AdminLayout>
        <div className="w-full">
          <DashboardSubheader items={[{ label: "Automations" }]} />

          <AdminTableShell
            title="Automations"
            icon={<Workflow className="size-4 text-muted-foreground sm:size-[18px]" />}
            count={total}
            selectedCount={automationSelection.selectedCount}
            onClearSelection={automationSelection.clearSelection}
            titleActions={
              <AdminBulkDeleteButton
                deleting={massDeleting}
                onClick={() => { setErrorMessage(""); setMassDeleteConfirmOpen(true) }}
                selectedCount={automationSelection.selectedCount}
              />
            }
            controls={
              <TableRightActions>
                <TableRightActionsSearch
                  value={searchQuery}
                  onChange={handleSearchChange}
                  placeholder="Search automations"
                />
                <Select
                  value={filterStatus}
                  onValueChange={(value) => {
                    setFilterStatus(value as AutomationStatusFilter)
                    automationSelection.clearSelection()
                    setCurrentPage(1)
                  }}
                >
                  <TableRightActionsSelectTrigger aria-label="Automation status filter">
                    <SelectValue />
                  </TableRightActionsSelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All ({statusCounts.all})</SelectItem>
                    <SelectItem value="active">Active ({statusCounts.active})</SelectItem>
                    <SelectItem value="paused">Paused ({statusCounts.paused})</SelectItem>
                    <SelectItem value="draft">Draft ({statusCounts.draft})</SelectItem>
                  </SelectContent>
                </Select>
                <TableRightActionsButton onClick={() => setCreateOpen(true)}>
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">New Automation</span>
                </TableRightActionsButton>
              </TableRightActions>
            }
            footer={
              !loading ? (
                <AdminListFooter
                  currentPage={currentPage}
                  pageSize={pageSize}
                  total={total}
                  onPageChange={setCurrentPage}
                />
              ) : null
            }
          >
            <ScrollArea className="w-full">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead column="select">
                      <Checkbox
                        checked={automationSelection.isPageSelected(visibleAutomationIds)}
                        onCheckedChange={() => automationSelection.togglePage(visibleAutomationIds)}
                        aria-label="Select all automations"
                      />
                    </TableHead>
                    <TableHead column="main">
                      <AdminSortButton
                        active={automationSort.sortColumn === "name"}
                        direction={automationSort.sortDirection}
                        onClick={() => handleSort("name")}
                      >
                        Automation
                      </AdminSortButton>
                    </TableHead>
                    <TableHead column="meta">
                      <AdminSortButton
                        active={automationSort.sortColumn === "provider"}
                        direction={automationSort.sortDirection}
                        onClick={() => handleSort("provider")}
                      >
                        Model
                      </AdminSortButton>
                    </TableHead>
                    <TableHead column="content">Schedule</TableHead>
                    <TableHead column="meta">
                      <AdminSortButton
                        active={automationSort.sortColumn === "status"}
                        direction={automationSort.sortDirection}
                        onClick={() => handleSort("status")}
                      >
                        Status
                      </AdminSortButton>
                    </TableHead>
                    <TableHead column="meta">
                      <AdminSortButton
                        active={automationSort.sortColumn === "lastRun"}
                        direction={automationSort.sortDirection}
                        onClick={() => handleSort("lastRun")}
                      >
                        Last Run
                      </AdminSortButton>
                    </TableHead>
                    <TableHead column="meta">
                      <AdminSortButton
                        active={automationSort.sortColumn === "nextRun"}
                        direction={automationSort.sortDirection}
                        onClick={() => handleSort("nextRun")}
                      >
                        Next Run
                      </AdminSortButton>
                    </TableHead>
                    <TableHead column="meta">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <AdminListSkeleton columns={8} rowCount={3} actionCount={4} />
                  ) : automations.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="h-32 text-center">
                        <Workflow className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
                        <p className="mb-4 text-muted-foreground">No AI automations yet</p>
                        <Button onClick={() => setCreateOpen(true)} variant="outline">
                          Create Your First Automation
                        </Button>
                      </TableCell>
                    </TableRow>
                  ) : (
                    automations.map((automation) => (
                      <TableRow
                        key={automation.id}
                        data-state={automationSelection.selectedIds.has(automation.id) ? "selected" : undefined}
                      >
                        <TableCell column="select">
                          <Checkbox
                            checked={automationSelection.selectedIds.has(automation.id)}
                            onCheckedChange={() => automationSelection.toggleOne(automation.id)}
                            aria-label={`Select ${automation.name}`}
                          />
                        </TableCell>
                        <TableCell column="main">
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-muted">
                              <Workflow className="h-5 w-5 text-muted-foreground" />
                            </div>
                            <Link href={`/admin/automations/${automation.id}`} className="min-w-0 hover:opacity-80">
                              <h4 className="truncate text-sm font-medium hover:underline sm:text-base">
                                {automation.name}
                              </h4>
                              <p className="truncate text-xs text-muted-foreground">
                                {automation.references_count ?? 0} references · {automation.runs_count ?? 0} runs
                              </p>
                            </Link>
                          </div>
                        </TableCell>
                        <TableCell column="meta">
                          <span className="text-sm text-muted-foreground">{automation.model}</span>
                        </TableCell>
                        <TableCell column="content">
                          <div className="flex min-w-[180px] items-start gap-2 text-sm">
                            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                            <span>{formatSchedule(automation)}</span>
                          </div>
                        </TableCell>
                        <TableCell column="meta">{getStatusBadge(automation.status)}</TableCell>
                        <TableCell column="mutedMeta">
                          {automation.last_run_at ? (
                            <span title={formatDateTime(automation.last_run_at)}>
                              {formatRelativeDate(automation.last_run_at)}
                            </span>
                          ) : (
                            "Never"
                          )}
                        </TableCell>
                        <TableCell column="mutedMeta">
                          {automation.next_run_at ? formatDateTime(automation.next_run_at) : "Not scheduled"}
                        </TableCell>
                        <TableCell column="meta">
                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => handleRunNow(automation)}
                              disabled={runningId === automation.id}
                              title="Run now"
                            >
                              {runningId === automation.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Play className="h-4 w-4" />
                              )}
                              <span className="sr-only">Run now</span>
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => handleToggleStatus(automation)}
                              disabled={updatingId === automation.id}
                              title={automation.status === "active" ? "Pause" : "Activate"}
                            >
                              {updatingId === automation.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : automation.status === "active" ? (
                                <Pause className="h-4 w-4" />
                              ) : (
                                <Play className="h-4 w-4" />
                              )}
                              <span className="sr-only">{automation.status === "active" ? "Pause" : "Activate"}</span>
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => setSettingsAutomation(automation)}
                              title="Settings"
                            >
                              <Settings className="h-4 w-4" />
                              <span className="sr-only">Settings</span>
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => { setErrorMessage(""); setPendingDeleteId(automation.id) }}
                              title="Delete"
                            >
                              <Trash2 className="h-4 w-4" />
                              <span className="sr-only">Delete</span>
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </AdminTableShell>

          <AutomationCreateDialog
            currentSiteId={currentSite?.id}
            onCreated={loadAutomations}
            onOpenChange={setCreateOpen}
            open={createOpen}
            providers={providers}
            providersLoading={providersLoading}
            showError={showError}
          />

          <AutomationSettingsDialog
            automation={settingsAutomation}
            onAutomationUpdated={handleAutomationUpdated}
            onClose={() => setSettingsAutomation(null)}
            onReferenceCountChange={handleReferenceCountChange}
            providers={providers}
            showError={showError}
          />

          <ConfirmDestructive
            action="delete-ai-automation"
            open={pendingDeleteId !== null}
            title="Delete Automation"
            description="This will delete the automation, its references, and its run history. This cannot be undone."
            error={errorMessage || null}
            impactRequest={pendingDeleteId && currentSite?.id
              ? { ids: [pendingDeleteId], siteId: currentSite.id, target: "ai-automation" }
              : undefined}
            onCancel={() => { setPendingDeleteId(null); setErrorMessage("") }}
            onConfirm={confirmDelete}
          />
          <ConfirmDestructive
            action="delete-ai-automation"
            open={massDeleteConfirmOpen}
            title={`Delete ${automationSelection.selectedCount} Automation${automationSelection.selectedCount !== 1 ? "s" : ""}`}
            description="This will delete selected automations, references, and run history. This cannot be undone."
            confirmLabel={`Delete ${automationSelection.selectedCount}`}
            disabled={massDeleting}
            error={errorMessage || null}
            impactRequest={currentSite?.id
              ? { ids: Array.from(automationSelection.selectedIds), siteId: currentSite.id, target: "ai-automation" }
              : undefined}
            onCancel={() => { setMassDeleteConfirmOpen(false); setErrorMessage("") }}
            onConfirm={confirmMassDelete}
          />
          <AdminErrorDialog open={errorDialogOpen} message={errorMessage} onOpenChange={setErrorDialogOpen} />
        </div>
      </AdminLayout>
    </>
  )
}
