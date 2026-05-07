"use client"

import { useState, useEffect, use } from "react"
import Link from "next/link"
import { getAccountPagePath } from "@/lib/utils/account-page-path"
import { getSiteUrl } from "@/lib/utils/site-url-generator"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { Card } from "@/components/ui/card"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { 
  Dialog,
} from "@/components/ui/dialog"
import {
  AdminModalContent,
  AdminModalDescription,
  AdminModalHeader,
  AdminModalTitle,
} from "@/components/admin/layout/builder/AdminModalLayout"
import {
  AdminBulkDeleteButton,
  AdminConfirmDialog,
  AdminErrorDialog,
  AdminListFooter,
  AdminListSkeleton,
  AdminSelectionBanner,
  AdminSortButton,
  formatRelativeDate,
  useAdminBulkSelection,
  useAdminSort,
} from "@/components/admin/layout/list"

import { Checkbox } from "@/components/ui/checkbox"
import dynamic from "next/dynamic"

const CreateAccountPageModal = dynamic(() =>
  import("@/components/admin/account-page-builder/layout/CreateAccountPageModal").then(m => ({ default: m.CreateAccountPageModal })),
  { ssr: false }
)
const AccountPageSettingsModal = dynamic(() =>
  import("@/components/admin/account-page-builder/layout/AccountPageSettingsModal").then(m => ({ default: m.AccountPageSettingsModal })),
  { ssr: false }
)
import { Eye, Copy, Trash2, Plus, Settings, FileText, Home } from "lucide-react"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import { getAccountPagesAction, deleteAccountPageAction, deleteAccountPagesAction, duplicateAccountPageAction, getAccountPageIdsAction } from "@/lib/actions/account-pages/account-pages-actions"
import type { AccountPage } from "@/lib/actions/account-pages/account-pages-actions"
import type { SiteWithTheme } from "@/lib/actions/sites/site-actions"

interface PageProps {
  params: Promise<{
    siteId: string
  }>
}

type AccountPageSortColumn = 'title' | 'status' | 'modified'

export default function AccountPagesPage({ params }: PageProps) {
  const { siteId } = use(params)
  const { pageSize: contextPageSize } = useSiteSwitcher()
  const [site, setSite] = useState<SiteWithTheme | null>(null)
  const [pages, setPages] = useState<AccountPage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [deletePageId, setDeletePageId] = useState<string | null>(null)
  const [duplicatingPageId, setDuplicatingPageId] = useState<string | null>(null)
  const [settingsPageId, setSettingsPageId] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState<'all' | 'published' | 'draft'>('all')
  const [searchQuery, setSearchQuery] = useState('')

  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [massDeleting, setMassDeleting] = useState(false)
  const [massDeleteConfirmOpen, setMassDeleteConfirmOpen] = useState(false)
  const pageSelection = useAdminBulkSelection()
  const pageSort = useAdminSort<AccountPageSortColumn>()
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

        // Load account pages data
        const { data: pagesData, total: pagesTotal, error: pagesError } = await getAccountPagesAction(siteId, { page: currentPage, pageSize })
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
  }, [siteId, currentPage, pageSize])

  const handleDeletePage = async (pageId: string) => {
    setPendingDeleteId(pageId)
  }

  const confirmDeletePage = async () => {
    if (!pendingDeleteId) return

    const pageIdToDelete = pendingDeleteId

    // Close dialog immediately and clear state
    setPendingDeleteId(null)

    try {
      setDeletePageId(pageIdToDelete)
      const { success, error: deleteError } = await deleteAccountPageAction(pageIdToDelete)

      if (deleteError) {
        setErrorMessage(deleteError)
        return
      }

      if (success) {
        setPages(prev => prev.filter(page => page.id !== pageIdToDelete))
      }
    } catch (err) {
      setErrorMessage('Failed to delete page')
    } finally {
      setDeletePageId(null)
    }
  }

  const cancelDeletePage = () => {
    setPendingDeleteId(null)
  }

  // Select all items across all pages (lightweight ID-only fetch)
  const handleSelectAll = async () => {
    if (total === 0) return
    const { ids } = await getAccountPageIdsAction(siteId)
    if (ids) {
      pageSelection.selectAll(ids)
    }
  }

  const confirmMassDelete = async () => {
    setMassDeleteConfirmOpen(false)
    setMassDeleting(true)
    try {
      const ids = Array.from(pageSelection.selectedIds)
      const idsToDelete = new Set(ids)
      const { success, error: deleteError } = await deleteAccountPagesAction(ids)
      if (deleteError) {
        setErrorMessage(deleteError)
        return
      }
      if (success) {
        setPages(prev => prev.filter(p => !idsToDelete.has(p.id)))
        pageSelection.clearSelection()
      }
    } catch (err) {
      setErrorMessage('Failed to delete pages')
    } finally {
      setMassDeleting(false)
    }
  }

  const handleDuplicatePage = async (pageId: string) => {
    try {
      setDuplicatingPageId(pageId)
      const originalPage = pages.find(p => p.id === pageId)
      const duplicateTitle = `${originalPage?.title || 'Page'} Copy`
      
      const { data, error: duplicateError } = await duplicateAccountPageAction(pageId, duplicateTitle)
      
      if (duplicateError) {
        setErrorMessage(`Failed to duplicate page: ${duplicateError}`)
        return
      }
      
      if (data) {
        setPages(prev => [...prev, data])
      }
    } catch (err) {
      setErrorMessage('Failed to duplicate page')
    } finally {
      setDuplicatingPageId(null)
    }
  }

  const getStatusBadge = (page: AccountPage) => {
    if (page.is_default) {
      return <Badge variant="default" className="bg-blue-100 text-blue-800">Default Page</Badge>
    }
    if (page.is_published) {
      return <Badge variant="default" className="bg-green-100 text-green-800">Published</Badge>
    }
    return <Badge variant="secondary">Draft</Badge>
  }

  const handlePageUpdated = (updatedPage: AccountPage) => {
    setPages(prev => prev.map(p => p.id === updatedPage.id ? updatedPage : p))
  }

  // Filter pages based on status
  const normalizedSearchQuery = searchQuery.trim().toLowerCase()
  const filteredPages = pages.filter(page => {
    let statusMatch = true
    if (filterStatus === 'published') statusMatch = page.is_published
    if (filterStatus === 'draft') statusMatch = !page.is_published

    const searchText = `${page.title} ${page.slug} ${page.meta_description ?? ""}`.toLowerCase()
    const searchMatch = !normalizedSearchQuery || searchText.includes(normalizedSearchQuery)

    return statusMatch && searchMatch
  })

  const sortedPages = [...filteredPages].sort((a, b) => {
    if (!pageSort.sortColumn) return 0
    const dir = pageSort.sortDirection === 'asc' ? 1 : -1
    if (pageSort.sortColumn === 'title') return a.title.localeCompare(b.title) * dir
    if (pageSort.sortColumn === 'status') return (Number(a.is_published) - Number(b.is_published)) * dir
    if (pageSort.sortColumn === 'modified') return (new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()) * dir
    return 0
  })
  const selectablePageIds = filteredPages.filter(p => !p.is_default).map(p => p.id)

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
      <StickyHeader />
      <AdminLayout>
        <div className="w-full">
        <DashboardSubheader
          items={[
            { label: "Pages", href: `/admin/sites/${siteId}/pages` },
            { label: "Account Pages" },
          ]}
          search={{
            value: searchQuery,
            onValueChange: setSearchQuery,
            placeholder: "Search account pages",
          }}
          filterMenu={{
            value: filterStatus,
            onValueChange: (value) => { setFilterStatus(value as 'all' | 'published' | 'draft'); pageSelection.clearSelection(); setCurrentPage(1) },
            items: [
              { value: "all", label: "All", count: statusCounts.all },
              { value: "published", label: "Published", count: statusCounts.published },
              { value: "draft", label: "Draft", count: statusCounts.draft },
            ],
          }}
          preActions={
            <AdminBulkDeleteButton
              deleting={massDeleting}
              onClick={() => setMassDeleteConfirmOpen(true)}
              selectedCount={pageSelection.selectedCount}
            />
          }
          actions={
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4" />
              Create Account Page
            </Button>
          }
        />

        <Card className="shadow-sm">
          
          {/* Table Header */}
          <div className="px-6 py-4 border-b bg-muted/30">
            <div className="grid grid-cols-5 gap-4 text-sm font-medium text-muted-foreground">
              <div className="col-span-2 flex items-center space-x-4">
                  <Checkbox
                    checked={pageSelection.isPageSelected(selectablePageIds)}
                    onCheckedChange={() => pageSelection.togglePage(selectablePageIds)}
                    aria-label="Select all pages"
                  />
                  <AdminSortButton active={pageSort.sortColumn === 'title'} direction={pageSort.sortDirection} onClick={() => pageSort.toggleSort('title')}>
                    Page
                  </AdminSortButton>
                </div>
              <AdminSortButton active={pageSort.sortColumn === 'status'} direction={pageSort.sortDirection} onClick={() => pageSort.toggleSort('status')}>
                Status
              </AdminSortButton>
              <AdminSortButton active={pageSort.sortColumn === 'modified'} direction={pageSort.sortDirection} onClick={() => pageSort.toggleSort('modified')}>
                Modified
              </AdminSortButton>
              <div>Actions</div>
            </div>
          </div>

          {/* "Select all" banner — shown when all page items selected but more exist */}
          <AdminSelectionBanner
            allSelected={pageSelection.allSelected}
            onClearSelection={pageSelection.clearSelection}
            onSelectAll={handleSelectAll}
            selectedCount={pageSelection.selectedCount}
            total={total}
            visibleCount={selectablePageIds.length}
          />

          <div className="divide-y divide-muted/80">
            {loading ? (
              // Skeleton loading state for pages
              <AdminListSkeleton columns={5} rowCount={4} />
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
                <div key={page.id} className={`p-6 transition-colors ${pageSelection.selectedIds.has(page.id) ? 'bg-accent/50' : ''}`}>
                  <div className="grid grid-cols-5 gap-4 items-center">
                    <div className="col-span-2">
                      <div className="flex items-center space-x-4">
                        {!page.is_default ? (
                          <Checkbox
                            checked={pageSelection.selectedIds.has(page.id)}
                            onCheckedChange={() => pageSelection.toggleOne(page.id)}
                            aria-label={`Select ${page.title}`}
                          />
                        ) : (
                          <div className="w-4" />
                        )}
                      <Link
                        href={`/admin/account-pages/builder/${siteId}?page=${page.slug}`}
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
                            {getAccountPagePath(page.slug)}
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
                        {formatRelativeDate(page.updated_at)}
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
                        <a href={site ? `${getSiteUrl(site)}${getAccountPagePath(page.slug)}` : '#'} target="_blank" rel="noopener noreferrer" title="Preview">
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
          {!loading && <AdminListFooter currentPage={currentPage} pageSize={pageSize} total={total} onPageChange={setCurrentPage} />}
        </Card>

        {/* Create Page Dialog */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <AdminModalContent>
            <AdminModalHeader>
              <AdminModalTitle>Create New Account Page</AdminModalTitle>
              <AdminModalDescription>
                Add a new account page to your site. You can customize the content after creation.
              </AdminModalDescription>
            </AdminModalHeader>
            <CreateAccountPageModal
              siteId={siteId}
              onSuccess={(page) => {
                setPages(prev => [...prev, page])
                setShowCreateDialog(false)
              }}
              onCancel={() => setShowCreateDialog(false)}
            />
          </AdminModalContent>
        </Dialog>

        {/* User Dashboard Page Settings Modal */}
        <AccountPageSettingsModal
          open={settingsPageId !== null}
          onOpenChange={(open) => setSettingsPageId(open ? settingsPageId : null)}
          page={pages.find(p => p.id === settingsPageId) || null}
          site={site}
          onSuccess={handlePageUpdated}
        />

        <AdminConfirmDialog
          open={pendingDeleteId !== null}
          title="Delete Page"
          description="Are you sure you want to delete this page? This action cannot be undone."
          onCancel={cancelDeletePage}
          onConfirm={confirmDeletePage}
        />

        <AdminConfirmDialog
          open={massDeleteConfirmOpen}
          title={`Delete ${pageSelection.selectedCount} Page${pageSelection.selectedCount !== 1 ? 's' : ''}`}
          description={`Are you sure you want to delete ${pageSelection.selectedCount} page${pageSelection.selectedCount !== 1 ? 's' : ''}? This action cannot be undone.`}
          confirmLabel={`Delete ${pageSelection.selectedCount} Page${pageSelection.selectedCount !== 1 ? 's' : ''}`}
          onCancel={() => setMassDeleteConfirmOpen(false)}
          onConfirm={confirmMassDelete}
        />

        <AdminErrorDialog
          open={errorMessage !== null}
          message={errorMessage ?? ""}
          onOpenChange={(open) => {
            if (!open) setErrorMessage(null)
          }}
        />
      </div>
      </AdminLayout>
    </>
  )
}
