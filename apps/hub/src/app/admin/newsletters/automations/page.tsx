"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { Card, CardContent, CardGroup, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog } from "@/components/ui/dialog"
import {
  TableRightActions,
  TableRightActionsButton,
  TableRightActionsSearch,
  TableRightActionsSelectTrigger
} from "@/components/admin/layout/content/table-right-actions"
import {
  AdminBulkDeleteButton,
  ConfirmDestructive,
  AdminErrorDialog,
  AdminListFooter,
  AdminListSkeleton,
  AdminSortButton,
  AdminTableShell,
  useAdminBulkSelection,
  useAdminSort
} from "@/components/admin/layout/list"
import { Field, FieldLabel } from "@/components/ui/field"
import { DashboardModalContent, DashboardModalCardTitle } from "@/components/admin/layout/dashboard/modals"
import { Trash2, Settings, Zap, Mail, Plus } from "lucide-react"
import {
  getAutomationsBySite,
  createAutomation,
  updateAutomation,
  deleteAutomations
} from "@/lib/actions/newsletters/automation-actions"
import type { EmailAutomation } from "@/lib/actions/newsletters/automation-actions"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import {
  AUTOMATION_TRIGGER_SHORT_LABELS,
  getAutomationTriggerNodes
} from "@/lib/actions/newsletters/automation-triggers"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectValue } from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table"

type AutomationSortColumn = "name" | "trigger" | "status" | "steps" | "enrolled"

export default function EmailAutomationsPage() {
  const router = useRouter()
  const { currentSite, pageSize: contextPageSize } = useSiteSwitcher()
  const [automations, setAutomations] = useState<EmailAutomation[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<string>("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [massDeleting, setMassDeleting] = useState(false)
  const [massDeleteConfirmOpen, setMassDeleteConfirmOpen] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [errorDialogOpen, setErrorDialogOpen] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const [createOpen, setCreateOpen] = useState(false)
  const [createName, setCreateName] = useState("")
  const [creating, setCreating] = useState(false)
  const [settingsAutomation, setSettingsAutomation] = useState<EmailAutomation | null>(null)
  const [settingsName, setSettingsName] = useState("")
  const [savingSettings, setSavingSettings] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [total, setTotal] = useState(0)
  const pageSize = contextPageSize
  const automationSelection = useAdminBulkSelection()
  const automationSort = useAdminSort<AutomationSortColumn>()

  const loadAutomations = useCallback(async () => {
    if (!currentSite?.id) {
      setLoading(true)
      setAutomations([])
      return
    }
    setLoading(true)
    const {
      data,
      total: t,
      error
    } = await getAutomationsBySite(currentSite.id, {
      page: currentPage,
      pageSize
    })
    if (error) {
      setErrorMessage(error)
      setErrorDialogOpen(true)
    }
    setAutomations(data ?? [])
    setTotal(t)
    setLoading(false)
  }, [currentPage, currentSite?.id, pageSize])

  useEffect(() => {
    loadAutomations()
  }, [loadAutomations])

  const handleDelete = (id: string) => {
    setPendingDeleteId(id)
  }

  const confirmDelete = async () => {
    if (!pendingDeleteId) return
    const automationId = pendingDeleteId
    const { success, error } = await deleteAutomations([automationId])
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
    const { success, error } = await deleteAutomations(Array.from(automationSelection.selectedIds))
    if (error) {
      setErrorMessage(error)
    }
    if (success) {
      automationSelection.clearSelection()
      setMassDeleteConfirmOpen(false)
      loadAutomations()
    }
    setMassDeleting(false)
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentSite?.id || !createName.trim()) return
    setCreating(true)
    const { data, error } = await createAutomation({
      siteId: currentSite.id,
      name: createName.trim(),
      triggerType: "none"
    })
    if (error) {
      setErrorMessage(error)
      setErrorDialogOpen(true)
    }
    if (data) {
      setCreateOpen(false)
      setCreateName("")
      router.push(`/admin/newsletters/automations/${data.id}`)
    }
    setCreating(false)
  }

  const openSettings = (automation: EmailAutomation) => {
    setSettingsAutomation(automation)
    setSettingsName(automation.name)
  }

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!settingsAutomation || !settingsName.trim()) return

    setSavingSettings(true)
    const { data, error } = await updateAutomation(settingsAutomation.id, {
      name: settingsName.trim()
    })
    if (error) {
      setErrorMessage(error)
      setErrorDialogOpen(true)
    }
    if (data) {
      setAutomations((current) => current.map((automation) => automation.id === data.id ? data : automation))
      setSettingsAutomation(null)
    }
    setSavingSettings(false)
  }

  const normalizedSearchQuery = searchQuery.trim().toLowerCase()
  const filtered = automations.filter((a) => {
    let statusMatch = true
    if (filterStatus === "active") statusMatch = a.status === "active"
    if (filterStatus === "paused") statusMatch = a.status === "paused"
    if (filterStatus === "draft") statusMatch = a.status === "draft"

    const searchText = `${a.name} ${a.status} ${a.trigger_type}`.toLowerCase()
    const searchMatch = !normalizedSearchQuery || searchText.includes(normalizedSearchQuery)

    return statusMatch && searchMatch
  })

  const sortedAutomations = [...filtered].sort((a, b) => {
    if (!automationSort.sortColumn) return 0
    const dir = automationSort.sortDirection === "asc" ? 1 : -1
    if (automationSort.sortColumn === "name") return a.name.localeCompare(b.name) * dir
    if (automationSort.sortColumn === "trigger")
      return getTriggerBadgeLabel(a).localeCompare(getTriggerBadgeLabel(b)) * dir
    if (automationSort.sortColumn === "status") return a.status.localeCompare(b.status) * dir
    if (automationSort.sortColumn === "steps") return ((a.steps_count ?? 0) - (b.steps_count ?? 0)) * dir
    if (automationSort.sortColumn === "enrolled") return ((a.enrollments_count ?? 0) - (b.enrollments_count ?? 0)) * dir
    return 0
  })
  const visibleAutomationIds = sortedAutomations.map((automation) => automation.id)

  const statusCounts = {
    all: automations.length,
    active: automations.filter((a) => a.status === "active").length,
    paused: automations.filter((a) => a.status === "paused").length,
    draft: automations.filter((a) => a.status === "draft").length
  }

  const handleFilterChange = (value: string) => {
    setFilterStatus(value)
    automationSelection.clearSelection()
    setCurrentPage(1)
  }

  const getStatusBadge = (status: string) => {
    if (status === "active") return <Badge className="bg-green-100 text-green-800">Active</Badge>
    if (status === "paused") return <Badge className="bg-yellow-100 text-yellow-800">Paused</Badge>
    return <Badge variant="secondary">Draft</Badge>
  }

  const getTriggerBadgeLabel = (automation: EmailAutomation) => {
    const triggerNodes = getAutomationTriggerNodes(automation.trigger_type, automation.trigger_config)
    if (triggerNodes.length === 0) return AUTOMATION_TRIGGER_SHORT_LABELS.none
    if (triggerNodes.length === 1) return AUTOMATION_TRIGGER_SHORT_LABELS[triggerNodes[0].type]
    return `${triggerNodes.length} Triggers`
  }

  return (
    <>
      <StickyHeader />
      <AdminLayout>
        <div className="w-full">
          <DashboardSubheader
            items={[{ label: "Newsletters", href: "/admin/newsletters" }, { label: "Automations" }]}
          />

          <AdminTableShell
            title="Automations"
            icon={<Zap className="size-4 text-muted-foreground sm:size-[18px]" />}
            count={filtered.length}
            selectedCount={automationSelection.selectedCount}
            onClearSelection={automationSelection.clearSelection}
            titleActions={
              <AdminBulkDeleteButton
                deleting={massDeleting}
                onClick={() => setMassDeleteConfirmOpen(true)}
                selectedCount={automationSelection.selectedCount}
              />
            }
            controls={
              <TableRightActions>
                <TableRightActionsSearch
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search automations"
                />
                <Select value={filterStatus} onValueChange={handleFilterChange}>
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
                  <span className="hidden sm:inline">Create Automation</span>
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
                        onClick={() => automationSort.toggleSort("name")}
                      >
                        Automation
                      </AdminSortButton>
                    </TableHead>
                    <TableHead column="meta">
                      <AdminSortButton
                        active={automationSort.sortColumn === "trigger"}
                        direction={automationSort.sortDirection}
                        onClick={() => automationSort.toggleSort("trigger")}
                      >
                        Trigger
                      </AdminSortButton>
                    </TableHead>
                    <TableHead column="meta">
                      <AdminSortButton
                        active={automationSort.sortColumn === "status"}
                        direction={automationSort.sortDirection}
                        onClick={() => automationSort.toggleSort("status")}
                      >
                        Status
                      </AdminSortButton>
                    </TableHead>
                    <TableHead column="meta">
                      <AdminSortButton
                        active={automationSort.sortColumn === "steps"}
                        direction={automationSort.sortDirection}
                        onClick={() => automationSort.toggleSort("steps")}
                      >
                        Steps
                      </AdminSortButton>
                    </TableHead>
                    <TableHead column="meta">
                      <AdminSortButton
                        active={automationSort.sortColumn === "enrolled"}
                        direction={automationSort.sortDirection}
                        onClick={() => automationSort.toggleSort("enrolled")}
                      >
                        Enrolled
                      </AdminSortButton>
                    </TableHead>
                    <TableHead column="meta">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <AdminListSkeleton columns={7} rowCount={3} actionCount={2} />
                  ) : filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-32 text-center">
                        <Zap className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
                        <p className="mb-4 text-muted-foreground">No email automations yet</p>
                        <Button onClick={() => setCreateOpen(true)} variant="outline">
                          Create Your First Automation
                        </Button>
                      </TableCell>
                    </TableRow>
                  ) : (
                    sortedAutomations.map((automation) => (
                      <TableRow
                        key={automation.id}
                        data-state={automationSelection.selectedIds.has(automation.id) ? "selected" : undefined}
                        className="group"
                      >
                        <TableCell column="select">
                          <Checkbox
                            checked={automationSelection.selectedIds.has(automation.id)}
                            onCheckedChange={() => automationSelection.toggleOne(automation.id)}
                            aria-label={`Select ${automation.name}`}
                          />
                        </TableCell>
                        <TableCell column="main">
                          <div className="flex min-w-0 items-center space-x-4">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-muted">
                              <Mail className="h-5 w-5 text-muted-foreground" />
                            </div>
                            <Link
                              href={`/admin/newsletters/automations/${automation.id}`}
                              className="min-w-0 transition-opacity hover:opacity-80"
                            >
                              <h4 className="truncate text-sm font-medium hover:underline sm:text-base">{automation.name}</h4>
                              {automation.description && (
                                <p className="truncate text-xs text-muted-foreground">{automation.description}</p>
                              )}
                            </Link>
                          </div>
                        </TableCell>
                        <TableCell column="meta">
                          <Badge variant="outline" className="text-xs">
                            {getTriggerBadgeLabel(automation)}
                          </Badge>
                        </TableCell>
                        <TableCell column="meta">{getStatusBadge(automation.status)}</TableCell>
                        <TableCell column="mutedMeta">{automation.steps_count ?? 0}</TableCell>
                        <TableCell column="mutedMeta">{automation.enrollments_count ?? 0}</TableCell>
                        <TableCell column="meta">
                          <div className="flex items-center space-x-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={() => openSettings(automation)}
                              title="Settings"
                            >
                              <Settings className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-foreground hover:text-foreground"
                              onClick={() => handleDelete(automation.id)}
                              title="Delete"
                            >
                              <Trash2 className="h-4 w-4" />
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

          {/* Create Dialog */}
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <form id="create-automation-form" onSubmit={handleCreate} className="contents">
              <DashboardModalContent
                title="Create Email Automation"
                description="Create the automation shell, then configure triggers and steps in the builder."
                footer={
                  <>
                    <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                      Cancel
                    </Button>
                    <Button form="create-automation-form" type="submit" disabled={creating || !createName.trim()}>
                      {creating ? "Creating..." : "Create Automation"}
                    </Button>
                  </>
                }
              >
                <CardGroup className="grid">
                  <Card>
                    <CardHeader>
                      <DashboardModalCardTitle>Automation</DashboardModalCardTitle>
                    </CardHeader>
                    <CardContent>
                      <Field>
                        <FieldLabel>Name *</FieldLabel>
                        <Input
                          value={createName}
                          onChange={(e) => setCreateName(e.target.value)}
                          placeholder="e.g. Fitness Lead Magnet Sequence"
                          required
                        />
                      </Field>
                      <p className="text-sm text-muted-foreground">
                        Create the automation first, then choose one or more triggers in the builder.
                      </p>
                    </CardContent>
                  </Card>
                </CardGroup>
              </DashboardModalContent>
            </form>
          </Dialog>

          <Dialog open={settingsAutomation !== null} onOpenChange={(open) => !open && setSettingsAutomation(null)}>
            <form id="automation-settings-form" onSubmit={handleSaveSettings} className="contents">
              <DashboardModalContent
                title="Automation Settings"
                description="Update the automation title."
                footer={
                  <>
                    <Button type="button" variant="outline" onClick={() => setSettingsAutomation(null)}>
                      Cancel
                    </Button>
                    <Button
                      form="automation-settings-form"
                      type="submit"
                      disabled={savingSettings || !settingsName.trim()}
                    >
                      {savingSettings ? "Saving..." : "Save Settings"}
                    </Button>
                  </>
                }
              >
                <CardGroup className="grid">
                  <Card>
                    <CardHeader>
                      <DashboardModalCardTitle>Automation</DashboardModalCardTitle>
                    </CardHeader>
                    <CardContent>
                      <Field>
                        <FieldLabel>Title *</FieldLabel>
                        <Input
                          value={settingsName}
                          onChange={(e) => setSettingsName(e.target.value)}
                          placeholder="e.g. Fitness Lead Magnet Sequence"
                          required
                        />
                      </Field>
                    </CardContent>
                  </Card>
                </CardGroup>
              </DashboardModalContent>
            </form>
          </Dialog>

          <ConfirmDestructive
            action="delete-newsletter-automation"
            open={pendingDeleteId !== null}
            title="Delete Automation"
            description="This will delete the automation and all its steps and enrollments. This cannot be undone."
            error={errorMessage || null}
            impactRequest={pendingDeleteId && currentSite?.id
              ? { ids: [pendingDeleteId], siteId: currentSite.id, target: "newsletter-automation" }
              : undefined}
            onCancel={() => { setPendingDeleteId(null); setErrorMessage("") }}
            onConfirm={confirmDelete}
          />
          <ConfirmDestructive
            action="delete-newsletter-automation"
            open={massDeleteConfirmOpen}
            title={`Delete ${automationSelection.selectedCount} Automation${automationSelection.selectedCount !== 1 ? "s" : ""}`}
            description="This cannot be undone."
            confirmLabel={`Delete ${automationSelection.selectedCount}`}
            disabled={massDeleting}
            error={errorMessage || null}
            impactRequest={currentSite?.id
              ? { ids: Array.from(automationSelection.selectedIds), siteId: currentSite.id, target: "newsletter-automation" }
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
