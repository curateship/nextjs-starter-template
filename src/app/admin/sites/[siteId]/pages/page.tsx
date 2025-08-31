"use client"

import { useState, useEffect, use, useRef } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { AdminLayout, AdminPageHeader, AdminCard } from "@/components/admin/layout/admin-layout"
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { CreatePageModal } from "@/components/admin/page-builder/CreatePageModal"
import { PageSettingsModal } from "@/components/admin/page-builder/PageSettingsModal"
import { Eye, Edit, Copy, Trash2, Plus, Settings, MoreHorizontal, FileText, Home } from "lucide-react"
import { getSitePagesAction, deletePageAction, duplicatePageAction } from "@/lib/actions/pages/page-actions"
import type { Page } from "@/lib/actions/pages/page-actions"
import type { SiteWithTheme } from "@/lib/actions/sites/site-actions"

interface PageProps {
  params: Promise<{
    siteId: string
  }>
}

export default function SitePagesPage({ params }: PageProps) {
  const { siteId } = use(params)
  const router = useRouter()
  const [site, setSite] = useState<SiteWithTheme | null>(null)
  const [pages, setPages] = useState<Page[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [deletePageId, setDeletePageId] = useState<string | null>(null)
  const [duplicatingPageId, setDuplicatingPageId] = useState<string | null>(null)
  const [settingsPageId, setSettingsPageId] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState<'all' | 'published' | 'draft'>('all')
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [errorDialogOpen, setErrorDialogOpen] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const filterRef = useRef<HTMLDivElement>(null)

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

        // Load pages data
        const { data: pagesData, error: pagesError } = await getSitePagesAction(siteId)
        if (pagesError) {
          setError(pagesError)
          return
        }
        
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
  }, [siteId])

  // Close filter dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
        setIsFilterOpen(false)
      }
    }

    if (isFilterOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
      }
    }
  }, [isFilterOpen])

  const handleDeletePage = async (pageId: string) => {
    const page = pages.find(p => p.id === pageId)
    
    // For home page, skip confirmation and go straight to error
    if (page?.slug === 'home') {
      try {
        setDeletePageId(pageId)
        const { success, error: deleteError } = await deletePageAction(pageId)
        
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
    
    try {
      setDeletePageId(pendingDeleteId)
      setConfirmDialogOpen(false)
      const { success, error: deleteError } = await deletePageAction(pendingDeleteId)
      
      if (deleteError) {
        setErrorMessage(deleteError)
        setErrorDialogOpen(true)
        return
      }
      
      if (success) {
        setPages(prev => prev.filter(page => page.id !== pendingDeleteId))
      }
    } catch (err) {
      setErrorMessage('Failed to delete page')
      setErrorDialogOpen(true)
    } finally {
      setDeletePageId(null)
      setPendingDeleteId(null)
    }
  }

  const cancelDeletePage = () => {
    setConfirmDialogOpen(false)
    setPendingDeleteId(null)
  }

  const handleDuplicatePage = async (pageId: string) => {
    try {
      setDuplicatingPageId(pageId)
      const originalPage = pages.find(p => p.id === pageId)
      const duplicateTitle = `${originalPage?.title || 'Page'} Copy`
      
      const { data, error: duplicateError } = await duplicatePageAction(pageId, duplicateTitle)
      
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

  const getStatusBadge = (page: Page) => {
    if (page.is_homepage) {
      return <Badge variant="default" className="bg-blue-100 text-blue-800">Homepage</Badge>
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

  const handlePageUpdated = (updatedPage: Page) => {
    setPages(prev => prev.map(p => p.id === updatedPage.id ? updatedPage : p))
  }

  // Filter pages based on status
  const filteredPages = pages.filter(page => {
    if (filterStatus === 'published') return page.is_published
    if (filterStatus === 'draft') return !page.is_published
    return true // 'all'
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
        <div className="w-full max-w-6xl mx-auto">
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
    <AdminLayout>
      <div className="w-full max-w-6xl mx-auto">
        <AdminPageHeader
          title="Pages"
          subtitle="Manage Pages"
          primaryAction={{
            label: "Create Page",
            onClick: () => setShowCreateDialog(true)
          }}
        />
        
        <AdminCard>
          <div className="p-6 border-b">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-lg font-semibold">Pages List</h3>
                <div className="text-sm text-muted-foreground mt-1">
                  {loading ? (
                    <div className="h-4 bg-muted rounded animate-pulse w-20"></div>
                  ) : (
                    `${filteredPages.length} page${filteredPages.length !== 1 ? 's' : ''} ${filterStatus === 'all' ? 'total' : filterStatus}`
                  )}
                </div>
              </div>
              <div className="relative" ref={filterRef}>
                <Button 
                  variant="outline"
                  onClick={() => setIsFilterOpen(!isFilterOpen)}
                  className="flex items-center space-x-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                  </svg>
                  <span>Filter</span>
                  <svg className={`w-4 h-4 transition-transform ${isFilterOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </Button>
                {isFilterOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-card border rounded-md shadow-lg z-10">
                    <div className="py-1">
                      <button 
                        onClick={() => { setFilterStatus('all'); setIsFilterOpen(false) }}
                        className={`block w-full text-left px-4 py-2 text-sm hover:bg-muted ${
                          filterStatus === 'all' ? 'bg-muted font-medium' : ''
                        }`}
                      >
                        All Pages ({statusCounts.all})
                      </button>
                      <button 
                        onClick={() => { setFilterStatus('published'); setIsFilterOpen(false) }}
                        className={`block w-full text-left px-4 py-2 text-sm hover:bg-muted ${
                          filterStatus === 'published' ? 'bg-muted font-medium' : ''
                        }`}
                      >
                        Published ({statusCounts.published})
                      </button>
                      <button 
                        onClick={() => { setFilterStatus('draft'); setIsFilterOpen(false) }}
                        className={`block w-full text-left px-4 py-2 text-sm hover:bg-muted ${
                          filterStatus === 'draft' ? 'bg-muted font-medium' : ''
                        }`}
                      >
                        Draft ({statusCounts.draft})
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          {/* Table Header */}
          <div className="px-6 py-4 border-b bg-muted/30">
            <div className="grid grid-cols-5 gap-4 text-sm font-medium text-muted-foreground">
              <div className="col-span-2">Page</div>
              <div>Status</div>
              <div>Modified</div>
              <div>Actions</div>
            </div>
          </div>
          
          <div className="divide-y">
            {loading ? (
              // Skeleton loading state for pages
              <div className="space-y-0">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="p-6 border-b">
                    <div className="grid grid-cols-5 gap-4 items-center">
                      <div className="col-span-2">
                        <div className="flex items-center space-x-4">
                          <div className="w-12 h-12 bg-muted rounded animate-pulse"></div>
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
              filteredPages.map((page) => (
                <div key={page.id} className="p-6">
                  <div className="grid grid-cols-5 gap-4 items-center">
                    <div className="col-span-2">
                      <Link 
                        href={`/admin/builder/${siteId}?page=${page.slug}`}
                        className="flex items-center space-x-4 hover:opacity-80 transition-opacity"
                      >
                        <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center">
                          {page.is_homepage ? (
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
                    <div>
                      {getStatusBadge(page)}
                    </div>
                    <div>
                      <span className="text-sm text-muted-foreground">
                        {formatDate(page.updated_at)}
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
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
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-8 w-8 p-0"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Open menu</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuItem asChild>
                            <Link href={`/admin/builder/${siteId}?page=${page.slug}`} className="flex items-center">
                              <Edit className="mr-2 h-4 w-4" />
                              Edit Content
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <a 
                              href={site ? `/${page.slug}` : `#`} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="flex items-center"
                            >
                              <Eye className="mr-2 h-4 w-4" />
                              Preview Page
                            </a>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            onClick={() => handleDuplicatePage(page.id)}
                            disabled={duplicatingPageId === page.id}
                            className="flex items-center"
                          >
                            {duplicatingPageId === page.id ? (
                              <>
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"></div>
                                Duplicating...
                              </>
                            ) : (
                              <>
                                <Copy className="mr-2 h-4 w-4" />
                                Duplicate Page
                              </>
                            )}
                          </DropdownMenuItem>
                          {!page.is_homepage && (
                            <DropdownMenuItem 
                              onClick={() => handleDeletePage(page.id)}
                              disabled={deletePageId === page.id}
                              className="flex items-center text-red-600 focus:text-red-600"
                            >
                              {deletePageId === page.id ? (
                                <>
                                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-600 mr-2"></div>
                                  Deleting...
                                </>
                              ) : (
                                <>
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Delete Page
                                </>
                              )}
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </AdminCard>
        
        {/* Create Page Dialog */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent className="w-[840px] max-w-[95vw]" style={{ width: '840px', maxWidth: '95vw' }}>
            <DialogHeader className="mb-6">
              <DialogTitle>Create New Page</DialogTitle>
            </DialogHeader>
            <CreatePageModal 
              siteId={siteId}
              onSuccess={(page) => {
                setPages(prev => [...prev, page])
                setShowCreateDialog(false)
              }}
              onCancel={() => setShowCreateDialog(false)}
            />  
          </DialogContent>
        </Dialog>

        {/* Page Settings Modal */}
        <PageSettingsModal 
          open={settingsPageId !== null}
          onOpenChange={(open) => setSettingsPageId(open ? settingsPageId : null)}
          page={pages.find(p => p.id === settingsPageId) || null}
          site={site}
          onSuccess={handlePageUpdated}
        />

        {/* Confirmation Dialog */}
        <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Page</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete this page? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-2">
              <Button 
                onClick={cancelDeletePage}
                variant="outline"
              >
                Cancel
              </Button>
              <Button 
                onClick={confirmDeletePage}
                variant="destructive"
              >
                Delete
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Error Dialog */}
        <Dialog open={errorDialogOpen} onOpenChange={setErrorDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Cannot Delete Page</DialogTitle>
              <DialogDescription>
                {errorMessage}
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end">
              <Button 
                onClick={() => setErrorDialogOpen(false)}
                variant="default"
              >
                OK
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  )
}