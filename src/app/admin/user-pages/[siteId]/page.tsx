"use client"

import { useState, useEffect, use } from "react"
import Link from "next/link"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { Card } from "@/components/ui/card"
import { AdminPageHeader } from "@/components/admin/layout/dashboard/AdminPageHeader"
import { StickyHeader } from "@/components/admin/layout/dashboard/StickyHeader"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Checkbox } from "@/components/ui/checkbox"
import dynamic from "next/dynamic"

const CreateUserPageModal = dynamic(() =>
  import("@/components/admin/user-page-builder/layout/CreateUserPageModal").then(m => ({ default: m.CreateUserPageModal })),
  { ssr: false }
)
const UserPageSettingsModal = dynamic(() =>
  import("@/components/admin/user-page-builder/layout/UserPageSettingsModal").then(m => ({ default: m.UserPageSettingsModal })),
  { ssr: false }
)
import { Eye, Copy, Trash2, Plus, Settings, FileText, Home, ArrowUp, ArrowDown, ChevronsUpDown, Users } from "lucide-react"
import { cn } from "@/lib/utils"
import { Pagination, PaginationInfo } from "@/components/ui/pagination"
import { useSiteContext } from "@/contexts/site-context"
import { getUserPagesAction, deleteUserPageAction, deleteUserPagesAction, duplicateUserPageAction } from "@/lib/actions/user-pages/user-pages-actions"
import type { UserPage } from "@/lib/actions/user-pages/user-pages-actions"
import type { SiteWithTheme } from "@/lib/actions/sites/site-actions"

interface PageProps {
  params: Promise<{
    siteId: string
  }>
}

export default function UserUserPagesPage({ params }: PageProps) {
  const { siteId } = use(params)
  const { pageSize: contextPageSize } = useSiteContext()
  const [site, setSite] = useState<SiteWithTheme | null>(null)
  const [pages, setPages] = useState<UserPage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [deletePageId, setDeletePageId] = useState<string | null>(null)
  const [duplicatingPageId, setDuplicatingPageId] = useState<string | null>(null)
  const [settingsPageId, setSettingsPageId] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState<'all' | 'published' | 'draft'>('all')

  const [errorDialogOpen, setErrorDialogOpen] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [selectedPageIds, setSelectedPageIds] = useState<Set<string>>(new Set())
  const [massDeleting, setMassDeleting] = useState(false)
  const [massDeleteConfirmOpen, setMassDeleteConfirmOpen] = useState(false)
  const [sortColumn, setSortColumn] = useState<'title' | 'status' | 'modified' | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [currentPage, setCurrentPage] = useState(1)
  const [total, setTotal] = useState(0)
  const pageSize = contextPageSize


  // Load site and pages data
  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true)
        setError(null)

        // Load site data
        const siteResponse = await fetch(`/api/sites/${siteId}`)
        const siteResult = await siteResponse.json()
        if (!siteResponse.ok || siteResult.error) {
          setError(siteResult.error || 'Failed to load site data')
          return
        }
        setSite(siteResult.data)

        // Load user pages data
        const { data: pagesData, total: pagesTotal, error: pagesError } = await getUserPagesAction(siteId, { page: currentPage, pageSize })
        if (pagesError) {
          setError(pagesError)
          return
        }

        setTotal(pagesTotal)
        if (pagesData) {
          setPages(pagesData)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [siteId, currentPage])


  const handleDeletePage = async (pageId: string) => {
    const page = pages.find(p => p.id === pageId)
    
    // For home page, skip confirmation and go straight to error
    if (page?.slug === 'home') {
      try {
        setDeletePageId(pageId)
        const { success, error: deleteError } = await deleteUserPageAction(pageId)
        
        if (deleteError) {
          setErrorMessage(deleteError)
          setErrorDialogOpen(true)
        }
      } catch (err) {
        setErrorMessage('Failed to delete page')
        setErrorDialogOpen(true)
      } finally {
        setDeletePageId(null)
      }
      return
    }
    
    // For other pages, show confirmation first
    setPendingDeleteId(pageId)
    setConfirmDialogOpen(true)
  }

  const confirmDeletePage = async () => {
    if (!pendingDeleteId) return

    const pageIdToDelete = pendingDeleteId

    // Close dialog immediately and clear state
    setConfirmDialogOpen(false)
    setPendingDeleteId(null)

    try {
      setDeletePageId(pageIdToDelete)
      const { success, error: deleteError } = await deleteUserPageAction(pageIdToDelete)

      if (deleteError) {
        setErrorMessage(deleteError)
        setErrorDialogOpen(true)
        return
      }

      if (success) {
        setPages(prev => prev.filter(page => page.id !== pageIdToDelete))
      }
    } catch (err) {
      setErrorMessage('Failed to delete page')
      setErrorDialogOpen(true)
    } finally {
      setDeletePageId(null)
    }
  }

  const cancelDeletePage = () => {
    setConfirmDialogOpen(false)
    setPendingDeleteId(null)
  }

  const toggleSelectPage = (pageId: string) => {
    setSelectedPageIds(prev => {
      const next = new Set(prev)
      if (next.has(pageId)) next.delete(pageId)
      else next.add(pageId)
      return next
    })
  }

  const toggleSelectAll = () => {
    const selectablePages = filteredPages.filter(p => !p.is_default)
    if (selectedPageIds.size === selectablePages.length) {
      setSelectedPageIds(new Set())
    } else {
      setSelectedPageIds(new Set(selectablePages.map(p => p.id)))
    }
  }

  const confirmMassDelete = async () => {
    setMassDeleteConfirmOpen(false)
    setMassDeleting(true)
    try {
      const ids = Array.from(selectedPageIds)
      const { success, error: deleteError } = await deleteUserPagesAction(ids)
      if (deleteError) {
        setErrorMessage(deleteError)
        setErrorDialogOpen(true)
        return
      }
      if (success) {
        setPages(prev => prev.filter(p => !selectedPageIds.has(p.id)))
        setSelectedPageIds(new Set())
      }
    } catch (err) {
      setErrorMessage('Failed to delete pages')
      setErrorDialogOpen(true)
    } finally {
      setMassDeleting(false)
    }
  }

  const handleDuplicatePage = async (pageId: string) => {
    try {
      setDuplicatingPageId(pageId)
      const originalPage = pages.find(p => p.id === pageId)
      const duplicateTitle = `${originalPage?.title || 'Page'} Copy`
      
      const { data, error: duplicateError } = await duplicateUserPageAction(pageId, duplicateTitle)
      
      if (duplicateError) {
        setErrorMessage(`Failed to duplicate page: ${duplicateError}`)
        setErrorDialogOpen(true)
        return
      }
      
      if (data) {
        setPages(prev => [...prev, data])
      }
    } catch (err) {
      setErrorMessage('Failed to duplicate page')
      setErrorDialogOpen(true)
    } finally {
      setDuplicatingPageId(null)
    }
  }

  const getStatusBadge = (page: UserPage) => {
    if (page.is_default) {
      return <Badge variant="default" className="bg-blue-100 text-blue-800">Default Page</Badge>
    }
    if (page.is_published) {
      return <Badge variant="default" className="bg-green-100 text-green-800">Published</Badge>
    }
    return <Badge variant="secondary">Draft</Badge>
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

  const handlePageUpdated = (updatedPage: UserPage) => {
    setPages(prev => prev.map(p => p.id === updatedPage.id ? updatedPage : p))
  }

  // Filter pages based on status
  const filteredPages = pages.filter(page => {
    if (filterStatus === 'published') return page.is_published
    if (filterStatus === 'draft') return !page.is_published
    return true // 'all'
  })

  const toggleSort = (column: 'title' | 'status' | 'modified') => {
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

  const getSortIcon = (column: 'title' | 'status' | 'modified') => {
    if (sortColumn !== column) return <ChevronsUpDown className="h-3 w-3 opacity-70" />
    if (sortDirection === 'asc') return <ArrowUp className="h-3 w-3" />
    return <ArrowDown className="h-3 w-3" />
  }

  const sortedPages = [...filteredPages].sort((a, b) => {
    if (!sortColumn) return 0
    const dir = sortDirection === 'asc' ? 1 : -1
    if (sortColumn === 'title') return a.title.localeCompare(b.title) * dir
    if (sortColumn === 'status') return (Number(a.is_published) - Number(b.is_published)) * dir
    if (sortColumn === 'modified') return (new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()) * dir
    return 0
  })

  // Get counts for each status
  const statusCounts = {
    all: pages.length,
    published: pages.filter(p => p.is_published).length,
    draft: pages.filter(p => !p.is_published).length
  }

  if (!site && !loading) {
    return (
      <AdminLayout>
        <div className="w-full">
          <div className="text-center py-8">
            <p className="text-red-600 mb-4">Site not found or access denied</p>
            <Button asChild>
              <Link href="/admin/sites">Back to Sites</Link>
            </Button>
          </div>
        </div>
      </AdminLayout>
    )
  }

  return (
    <>
      <StickyHeader
        navLinks={[
          { label: "Pages", href: `/admin/sites/${siteId}/pages`, icon: FileText },
          { label: "User Pages", href: `/admin/user-pages/${siteId}`, icon: Users, active: true },
        ]}
      />
      <AdminLayout>
        <div className="w-full">
        <AdminPageHeader
          title="User Pages"
          primaryAction={{
            label: "Create User Dashboard Page",
            onClick: () => setShowCreateDialog(true)
          }}
          extraContent={
            <div className="flex items-center gap-3">
              {selectedPageIds.size > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setMassDeleteConfirmOpen(true)}
                  disabled={massDeleting}
                >
                  {massDeleting ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white sm:mr-2"></div>
                      <span className="hidden sm:inline">Deleting...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-4 w-4 sm:mr-2" />
                      <span className="hidden sm:inline">Delete ({selectedPageIds.size})</span>
                    </>
                  )}
                </Button>
              )}
              <Tabs value={filterStatus} onValueChange={(value) => { setFilterStatus(value as 'all' | 'published' | 'draft'); setSelectedPageIds(new Set()); setCurrentPage(1) }}>
                <TabsList className="h-auto p-1 gap-1">
                  <TabsTrigger value="all">All ({statusCounts.all})</TabsTrigger>
                  <TabsTrigger value="published">Published ({statusCounts.published})</TabsTrigger>
                  <TabsTrigger value="draft">Draft ({statusCounts.draft})</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          }
        />

        <Card className="shadow-sm">
          
          {/* Table Header */}
          <div className="px-6 py-4 border-b bg-muted/30">
            <div className="grid grid-cols-5 gap-4 text-sm font-medium text-muted-foreground">
              <div className="col-span-2 flex items-center space-x-4">
                  <Checkbox
                    checked={filteredPages.filter(p => !p.is_default).length > 0 && selectedPageIds.size === filteredPages.filter(p => !p.is_default).length}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Select all pages"
                  />
                  <button
                    type="button"
                    onClick={() => toggleSort('title')}
                    className={cn(
                      "flex items-center gap-1.5",
                      "text-[0.8125rem] text-muted-foreground hover:text-foreground",
                      "cursor-pointer outline-none transition-colors"
                    )}
                  >
                    <span>Page</span>
                    <span className="ml-2 flex h-3.5 w-3.5 items-center justify-center">{getSortIcon('title')}</span>
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
              // Skeleton loading state for pages
              <div className="space-y-0">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="p-6 border-b border-muted/80">
                    <div className="grid grid-cols-5 gap-4 items-center">
                      <div className="col-span-2">
                        <div className="flex items-center space-x-4">
                          <div className="w-4 h-4 bg-muted rounded animate-pulse"></div>
                          <div className="w-12 h-12 bg-muted rounded animate-pulse ml-2"></div>
                          <div>
                            <div className="h-4 bg-muted rounded animate-pulse mb-2 w-32"></div>
                            <div className="h-3 bg-muted/60 rounded animate-pulse w-24"></div>
                          </div>
                        </div>
                      </div>
                      <div>
                        <div className="h-6 bg-muted rounded-full animate-pulse w-20"></div>
                      </div>
                      <div>
                        <div className="h-3 bg-muted/60 rounded animate-pulse w-16"></div>
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <div className="h-8 w-8 bg-muted rounded animate-pulse"></div>
                          <div className="h-8 w-8 bg-muted rounded animate-pulse"></div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : error ? (
              <div className="p-8 text-center">
                <p className="text-red-600 mb-4">{error}</p>
                <Button onClick={() => window.location.reload()} variant="outline" size="sm">
                  Try Again
                </Button>
              </div>
            ) : filteredPages.length === 0 ? (
              <div className="p-8 text-center">
                <FileText className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground mb-4">
                  {pages.length === 0 
                    ? 'No pages found' 
                    : `No ${filterStatus === 'all' ? '' : filterStatus} pages found`
                  }
                </p>
                <Button onClick={() => setShowCreateDialog(true)} variant="outline">
                  Create Your First Page
                </Button>
              </div>
            ) : (
              sortedPages.map((page) => (
                <div key={page.id} className={`p-6 transition-colors ${selectedPageIds.has(page.id) ? 'bg-accent/50' : ''}`}>
                  <div className="grid grid-cols-5 gap-4 items-center">
                    <div className="col-span-2">
                      <div className="flex items-center space-x-4">
                        {!page.is_default ? (
                          <Checkbox
                            checked={selectedPageIds.has(page.id)}
                            onCheckedChange={() => toggleSelectPage(page.id)}
                            aria-label={`Select ${page.title}`}
                          />
                        ) : (
                          <div className="w-4" />
                        )}
                      <Link
                        href={`/admin/user-pages/builder/${siteId}?page=${page.slug}`}
                        className="flex items-center space-x-4 hover:opacity-80 transition-opacity"
                      >
                        <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center ml-2">
                          {page.is_default ? (
                            <Home className="h-6 w-6 text-blue-600" />
                          ) : (
                            <FileText className="h-6 w-6 text-muted-foreground" />
                          )}
                        </div>
                        <div>
                          <h4 className="font-medium hover:underline">{page.title}</h4>
                          <p className="text-sm text-muted-foreground">
                            /{page.slug}
                          </p>
                        </div>
                      </Link>
                      </div>
                    </div>
                    <div>
                      {getStatusBadge(page)}
                    </div>
                    <div>
                      <span className="text-sm text-muted-foreground">
                        {formatDate(page.updated_at)}
                      </span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => setSettingsPageId(page.id)}
                        title="Page Settings"
                      >
                        <Settings className="h-4 w-4" />
                        <span className="sr-only">Page Settings</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        asChild
                      >
                        <a href={site ? `http://${site.subdomain}.localhost:3000/${page.slug}` : '#'} target="_blank" rel="noopener noreferrer" title="Preview">
                          <Eye className="h-4 w-4" />
                          <span className="sr-only">Preview</span>
                        </a>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => handleDuplicatePage(page.id)}
                        disabled={duplicatingPageId === page.id}
                        title="Duplicate"
                      >
                        <Copy className="h-4 w-4" />
                        <span className="sr-only">Duplicate</span>
                      </Button>
                      {!page.is_default && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-red-600 hover:text-red-600"
                          onClick={() => handleDeletePage(page.id)}
                          disabled={deletePageId === page.id}
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                          <span className="sr-only">Delete</span>
                        </Button>
                      )}
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

        {/* Create Page Dialog */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent className="w-[840px] max-w-[95vw] p-10" style={{ width: '840px', maxWidth: '95vw' }}>
            <DialogHeader className="mb-6">
              <DialogTitle>Create New Page</DialogTitle>
            </DialogHeader>
            <CreateUserPageModal
              siteId={siteId}
              onSuccess={(page) => {
                setPages(prev => [...prev, page])
                setShowCreateDialog(false)
              }}
              onCancel={() => setShowCreateDialog(false)}
            />
          </DialogContent>
        </Dialog>

        {/* User Dashboard Page Settings Modal */}
        <UserPageSettingsModal
          open={settingsPageId !== null}
          onOpenChange={(open) => setSettingsPageId(open ? settingsPageId : null)}
          page={pages.find(p => p.id === settingsPageId) || null}
          site={site}
          onSuccess={handlePageUpdated}
        />

        {/* Confirmation Dialog */}
        {confirmDialogOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div
              className="fixed inset-0 bg-black/50"
              onClick={cancelDeletePage}
            />
            <div className="relative bg-background rounded-lg border shadow-lg p-6 w-full max-w-lg z-50">
              <h2 className="text-lg font-semibold mb-2">Delete Page</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Are you sure you want to delete this page? This action cannot be undone.
              </p>
              <div className="flex justify-end gap-2">
                <Button onClick={cancelDeletePage} variant="outline">Cancel</Button>
                <Button onClick={confirmDeletePage} variant="destructive">Delete</Button>
              </div>
            </div>
          </div>
        )}

        {/* Mass Delete Confirmation Dialog */}
        {massDeleteConfirmOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div
              className="fixed inset-0 bg-black/50"
              onClick={() => setMassDeleteConfirmOpen(false)}
            />
            <div className="relative bg-background rounded-lg border shadow-lg p-6 w-full max-w-lg z-50">
              <h2 className="text-lg font-semibold mb-2">Delete {selectedPageIds.size} Page{selectedPageIds.size !== 1 ? 's' : ''}</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Are you sure you want to delete {selectedPageIds.size} page{selectedPageIds.size !== 1 ? 's' : ''}? This action cannot be undone.
              </p>
              <div className="flex justify-end gap-2">
                <Button
                  onClick={() => setMassDeleteConfirmOpen(false)}
                  variant="outline"
                >
                  Cancel
                </Button>
                <Button
                  onClick={confirmMassDelete}
                  variant="destructive"
                >
                  Delete {selectedPageIds.size} Page{selectedPageIds.size !== 1 ? 's' : ''}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Error Dialog */}
        {errorDialogOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div
              className="fixed inset-0 bg-black/50"
              onClick={() => setErrorDialogOpen(false)}
            />
            <div className="relative bg-background rounded-lg border shadow-lg p-6 w-full max-w-lg z-50">
              <h2 className="text-lg font-semibold mb-2">Cannot Delete Page</h2>
              <p className="text-sm text-muted-foreground mb-4">
                {errorMessage}
              </p>
              <div className="flex justify-end">
                <Button onClick={() => setErrorDialogOpen(false)} variant="default">OK</Button>
              </div>
            </div>
          </div>
        )}
      </div>
      </AdminLayout>
    </>
  )
}