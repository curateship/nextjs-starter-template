"use client"

import { useState, useEffect } from "react"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { AdminPageHeader } from "@/components/admin/layout/dashboard/AdminPageHeader"
import { Card } from "@/components/ui/card"
import { StickyHeader } from "@/components/admin/newsletter-builder/layout/StickyHeader"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CreateNewsletterModal } from "@/components/admin/newsletter-builder/layout/CreateNewsletterModal"
import { NewsletterSettingsModal } from "@/components/admin/newsletter-builder/layout/NewsletterSettingsModal"
import type { Newsletter } from "@/components/admin/newsletter-builder/layout/CreateNewsletterModal"
import { getNewslettersBySite, deleteNewsletters } from "@/lib/actions/newsletters/newsletter-actions"
import { Checkbox } from "@/components/ui/checkbox"
import { Mail, Trash2, Settings, ArrowUp, ArrowDown, ChevronsUpDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { useSiteContext } from "@/contexts/site-context"

export default function NewslettersPage() {
  const { currentSite } = useSiteContext()
  const [newsletters, setNewsletters] = useState<Newsletter[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [settingsNewsletterId, setSettingsNewsletterId] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState<'all' | 'draft' | 'sent'>('all')

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [massDeleting, setMassDeleting] = useState(false)
  const [massDeleteConfirmOpen, setMassDeleteConfirmOpen] = useState(false)
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [errorDialogOpen, setErrorDialogOpen] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const [sortColumn, setSortColumn] = useState<'name' | 'status' | 'opens' | 'clicks' | 'modified' | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  useEffect(() => {
    loadNewsletters()
  }, [currentSite?.id])

  async function loadNewsletters() {
    if (!currentSite?.id) {
      setLoading(true)
      setNewsletters([])
      return
    }

    try {
      setLoading(true)
      const { data, error } = await getNewslettersBySite(currentSite.id)
      if (error) {
        setErrorMessage(error)
        setErrorDialogOpen(true)
        setLoading(false)
        return
      }
      setNewsletters(data ?? [])
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
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredNewsletters.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredNewsletters.map(n => n.id)))
    }
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
    if (filterStatus === 'sent') return n.status === 'sent' || n.status === 'sending'
    if (filterStatus === 'draft') return n.status === 'draft' || n.status === 'scheduled'
    return true
  })

  const toggleSort = (column: 'name' | 'status' | 'opens' | 'clicks' | 'modified') => {
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

  const getSortIcon = (column: 'name' | 'status' | 'opens' | 'clicks' | 'modified') => {
    if (sortColumn !== column) return <ChevronsUpDown className="h-3 w-3 opacity-70" />
    if (sortDirection === 'asc') return <ArrowUp className="h-3 w-3" />
    return <ArrowDown className="h-3 w-3" />
  }

  const sortedNewsletters = [...filteredNewsletters].sort((a, b) => {
    if (!sortColumn) return 0
    const dir = sortDirection === 'asc' ? 1 : -1
    if (sortColumn === 'name') return a.name.localeCompare(b.name) * dir
    if (sortColumn === 'status') return a.status.localeCompare(b.status) * dir
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
    sent: newsletters.filter((n) => n.status === 'sent' || n.status === 'sending').length,
    draft: newsletters.filter((n) => n.status === 'draft' || n.status === 'scheduled').length,
  }

  return (
    <>
      <StickyHeader
        breadcrumbItems={[
          { href: "/admin", label: "Dashboard" },
          { label: "Newsletters", isPage: true },
        ]}
        navLinks={[
          { label: "Newsletters", href: "/admin/newsletters", active: true },
          { label: "Contacts", href: "/admin/newsletters/contacts" },
          { label: "Automations", href: "/admin/newsletters/automations" },
          { label: "Email Health", href: "/admin/newsletters/email-health" },
        ]}
      />
      <AdminLayout>
        <div className="w-full">
          <AdminPageHeader
            title="Newsletters"
            primaryAction={{
              label: "Create Newsletter",
              onClick: () => setShowCreateDialog(true),
            }}
            extraContent={
              <div className="flex items-center gap-3">
                {selectedIds.size > 0 && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setMassDeleteConfirmOpen(true)}
                    disabled={massDeleting}
                  >
                    {massDeleting ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                        Deleting...
                      </>
                    ) : (
                      <>
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete ({selectedIds.size})
                      </>
                    )}
                  </Button>
                )}
                <Tabs value={filterStatus} onValueChange={(value) => { setFilterStatus(value as 'all' | 'draft' | 'sent'); setSelectedIds(new Set()) }}>
                  <TabsList className="gap-1">
                    <TabsTrigger value="all">All ({statusCounts.all})</TabsTrigger>
                    <TabsTrigger value="draft">Drafts ({statusCounts.draft})</TabsTrigger>
                    <TabsTrigger value="sent">Sent ({statusCounts.sent})</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            }
          />

          <Card className="shadow-sm">
            {/* Table Header */}
            <div className="px-6 py-4 border-b bg-muted/30">
              <div className="grid grid-cols-8 gap-4 text-sm font-medium text-muted-foreground">
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

            <div className="divide-y divide-muted/80">
              {loading ? (
                <div className="space-y-0">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="p-6 border-b border-muted/80">
                      <div className="grid grid-cols-8 gap-4 items-center">
                        <div className="col-span-3 flex items-center space-x-4">
                          <div className="w-12 h-12 bg-muted rounded animate-pulse" />
                          <div>
                            <div className="h-4 bg-muted rounded animate-pulse mb-2 w-40" />
                            <div className="h-3 bg-muted/60 rounded animate-pulse w-24" />
                          </div>
                        </div>
                        <div><div className="h-5 bg-muted rounded-full animate-pulse w-16" /></div>
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
                    <div className="grid grid-cols-8 gap-4 items-center">
                      <div className="col-span-3">
                        <div className="flex items-center space-x-4">
                          <Checkbox
                            checked={selectedIds.has(newsletter.id)}
                            onCheckedChange={() => toggleSelect(newsletter.id)}
                            aria-label={`Select ${newsletter.name}`}
                          />
                          <div className="w-12 h-12 bg-muted rounded flex items-center justify-center ml-2">
                            <Mail className="h-6 w-6 text-muted-foreground" />
                          </div>
                          <a
                            href={`/admin/newsletters/${newsletter.id}`}
                            className="hover:opacity-80 transition-opacity"
                          >
                            <h4 className="font-medium hover:underline">{newsletter.name}</h4>
                            {newsletter.subject && newsletter.subject !== newsletter.name && (
                              <p className="text-sm text-muted-foreground">{newsletter.subject}</p>
                            )}
                          </a>
                        </div>
                      </div>
                      <div>{getStatusBadge(newsletter)}</div>
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
          </Card>

          {/* Create Newsletter Dialog */}
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogContent className="w-[840px] max-w-[95vw] p-10" style={{ width: '840px', maxWidth: '95vw' }}>
              <DialogHeader className="mb-6">
                <DialogTitle>Create New Newsletter</DialogTitle>
              </DialogHeader>
              <CreateNewsletterModal
                onSuccess={(newsletter) => {
                  setNewsletters((prev) => [newsletter, ...prev])
                  setShowCreateDialog(false)
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
