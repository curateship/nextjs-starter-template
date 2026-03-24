"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { StickyHeader } from "@/components/admin/layout/dashboard/StickyHeader"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Trash2, Settings, Zap, Mail, ArrowUp, ArrowDown, ChevronsUpDown, Plus, List, Play, Pause, FileEdit, Users, Filter, FileText } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  getAutomationsBySite,
  createAutomation,
  deleteAutomations,
  getAutomationIdsAction,
} from "@/lib/actions/newsletters/automation-actions"
import type { EmailAutomation } from "@/lib/actions/newsletters/automation-actions"
import { Pagination, PaginationInfo } from "@/components/ui/pagination"
import { useSiteContext } from "@/contexts/site-context"

export default function EmailAutomationsPage() {
  const router = useRouter()
  const { currentSite, pageSize: contextPageSize } = useSiteContext()
  const [automations, setAutomations] = useState<EmailAutomation[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<string>("all")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  // Tracks if user selected all items across all pages
  const [allSelected, setAllSelected] = useState(false)
  const [massDeleting, setMassDeleting] = useState(false)
  const [massDeleteConfirmOpen, setMassDeleteConfirmOpen] = useState(false)
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [errorDialogOpen, setErrorDialogOpen] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const [createOpen, setCreateOpen] = useState(false)
  const [createName, setCreateName] = useState("")
  const [createTrigger, setCreateTrigger] = useState<string>("lead_magnet_signup")
  const [creating, setCreating] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [total, setTotal] = useState(0)
  const pageSize = contextPageSize
  const [sortColumn, setSortColumn] = useState<'name' | 'trigger' | 'status' | 'steps' | 'enrolled' | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  useEffect(() => { loadAutomations() }, [currentSite?.id, currentPage])

  async function loadAutomations() {
    if (!currentSite?.id) { setLoading(true); setAutomations([]); return }
    setLoading(true)
    const { data, total: t, error } = await getAutomationsBySite(currentSite.id, { page: currentPage, pageSize })
    if (error) { setErrorMessage(error); setErrorDialogOpen(true) }
    setAutomations(data ?? [])
    setTotal(t)
    setLoading(false)
  }

  const handleDelete = (id: string) => { setPendingDeleteId(id); setConfirmDialogOpen(true) }

  const confirmDelete = async () => {
    if (!pendingDeleteId) return
    setConfirmDialogOpen(false)
    const { success, error } = await deleteAutomations([pendingDeleteId])
    if (error) { setErrorMessage(error); setErrorDialogOpen(true) }
    if (success) loadAutomations()
    setPendingDeleteId(null)
  }

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => { const next = new Set(prev); if (next.has(id)) { next.delete(id); setAllSelected(false) } else { next.add(id) }; return next })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) { setSelectedIds(new Set()); setAllSelected(false) }
    else setSelectedIds(new Set(filtered.map(a => a.id)))
  }

  // Select all items across all pages (lightweight ID-only fetch)
  const handleSelectAll = async () => {
    if (!currentSite?.id || total === 0) return
    const { ids } = await getAutomationIdsAction(currentSite.id)
    if (ids) {
      setSelectedIds(new Set(ids))
      setAllSelected(true)
    }
  }

  // Clear all selections
  const handleClearSelection = () => {
    setSelectedIds(new Set())
    setAllSelected(false)
  }

  const confirmMassDelete = async () => {
    setMassDeleteConfirmOpen(false)
    setMassDeleting(true)
    const { success, error } = await deleteAutomations(Array.from(selectedIds))
    if (error) { setErrorMessage(error); setErrorDialogOpen(true) }
    if (success) { setSelectedIds(new Set()); setAllSelected(false); loadAutomations() }
    setMassDeleting(false)
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentSite?.id || !createName.trim()) return
    setCreating(true)
    const { data, error } = await createAutomation({
      siteId: currentSite.id,
      name: createName.trim(),
      triggerType: createTrigger as 'lead_magnet_signup' | 'paid_purchase',
    })
    if (error) { setErrorMessage(error); setErrorDialogOpen(true) }
    if (data) { setAutomations(prev => [data, ...prev]); setCreateOpen(false); setCreateName("") }
    setCreating(false)
  }

  const filtered = automations.filter(a => {
    if (filterStatus === 'active') return a.status === 'active'
    if (filterStatus === 'paused') return a.status === 'paused'
    if (filterStatus === 'draft') return a.status === 'draft'
    return true
  })

  const toggleSort = (column: 'name' | 'trigger' | 'status' | 'steps' | 'enrolled') => {
    if (sortColumn === column) {
      if (sortDirection === 'desc') {
        setSortColumn(null)
        setSortDirection('asc')
      } else {
        setSortDirection('desc')
      }
    } else {
      setSortColumn(column)
      setSortDirection('asc')
    }
  }

  const getSortIcon = (column: 'name' | 'trigger' | 'status' | 'steps' | 'enrolled') => {
    if (sortColumn !== column) return <ChevronsUpDown className="h-3 w-3 opacity-70" />
    if (sortDirection === 'asc') return <ArrowUp className="h-3 w-3" />
    return <ArrowDown className="h-3 w-3" />
  }

  const sortedAutomations = [...filtered].sort((a, b) => {
    if (!sortColumn) return 0
    const dir = sortDirection === 'asc' ? 1 : -1
    if (sortColumn === 'name') return a.name.localeCompare(b.name) * dir
    if (sortColumn === 'trigger') return a.trigger_type.localeCompare(b.trigger_type) * dir
    if (sortColumn === 'status') return a.status.localeCompare(b.status) * dir
    if (sortColumn === 'steps') return ((a.steps_count ?? 0) - (b.steps_count ?? 0)) * dir
    if (sortColumn === 'enrolled') return ((a.enrollments_count ?? 0) - (b.enrollments_count ?? 0)) * dir
    return 0
  })

  const statusCounts = {
    all: automations.length,
    active: automations.filter(a => a.status === 'active').length,
    paused: automations.filter(a => a.status === 'paused').length,
    draft: automations.filter(a => a.status === 'draft').length,
  }

  const getStatusBadge = (status: string) => {
    if (status === 'active') return <Badge className="bg-green-100 text-green-800">Active</Badge>
    if (status === 'paused') return <Badge className="bg-yellow-100 text-yellow-800">Paused</Badge>
    return <Badge variant="secondary">Draft</Badge>
  }

  const formatDate = (d: string) => {
    const date = new Date(d)
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
  }

  return (
    <>
      <StickyHeader
        navLinks={[
          { label: "Newsletters", href: "/admin/newsletters", icon: Mail },
          { label: "Contacts", href: "/admin/newsletters/contacts", icon: Users },
          { label: "Segments", href: "/admin/newsletters/segments", icon: Filter },
          { label: "Automations", href: "/admin/newsletters/automations", icon: Zap, active: true },
          { label: "Templates", href: "/admin/newsletters/templates", icon: FileText },
        ]}
      />
      <AdminLayout>
        <div className="w-full">
          <DashboardSubheader
            items={[
              { label: "Newsletters", href: "/admin/newsletters" },
              { label: "Automations" },
            ]}
            tabs={{
              value: filterStatus,
              onValueChange: (v) => { setFilterStatus(v); setSelectedIds(new Set()); setAllSelected(false); setCurrentPage(1) },
              items: [
                { value: "all", label: "All", icon: List, count: statusCounts.all },
                { value: "active", label: "Active", icon: Play, count: statusCounts.active },
                { value: "paused", label: "Paused", icon: Pause, count: statusCounts.paused },
                { value: "draft", label: "Draft", icon: FileEdit, count: statusCounts.draft },
              ],
            }}
            actions={
              <>
                {selectedIds.size > 0 && (
                  <Button variant="destructive" onClick={() => setMassDeleteConfirmOpen(true)} disabled={massDeleting}>
                    <Trash2 className="h-4 w-4" />
                    <span className="hidden sm:inline">Delete ({selectedIds.size})</span>
                  </Button>
                )}
                <Button onClick={() => setCreateOpen(true)}>
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">Create Automation</span>
                </Button>
              </>
            }
          />

          <Card className="shadow-sm">
            <div className="px-6 py-4 border-b bg-muted/30">
              <div className="grid grid-cols-7 gap-4 text-sm font-medium text-muted-foreground">
                <div className="col-span-2 flex items-center space-x-4">
                  <Checkbox checked={filtered.length > 0 && selectedIds.size === filtered.length} onCheckedChange={toggleSelectAll} />
                  <button
                    type="button"
                    onClick={() => toggleSort('name')}
                    className={cn(
                      "flex items-center gap-1.5",
                      "text-[0.8125rem] text-muted-foreground hover:text-foreground",
                      "cursor-pointer outline-none transition-colors"
                    )}
                  >
                    <span>Automation</span>
                    <span className="ml-2 flex h-3.5 w-3.5 items-center justify-center">{getSortIcon('name')}</span>
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => toggleSort('trigger')}
                  className={cn(
                    "flex items-center gap-1.5",
                    "text-[0.8125rem] text-muted-foreground hover:text-foreground",
                    "cursor-pointer outline-none transition-colors"
                  )}
                >
                  <span>Trigger</span>
                  <span className="ml-2 flex h-3.5 w-3.5 items-center justify-center">{getSortIcon('trigger')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => toggleSort('status')}
                  className={cn(
                    "flex items-center gap-1.5",
                    "text-[0.8125rem] text-muted-foreground hover:text-foreground",
                    "cursor-pointer outline-none transition-colors"
                  )}
                >
                  <span>Status</span>
                  <span className="ml-2 flex h-3.5 w-3.5 items-center justify-center">{getSortIcon('status')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => toggleSort('steps')}
                  className={cn(
                    "flex items-center gap-1.5",
                    "text-[0.8125rem] text-muted-foreground hover:text-foreground",
                    "cursor-pointer outline-none transition-colors"
                  )}
                >
                  <span>Steps</span>
                  <span className="ml-2 flex h-3.5 w-3.5 items-center justify-center">{getSortIcon('steps')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => toggleSort('enrolled')}
                  className={cn(
                    "flex items-center gap-1.5",
                    "text-[0.8125rem] text-muted-foreground hover:text-foreground",
                    "cursor-pointer outline-none transition-colors"
                  )}
                >
                  <span>Enrolled</span>
                  <span className="ml-2 flex h-3.5 w-3.5 items-center justify-center">{getSortIcon('enrolled')}</span>
                </button>
                <div>Actions</div>
              </div>
            </div>

            {/* "Select all" banner — shown when all page items selected but more exist */}
            {filtered.length > 0 && selectedIds.size === filtered.length && total > filtered.length && (
              <div className="px-6 py-2 bg-accent/50 border-b text-sm text-center">
                {allSelected ? (
                  <span>All {total} items selected. <button type="button" onClick={handleClearSelection} className="underline hover:text-foreground text-muted-foreground">Clear selection</button></span>
                ) : (
                  <span>{filtered.length} items on this page are selected. <button type="button" onClick={handleSelectAll} className="underline font-medium">Select all {total}</button></span>
                )}
              </div>
            )}

            <div className="divide-y divide-muted/80">
              {loading ? (
                [1, 2, 3].map(i => (
                  <div key={i} className="p-6"><div className="grid grid-cols-7 gap-4 items-center">
                    <div className="col-span-2 flex items-center space-x-4">
                      <div className="w-4 h-4 bg-muted rounded animate-pulse" />
                      <div className="w-10 h-10 bg-muted rounded animate-pulse" />
                      <div className="h-4 bg-muted rounded animate-pulse w-32" />
                    </div>
                    {[1,2,3,4,5].map(j => <div key={j}><div className="h-4 bg-muted rounded animate-pulse w-12" /></div>)}
                  </div></div>
                ))
              ) : filtered.length === 0 ? (
                <div className="p-8 text-center">
                  <Zap className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground mb-4">No email automations yet</p>
                  <Button onClick={() => setCreateOpen(true)} variant="outline">Create Your First Automation</Button>
                </div>
              ) : sortedAutomations.map(automation => (
                <div key={automation.id} className={`p-6 transition-colors ${selectedIds.has(automation.id) ? "bg-accent/50" : ""}`}>
                  <div className="grid grid-cols-7 gap-4 items-center">
                    <div className="col-span-2 flex items-center space-x-4">
                      <Checkbox checked={selectedIds.has(automation.id)} onCheckedChange={() => toggleSelect(automation.id)} />
                      <div className="w-10 h-10 bg-muted rounded flex items-center justify-center ml-2">
                        <Mail className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <Link href={`/admin/newsletters/automations/${automation.id}`} className="hover:opacity-80 transition-opacity">
                        <h4 className="font-medium text-sm hover:underline">{automation.name}</h4>
                        {automation.description && <p className="text-xs text-muted-foreground">{automation.description}</p>}
                      </Link>
                    </div>
                    <div>
                      <Badge variant="outline" className="text-xs">
                        {automation.trigger_type === 'lead_magnet_signup' ? 'Lead Magnet' : 'Purchase'}
                      </Badge>
                    </div>
                    <div>{getStatusBadge(automation.status)}</div>
                    <div><span className="text-sm text-muted-foreground">{automation.steps_count ?? 0}</span></div>
                    <div><span className="text-sm text-muted-foreground">{automation.enrollments_count ?? 0}</span></div>
                    <div className="flex items-center space-x-2">
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => router.push(`/admin/newsletters/automations/${automation.id}`)} title="Edit">
                        <Settings className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-600 hover:text-red-600" onClick={() => handleDelete(automation.id)} title="Delete">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {!loading && total > 0 && (
              <div className="flex items-center justify-between px-6 py-4 border-t">
                <PaginationInfo currentPage={currentPage} pageSize={pageSize} total={total} />
                <Pagination currentPage={currentPage} totalPages={Math.ceil(total / pageSize)} onPageChange={setCurrentPage} showFirstLast={false} />
              </div>
            )}
          </Card>

          {/* Create Dialog */}
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogContent className="w-[840px] max-w-[95vw] p-10" style={{ width: '840px', maxWidth: '95vw' }}>
              <DialogHeader className="mb-6">
                <DialogTitle>Create Email Automation</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-6">
                <div>
                  <Label>Name *</Label>
                  <Input value={createName} onChange={e => setCreateName(e.target.value)} placeholder="e.g. Fitness Lead Magnet Sequence" required />
                </div>
                <div>
                  <Label>Trigger</Label>
                  <Select value={createTrigger} onValueChange={setCreateTrigger}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="lead_magnet_signup">Lead Magnet Signup</SelectItem>
                      <SelectItem value="paid_purchase">Paid Purchase</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex justify-between pt-4">
                  <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={creating || !createName.trim()}>{creating ? "Creating..." : "Create Automation"}</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>

          {/* Delete Confirmations */}
          {confirmDialogOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              <div className="fixed inset-0 bg-black/50" onClick={() => { setConfirmDialogOpen(false); setPendingDeleteId(null) }} />
              <div className="relative bg-background rounded-lg border shadow-lg p-6 w-full max-w-lg z-50">
                <h2 className="text-lg font-semibold mb-2">Delete Automation</h2>
                <p className="text-sm text-muted-foreground mb-4">This will delete the automation and all its steps and enrollments. This cannot be undone.</p>
                <div className="flex justify-end gap-2">
                  <Button onClick={() => { setConfirmDialogOpen(false); setPendingDeleteId(null) }} variant="outline">Cancel</Button>
                  <Button onClick={confirmDelete} variant="destructive">Delete</Button>
                </div>
              </div>
            </div>
          )}
          {massDeleteConfirmOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              <div className="fixed inset-0 bg-black/50" onClick={() => setMassDeleteConfirmOpen(false)} />
              <div className="relative bg-background rounded-lg border shadow-lg p-6 w-full max-w-lg z-50">
                <h2 className="text-lg font-semibold mb-2">Delete {selectedIds.size} Automation{selectedIds.size !== 1 ? "s" : ""}</h2>
                <p className="text-sm text-muted-foreground mb-4">This cannot be undone.</p>
                <div className="flex justify-end gap-2">
                  <Button onClick={() => setMassDeleteConfirmOpen(false)} variant="outline">Cancel</Button>
                  <Button onClick={confirmMassDelete} variant="destructive">Delete {selectedIds.size}</Button>
                </div>
              </div>
            </div>
          )}
          {errorDialogOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              <div className="fixed inset-0 bg-black/50" onClick={() => setErrorDialogOpen(false)} />
              <div className="relative bg-background rounded-lg border shadow-lg p-6 w-full max-w-lg z-50">
                <h2 className="text-lg font-semibold mb-2">Error</h2>
                <p className="text-sm text-muted-foreground mb-4">{errorMessage}</p>
                <div className="flex justify-end"><Button onClick={() => setErrorDialogOpen(false)}>OK</Button></div>
              </div>
            </div>
          )}
        </div>
      </AdminLayout>
    </>
  )
}
