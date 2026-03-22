"use client"

import { useState, useEffect } from "react"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from "@/components/admin/layout/dashboard/breadcrumb"
import { Card } from "@/components/ui/card"
import { StickyHeader } from "@/components/admin/layout/dashboard/StickyHeader"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import dynamic from "next/dynamic"

const CreateNewsletterModal = dynamic(() =>
  import("@/components/admin/newsletter-builder/layout/CreateNewsletterModal").then(m => ({ default: m.CreateNewsletterModal })),
  { ssr: false }
)
const NewsletterSettingsModal = dynamic(() =>
  import("@/components/admin/newsletter-builder/layout/NewsletterSettingsModal").then(m => ({ default: m.NewsletterSettingsModal })),
  { ssr: false }
)
import type { Newsletter } from "@/components/admin/newsletter-builder/layout/CreateNewsletterModal"
import { getNewslettersBySite, deleteNewsletters, pauseNewsletter, resumeNewsletter, getNewsletterIdsAction } from "@/lib/actions/newsletters/newsletter-actions"
import { Checkbox } from "@/components/ui/checkbox"
import { Mail, Trash2, Settings, ArrowUp, ArrowDown, ChevronsUpDown, Pause, Play, Plus, List, FileEdit, Send, Users, Filter, Zap, FileText, Shield, Clock, HomeIcon, Wand2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Pagination, PaginationInfo } from "@/components/ui/pagination"
import { useSiteContext } from "@/contexts/site-context"
import { useRouter } from "next/navigation"
import Link from "next/link"

export default function NewslettersPage() {
  const { currentSite, pageSize: contextPageSize } = useSiteContext()
  const router = useRouter()
  const [newsletters, setNewsletters] = useState<Newsletter[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [settingsNewsletterId, setSettingsNewsletterId] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState<'all' | 'draft' | 'sent'>('all')

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  // Tracks if user selected all items across all pages
  const [allSelected, setAllSelected] = useState(false)
  const [massDeleting, setMassDeleting] = useState(false)
  const [massDeleteConfirmOpen, setMassDeleteConfirmOpen] = useState(false)
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [errorDialogOpen, setErrorDialogOpen] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const [currentPage, setCurrentPage] = useState(1)
  const [total, setTotal] = useState(0)
  const pageSize = contextPageSize
  const [sortColumn, setSortColumn] = useState<'name' | 'status' | 'recipients' | 'opens' | 'clicks' | 'modified' | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  useEffect(() => {
    loadNewsletters()
  }, [currentSite?.id, currentPage])

  async function loadNewsletters(showSkeleton = true) {
    if (!currentSite?.id) {
      setLoading(true)
      setNewsletters([])
      return
    }

    try {
      if (showSkeleton) setLoading(true)
      const { data, total: t, error } = await getNewslettersBySite(currentSite.id, { page: currentPage, pageSize })
      if (error) {
        setErrorMessage(error)
        setErrorDialogOpen(true)
        setLoading(false)
        return
      }
      setNewsletters(data ?? [])
      setTotal(t)
      setLoading(false)
    } catch {
      setLoading(false)
    }
  }

  const handleDelete = (id: string) => {
    setPendingDeleteId(id)
    setConfirmDialogOpen(true)
  }

  const confirmDelete = async () => {
    if (!pendingDeleteId) return
    setConfirmDialogOpen(false)

    const { success, error } = await deleteNewsletters([pendingDeleteId])
    if (error) {
      setErrorMessage(error)
      setErrorDialogOpen(true)
    }
    if (success) {
      loadNewsletters()
    }
    setPendingDeleteId(null)
  }

  const cancelDelete = () => {
    setConfirmDialogOpen(false)
    setPendingDeleteId(null)
  }

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
        setAllSelected(false)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredNewsletters.length) {
      setSelectedIds(new Set())
      setAllSelected(false)
    } else {
      setSelectedIds(new Set(filteredNewsletters.map(n => n.id)))
    }
  }

  // Select all items across all pages (lightweight ID-only fetch)
  const handleSelectAll = async () => {
    if (!currentSite?.id || total === 0) return
    const { ids } = await getNewsletterIdsAction(currentSite.id)
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
    try {
      const { success, error } = await deleteNewsletters(Array.from(selectedIds))
      if (error) {
        setErrorMessage(error)
        setErrorDialogOpen(true)
        return
      }
      if (success) {
        setSelectedIds(new Set())
        setAllSelected(false)
        loadNewsletters()
      }
    } catch {
      setErrorMessage("Failed to delete newsletters")
      setErrorDialogOpen(true)
    } finally {
      setMassDeleting(false)
    }
  }

  const getStatusBadge = (newsletter: Newsletter) => {
    switch (newsletter.status) {
      case 'sent': return <Badge variant="default" className="bg-green-100 text-green-800">Sent</Badge>
      case 'sending': return <Badge variant="default" className="bg-blue-100 text-blue-800">Sending</Badge>
      case 'paused': return <Badge variant="default" className="bg-orange-100 text-orange-800">Paused</Badge>
      case 'scheduled': return <Badge variant="default" className="bg-yellow-100 text-yellow-800">Scheduled</Badge>
      default: return <Badge variant="secondary">Draft</Badge>
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffTime = Math.abs(now.getTime() - date.getTime())
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

    if (diffDays === 1) return '1 day ago'
    if (diffDays < 7) return `${diffDays} days ago`
    if (diffDays < 30) return `${Math.ceil(diffDays / 7)} weeks ago`
    return `${Math.ceil(diffDays / 30)} months ago`
  }

  const filteredNewsletters = newsletters.filter((n) => {
    if (filterStatus === 'sent') return n.status === 'sent' || n.status === 'sending' || n.status === 'paused'
    if (filterStatus === 'draft') return n.status === 'draft' || n.status === 'scheduled'
    return true
  })

  const toggleSort = (column: 'name' | 'status' | 'recipients' | 'opens' | 'clicks' | 'modified') => {
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

  const getSortIcon = (column: 'name' | 'status' | 'recipients' | 'opens' | 'clicks' | 'modified') => {
    if (sortColumn !== column) return <ChevronsUpDown className="h-3 w-3 opacity-70" />
    if (sortDirection === 'asc') return <ArrowUp className="h-3 w-3" />
    return <ArrowDown className="h-3 w-3" />
  }

  const sortedNewsletters = [...filteredNewsletters].sort((a, b) => {
    if (!sortColumn) return 0
    const dir = sortDirection === 'asc' ? 1 : -1
    if (sortColumn === 'name') return a.subject.localeCompare(b.subject) * dir
    if (sortColumn === 'status') return a.status.localeCompare(b.status) * dir
    if (sortColumn === 'recipients') return (a.total_sent - b.total_sent) * dir
    if (sortColumn === 'opens') {
      const aRate = a.total_sent > 0 ? a.total_opened / a.total_sent : -1
      const bRate = b.total_sent > 0 ? b.total_opened / b.total_sent : -1
      return (aRate - bRate) * dir
    }
    if (sortColumn === 'clicks') {
      const aRate = a.total_sent > 0 ? a.total_clicked / a.total_sent : -1
      const bRate = b.total_sent > 0 ? b.total_clicked / b.total_sent : -1
      return (aRate - bRate) * dir
    }
    if (sortColumn === 'modified') return (new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()) * dir
    return 0
  })

  const statusCounts = {
    all: newsletters.length,
    sent: newsletters.filter((n) => n.status === 'sent' || n.status === 'sending' || n.status === 'paused').length,
    draft: newsletters.filter((n) => n.status === 'draft' || n.status === 'scheduled').length,
  }

  return (
    <>
      <StickyHeader
        navLinks={[
          { label: "Newsletters", href: "/admin/newsletters", icon: Mail, active: true },
          { label: "Contacts", href: "/admin/newsletters/contacts", icon: Users },
          { label: "Segments", href: "/admin/newsletters/segments", icon: Filter },
          { label: "Automations", href: "/admin/newsletters/automations", icon: Zap },
          { label: "Templates", href: "/admin/newsletters/templates", icon: FileText },
          { label: "Email Health", href: "/admin/newsletters/email-health", icon: Shield },
          { label: "Cron Jobs", href: "/admin/newsletters/cron", icon: Clock },
        ]}
      />
      <AdminLayout>
        <div className="w-full">
          {/* Breadcrumb navigation + action buttons */}
          <div className="flex items-center justify-between mb-6 mx-4 mt-2">
            <Breadcrumb>
              <BreadcrumbList className="h-8 gap-2 rounded-md border px-3 text-sm">
                <BreadcrumbItem>
                  <BreadcrumbLink href="/admin">
                    <HomeIcon className="size-4" />
                    <span className="sr-only">Home</span>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>Newsletters</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>

            <div className="flex items-center gap-1.5 sm:gap-3">
              {selectedIds.size > 0 && (
                <Button
                  variant="destructive"
                  onClick={() => setMassDeleteConfirmOpen(true)}
                  disabled={massDeleting}
                >
                  {massDeleting ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                      <span className="hidden sm:inline">Deleting...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-4 w-4" />
                      <span className="hidden sm:inline">Delete ({selectedIds.size})</span>
                    </>
                  )}
                </Button>
              )}
              <Tabs value={filterStatus} onValueChange={(value) => { setFilterStatus(value as 'all' | 'draft' | 'sent'); setSelectedIds(new Set()); setAllSelected(false); setCurrentPage(1) }}>
                <TabsList className="h-9 p-1 gap-1">
                  <TabsTrigger value="all" className="px-2 sm:px-3"><List className="h-3.5 w-3.5 sm:mr-1.5" /><span className="hidden sm:inline">All ({statusCounts.all})</span></TabsTrigger>
                  <TabsTrigger value="draft" className="px-2 sm:px-3"><FileEdit className="h-3.5 w-3.5 sm:mr-1.5" /><span className="hidden sm:inline">Drafts ({statusCounts.draft})</span></TabsTrigger>
                  <TabsTrigger value="sent" className="px-2 sm:px-3"><Send className="h-3.5 w-3.5 sm:mr-1.5" /><span className="hidden sm:inline">Sent ({statusCounts.sent})</span></TabsTrigger>
                </TabsList>
              </Tabs>
              <Button variant="outline" onClick={() => router.push('/admin/newsletters/skills')}>
                <Wand2 className="h-4 w-4" />
                <span className="hidden sm:inline">Create with AI</span>
              </Button>
              <Button onClick={() => setShowCreateDialog(true)}>
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">Create Newsletter</span>
              </Button>
            </div>
          </div>

          <Card className="shadow-sm">
            {/* Table Header */}
            <div className="px-6 py-4 border-b bg-muted/30">
              <div className="grid grid-cols-9 gap-4 text-sm font-medium text-muted-foreground">
                <div className="col-span-3 flex items-center space-x-4">
                  <Checkbox
                    checked={filteredNewsletters.length > 0 && selectedIds.size === filteredNewsletters.length}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Select all newsletters"
                  />
                  <button
                    type="button"
                    onClick={() => toggleSort('name')}
                    className={cn(
                      "flex items-center gap-1.5",
                      "text-[0.8125rem] text-muted-foreground hover:text-foreground",
                      "cursor-pointer outline-none transition-colors"
                    )}
                  >
                    <span>Newsletter</span>
                    <span className="ml-2 flex h-3.5 w-3.5 items-center justify-center">{getSortIcon('name')}</span>
                  </button>
                </div>
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
                  onClick={() => toggleSort('recipients')}
                  className={cn(
                    "flex items-center gap-1.5",
                    "text-[0.8125rem] text-muted-foreground hover:text-foreground",
                    "cursor-pointer outline-none transition-colors"
                  )}
                >
                  <span>Recipients</span>
                  <span className="ml-2 flex h-3.5 w-3.5 items-center justify-center">{getSortIcon('recipients')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => toggleSort('opens')}
                  className={cn(
                    "flex items-center gap-1.5",
                    "text-[0.8125rem] text-muted-foreground hover:text-foreground",
                    "cursor-pointer outline-none transition-colors"
                  )}
                >
                  <span>Opens</span>
                  <span className="ml-2 flex h-3.5 w-3.5 items-center justify-center">{getSortIcon('opens')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => toggleSort('clicks')}
                  className={cn(
                    "flex items-center gap-1.5",
                    "text-[0.8125rem] text-muted-foreground hover:text-foreground",
                    "cursor-pointer outline-none transition-colors"
                  )}
                >
                  <span>Clicks</span>
                  <span className="ml-2 flex h-3.5 w-3.5 items-center justify-center">{getSortIcon('clicks')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => toggleSort('modified')}
                  className={cn(
                    "flex items-center gap-1.5",
                    "text-[0.8125rem] text-muted-foreground hover:text-foreground",
                    "cursor-pointer outline-none transition-colors"
                  )}
                >
                  <span>Modified</span>
                  <span className="ml-2 flex h-3.5 w-3.5 items-center justify-center">{getSortIcon('modified')}</span>
                </button>
                <div>Actions</div>
              </div>
            </div>

            {/* "Select all" banner — shown when all page items selected but more exist */}
            {filteredNewsletters.length > 0 && selectedIds.size === filteredNewsletters.length && total > filteredNewsletters.length && (
              <div className="px-6 py-2 bg-accent/50 border-b text-sm text-center">
                {allSelected ? (
                  <span>All {total} items selected. <button type="button" onClick={handleClearSelection} className="underline hover:text-foreground text-muted-foreground">Clear selection</button></span>
                ) : (
                  <span>{filteredNewsletters.length} items on this page are selected. <button type="button" onClick={handleSelectAll} className="underline font-medium">Select all {total}</button></span>
                )}
              </div>
            )}

            <div className="divide-y divide-muted/80">
              {loading ? (
                <div className="space-y-0">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="p-6 border-b border-muted/80">
                      <div className="grid grid-cols-9 gap-4 items-center">
                        <div className="col-span-3 flex items-center space-x-4">
                          <div className="w-4 h-4 bg-muted rounded animate-pulse" />
                          <div className="w-12 h-12 bg-muted rounded animate-pulse ml-2" />
                          <div>
                            <div className="h-4 bg-muted rounded animate-pulse mb-2 w-40" />
                            <div className="h-3 bg-muted/60 rounded animate-pulse w-24" />
                          </div>
                        </div>
                        <div><div className="h-5 bg-muted rounded-full animate-pulse w-16" /></div>
                        <div><div className="h-3 bg-muted/60 rounded animate-pulse w-10" /></div>
                        <div><div className="h-3 bg-muted/60 rounded animate-pulse w-10" /></div>
                        <div><div className="h-3 bg-muted/60 rounded animate-pulse w-10" /></div>
                        <div><div className="h-3 bg-muted/60 rounded animate-pulse w-16" /></div>
                        <div><div className="h-8 w-8 bg-muted rounded animate-pulse" /></div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : filteredNewsletters.length === 0 ? (
                <div className="p-8 text-center">
                  <Mail className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground mb-4">
                    {newsletters.length === 0
                      ? 'No newsletters found'
                      : `No ${filterStatus === 'all' ? '' : filterStatus} newsletters found`}
                  </p>
                  <Button onClick={() => setShowCreateDialog(true)} variant="outline">
                    Create Your First Newsletter
                  </Button>
                </div>
              ) : (
                sortedNewsletters.map((newsletter) => (
                  <div key={newsletter.id} className={`p-6 transition-colors ${selectedIds.has(newsletter.id) ? "bg-accent/50" : ""}`}>
                    <div className="grid grid-cols-9 gap-4 items-center">
                      <div className="col-span-3">
                        <div className="flex items-center space-x-4">
                          <Checkbox
                            checked={selectedIds.has(newsletter.id)}
                            onCheckedChange={() => toggleSelect(newsletter.id)}
                            aria-label={`Select ${newsletter.subject}`}
                          />
                          <div className="w-12 h-12 bg-muted rounded flex items-center justify-center ml-2">
                            <Mail className="h-6 w-6 text-muted-foreground" />
                          </div>
                          <Link
                            href={`/admin/newsletters/${newsletter.id}`}
                            className="hover:opacity-80 transition-opacity"
                          >
                            <h4 className="font-medium hover:underline">{newsletter.subject}</h4>
                          </Link>
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          {getStatusBadge(newsletter)}
                          {(newsletter.status === 'sending' || newsletter.status === 'paused') && newsletter.metadata?.drip_config?.enabled && (
                            <button
                              type="button"
                              className={`inline-flex items-center justify-center h-6 w-6 rounded ${newsletter.status === 'sending' ? 'text-orange-600 hover:bg-orange-50' : 'text-green-600 hover:bg-green-50'}`}
                              title={newsletter.status === 'sending' ? 'Pause' : 'Resume'}
                              onClick={async (e) => {
                                e.stopPropagation()
                                if (newsletter.status === 'sending') {
                                  await pauseNewsletter(newsletter.id)
                                } else {
                                  await resumeNewsletter(newsletter.id)
                                }
                                await loadNewsletters(false)
                              }}
                            >
                              {newsletter.status === 'sending' ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                            </button>
                          )}
                        </div>
                        {(newsletter.status === 'sending' || newsletter.status === 'paused') && newsletter.metadata?.drip_config?.enabled && (
                          <div className="text-xs text-muted-foreground mt-1">
                            {newsletter.total_sent}/{newsletter.total_recipients} sent
                            {newsletter.metadata.drip_config.batches_sent > 0 && ` · ${newsletter.metadata.drip_config.batches_sent} batches`}
                            {newsletter.metadata.drip_config.total_bounced > 0 && ` · ${newsletter.metadata.drip_config.total_bounced} bounced`}
                            {newsletter.status === 'paused' && newsletter.metadata.drip_config.paused_reason && (
                              <span className="block text-orange-600">{newsletter.metadata.drip_config.paused_reason}</span>
                            )}
                          </div>
                        )}
                      </div>
                      <div>
                        <span className="text-sm text-muted-foreground">
                          {newsletter.total_sent > 0
                            ? newsletter.total_sent.toLocaleString()
                            : "—"}
                        </span>
                      </div>
                      <div>
                        <span className="text-sm text-muted-foreground">
                          {newsletter.total_sent > 0
                            ? `${Math.round((newsletter.total_opened / newsletter.total_sent) * 100)}%`
                            : "—"}
                        </span>
                      </div>
                      <div>
                        <span className="text-sm text-muted-foreground">
                          {newsletter.total_sent > 0
                            ? `${Math.round((newsletter.total_clicked / newsletter.total_sent) * 100)}%`
                            : "—"}
                        </span>
                      </div>
                      <div>
                        <span className="text-sm text-muted-foreground">
                          {formatDate(newsletter.updated_at)}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => setSettingsNewsletterId(newsletter.id)}
                          title="Newsletter Settings"
                        >
                          <Settings className="h-4 w-4" />
                          <span className="sr-only">Newsletter Settings</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-red-600 hover:text-red-600"
                          onClick={() => handleDelete(newsletter.id)}
                          title="Delete Newsletter"
                        >
                          <Trash2 className="h-4 w-4" />
                          <span className="sr-only">Delete Newsletter</span>
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            {!loading && total > 0 && (
              <div className="flex items-center justify-between px-6 py-4 border-t">
                <PaginationInfo currentPage={currentPage} pageSize={pageSize} total={total} />
                <Pagination currentPage={currentPage} totalPages={Math.ceil(total / pageSize)} onPageChange={setCurrentPage} showFirstLast={false} />
              </div>
            )}
          </Card>

          {/* Create Newsletter Dialog */}
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogContent className="w-[840px] max-w-[95vw] p-10" style={{ width: '840px', maxWidth: '95vw' }}>
              <DialogHeader className="mb-6">
                <DialogTitle>Create New Newsletter</DialogTitle>
              </DialogHeader>
              <CreateNewsletterModal
                onSuccess={(newsletter) => {
                  setShowCreateDialog(false)
                  router.push(`/admin/newsletters/${newsletter.id}`)
                }}
                onCancel={() => setShowCreateDialog(false)}
              />
            </DialogContent>
          </Dialog>

          {/* Newsletter Settings Modal */}
          <NewsletterSettingsModal
            open={settingsNewsletterId !== null}
            onOpenChange={(open) => setSettingsNewsletterId(open ? settingsNewsletterId : null)}
            newsletter={newsletters.find((n) => n.id === settingsNewsletterId) || null}
            siteId={currentSite?.id || ''}
            onSuccess={(updated) => {
              setNewsletters((prev) => prev.map((n) => (n.id === updated.id ? updated : n)))
            }}
          />

          {/* Confirmation Dialog */}
          {confirmDialogOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              <div className="fixed inset-0 bg-black/50" onClick={cancelDelete} />
              <div className="relative bg-background rounded-lg border shadow-lg p-6 w-full max-w-lg z-50">
                <h2 className="text-lg font-semibold mb-2">Delete Newsletter</h2>
                <p className="text-sm text-muted-foreground mb-4">
                  Are you sure you want to delete this newsletter? This action cannot be undone.
                </p>
                <div className="flex justify-end gap-2">
                  <Button onClick={cancelDelete} variant="outline">Cancel</Button>
                  <Button onClick={confirmDelete} variant="destructive">Delete</Button>
                </div>
              </div>
            </div>
          )}

          {/* Mass Delete Confirmation */}
          {massDeleteConfirmOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              <div className="fixed inset-0 bg-black/50" onClick={() => setMassDeleteConfirmOpen(false)} />
              <div className="relative bg-background rounded-lg border shadow-lg p-6 w-full max-w-lg z-50">
                <h2 className="text-lg font-semibold mb-2">Delete {selectedIds.size} Newsletter{selectedIds.size !== 1 ? "s" : ""}</h2>
                <p className="text-sm text-muted-foreground mb-4">
                  Are you sure you want to delete {selectedIds.size} newsletter{selectedIds.size !== 1 ? "s" : ""}? This action cannot be undone.
                </p>
                <div className="flex justify-end gap-2">
                  <Button onClick={() => setMassDeleteConfirmOpen(false)} variant="outline">Cancel</Button>
                  <Button onClick={confirmMassDelete} variant="destructive">
                    Delete {selectedIds.size} Newsletter{selectedIds.size !== 1 ? "s" : ""}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Error Dialog */}
          {errorDialogOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              <div className="fixed inset-0 bg-black/50" onClick={() => setErrorDialogOpen(false)} />
              <div className="relative bg-background rounded-lg border shadow-lg p-6 w-full max-w-lg z-50">
                <h2 className="text-lg font-semibold mb-2">Error</h2>
                <p className="text-sm text-muted-foreground mb-4">{errorMessage}</p>
                <div className="flex justify-end">
                  <Button onClick={() => setErrorDialogOpen(false)}>OK</Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </AdminLayout>

    </>
  )
}
