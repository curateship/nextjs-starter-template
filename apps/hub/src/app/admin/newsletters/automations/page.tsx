"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { Card, CardContent, CardGroup, CardHeader, CardTableHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog } from "@/components/ui/dialog"
import {
  AdminBulkDeleteButton,
  AdminConfirmDialog,
  AdminErrorDialog,
  AdminListFooter,
  AdminListSkeleton,
  AdminSelectionBanner,
  AdminSortButton,
  useAdminBulkSelection,
  useAdminSort
} from "@/components/admin/layout/list"
import { Field, FieldLabel } from "@/components/ui/field"
import { DashboardModalContent, DashboardModalCardTitle } from "@/components/admin/layout/dashboard/modals"
import { Trash2, Settings, Zap, Mail, Plus, List, Play, Pause, FileEdit } from "lucide-react"
import {
  getAutomationsBySite,
  createAutomation,
  deleteAutomations,
  getAutomationIdsAction
} from "@/lib/actions/newsletters/automation-actions"
import type { EmailAutomation } from "@/lib/actions/newsletters/automation-actions"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import {
  AUTOMATION_TRIGGER_SHORT_LABELS,
  getAutomationTriggerNodes
} from "@/lib/actions/newsletters/automation-triggers"

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
    setPendingDeleteId(null)
    const { success, error } = await deleteAutomations([automationId])
    if (error) {
      setErrorMessage(error)
      setErrorDialogOpen(true)
    }
    if (success) loadAutomations()
  }

  // Select all items across all pages (lightweight ID-only fetch)
  const handleSelectAll = async () => {
    if (!currentSite?.id || total === 0) return
    const { ids } = await getAutomationIdsAction(currentSite.id)
    if (ids) {
      automationSelection.selectAll(ids)
    }
  }

  const confirmMassDelete = async () => {
    setMassDeleteConfirmOpen(false)
    setMassDeleting(true)
    const { success, error } = await deleteAutomations(Array.from(automationSelection.selectedIds))
    if (error) {
      setErrorMessage(error)
      setErrorDialogOpen(true)
    }
    if (success) {
      automationSelection.clearSelection()
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
  const filteredAutomationIds = filtered.map((automation) => automation.id)

  const statusCounts = {
    all: automations.length,
    active: automations.filter((a) => a.status === "active").length,
    paused: automations.filter((a) => a.status === "paused").length,
    draft: automations.filter((a) => a.status === "draft").length
  }

  const filterOptions = [
    { value: "all", label: "All", icon: List, count: statusCounts.all },
    {
      value: "active",
      label: "Active",
      icon: Play,
      count: statusCounts.active
    },
    {
      value: "paused",
      label: "Paused",
      icon: Pause,
      count: statusCounts.paused
    },
    {
      value: "draft",
      label: "Draft",
      icon: FileEdit,
      count: statusCounts.draft
    }
  ]

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
            search={{
              value: searchQuery,
              onValueChange: setSearchQuery,
              placeholder: "Search automations"
            }}
            filterMenu={{
              value: filterStatus,
              onValueChange: handleFilterChange,
              items: filterOptions
            }}
            actions={
              <>
                <AdminBulkDeleteButton
                  deleting={massDeleting}
                  onClick={() => setMassDeleteConfirmOpen(true)}
                  selectedCount={automationSelection.selectedCount}
                />
                <Button onClick={() => setCreateOpen(true)}>
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">Create Automation</span>
                </Button>
              </>
            }
          />

          <Card>
            <CardTableHeader className="grid-cols-7">
              <div className="col-span-2 flex items-center space-x-4">
                <Checkbox
                  checked={automationSelection.isPageSelected(filteredAutomationIds)}
                  onCheckedChange={() => automationSelection.togglePage(filteredAutomationIds)}
                />
                <AdminSortButton
                  active={automationSort.sortColumn === "name"}
                  direction={automationSort.sortDirection}
                  onClick={() => automationSort.toggleSort("name")}
                >
                  Automation
                </AdminSortButton>
              </div>
              <AdminSortButton
                active={automationSort.sortColumn === "trigger"}
                direction={automationSort.sortDirection}
                onClick={() => automationSort.toggleSort("trigger")}
              >
                Trigger
              </AdminSortButton>
              <AdminSortButton
                active={automationSort.sortColumn === "status"}
                direction={automationSort.sortDirection}
                onClick={() => automationSort.toggleSort("status")}
              >
                Status
              </AdminSortButton>
              <AdminSortButton
                active={automationSort.sortColumn === "steps"}
                direction={automationSort.sortDirection}
                onClick={() => automationSort.toggleSort("steps")}
              >
                Steps
              </AdminSortButton>
              <AdminSortButton
                active={automationSort.sortColumn === "enrolled"}
                direction={automationSort.sortDirection}
                onClick={() => automationSort.toggleSort("enrolled")}
              >
                Enrolled
              </AdminSortButton>
              <div>Actions</div>
            </CardTableHeader>

            {/* "Select all" banner — shown when all page items selected but more exist */}
            <AdminSelectionBanner
              allSelected={automationSelection.allSelected}
              onClearSelection={automationSelection.clearSelection}
              onSelectAll={handleSelectAll}
              selectedCount={automationSelection.selectedCount}
              total={total}
              visibleCount={filtered.length}
            />

            <div className="divide-y divide-muted/80">
              {loading ? (
                <AdminListSkeleton columns={7} rowCount={3} />
              ) : filtered.length === 0 ? (
                <div className="p-8 text-center">
                  <Zap className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground mb-4">No email automations yet</p>
                  <Button onClick={() => setCreateOpen(true)} variant="outline">
                    Create Your First Automation
                  </Button>
                </div>
              ) : (
                sortedAutomations.map((automation) => (
                  <div
                    key={automation.id}
                    className={`p-6 transition-colors ${automationSelection.selectedIds.has(automation.id) ? "bg-accent/50" : ""}`}
                  >
                    <div className="grid grid-cols-7 gap-4 items-center">
                      <div className="col-span-2 flex items-center space-x-4">
                        <Checkbox
                          checked={automationSelection.selectedIds.has(automation.id)}
                          onCheckedChange={() => automationSelection.toggleOne(automation.id)}
                        />
                        <div className="w-10 h-10 bg-muted rounded flex items-center justify-center ml-2">
                          <Mail className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <Link
                          href={`/admin/newsletters/automations/${automation.id}`}
                          className="hover:opacity-80 transition-opacity"
                        >
                          <h4 className="font-medium text-sm hover:underline">{automation.name}</h4>
                          {automation.description && (
                            <p className="text-xs text-muted-foreground">{automation.description}</p>
                          )}
                        </Link>
                      </div>
                      <div>
                        <Badge variant="outline" className="text-xs">
                          {getTriggerBadgeLabel(automation)}
                        </Badge>
                      </div>
                      <div>{getStatusBadge(automation.status)}</div>
                      <div>
                        <span className="text-sm text-muted-foreground">{automation.steps_count ?? 0}</span>
                      </div>
                      <div>
                        <span className="text-sm text-muted-foreground">{automation.enrollments_count ?? 0}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => router.push(`/admin/newsletters/automations/${automation.id}`)}
                          title="Edit"
                        >
                          <Settings className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-red-600 hover:text-red-600"
                          onClick={() => handleDelete(automation.id)}
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            {!loading && (
              <AdminListFooter
                currentPage={currentPage}
                pageSize={pageSize}
                total={total}
                onPageChange={setCurrentPage}
              />
            )}
          </Card>

          {/* Create Dialog */}
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <form onSubmit={handleCreate} className="contents">
              <DashboardModalContent
                title="Create Email Automation"
                description="Create the automation shell, then configure triggers and steps in the builder."
                footer={
                  <>
                    <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={creating || !createName.trim()}>
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

          <AdminConfirmDialog
            open={pendingDeleteId !== null}
            title="Delete Automation"
            description="This will delete the automation and all its steps and enrollments. This cannot be undone."
            onCancel={() => setPendingDeleteId(null)}
            onConfirm={confirmDelete}
          />
          <AdminConfirmDialog
            open={massDeleteConfirmOpen}
            title={`Delete ${automationSelection.selectedCount} Automation${automationSelection.selectedCount !== 1 ? "s" : ""}`}
            description="This cannot be undone."
            confirmLabel={`Delete ${automationSelection.selectedCount}`}
            disabled={massDeleting}
            onCancel={() => setMassDeleteConfirmOpen(false)}
            onConfirm={confirmMassDelete}
          />
          <AdminErrorDialog open={errorDialogOpen} message={errorMessage} onOpenChange={setErrorDialogOpen} />
        </div>
      </AdminLayout>
    </>
  )
}
