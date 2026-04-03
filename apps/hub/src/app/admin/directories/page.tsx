"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { getSiteUrl } from "@/lib/utils/site-url-generator"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { Card } from "@/components/ui/card"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { Button } from "@/components/ui/button"
import { StickyHeader } from "@/components/admin/layout/dashboard/StickyHeader"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogPortal,
} from "@/components/ui/dialog"

import { Checkbox } from "@/components/ui/checkbox"
import dynamic from "next/dynamic"

const CreateDirectoryModal = dynamic(() =>
  import("@/components/admin/directory-builder/layout/CreateDirectoryModal").then(m => ({ default: m.CreateDirectoryModal })),
  { ssr: false }
)
const DirectorySettingsModal = dynamic(() =>
  import("@/components/admin/directory-builder/layout/DirectorySettingsModal").then(m => ({ default: m.DirectorySettingsModal })),
  { ssr: false }
)
import { Eye, Copy, Trash2, Settings, FolderOpen, X, ArrowUp, ArrowDown, ChevronsUpDown, Plus, List, Globe, FileEdit } from "lucide-react"
import { cn } from "@/lib/utils"
import { getDirectoryAdminNavLinks } from "@/components/admin/directory-builder/custom-blocks/directory-nav-links"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { Pagination, PaginationInfo } from "@/components/ui/pagination"
import { getSiteDirectoriesWithCategoriesAction, deleteDirectoryAction, deleteDirectoriesAction, duplicateDirectoryAction, getDirectoryIdsAction } from "@/lib/actions/directories/directory-actions"
import type { CategoryInfo } from "@/lib/actions/categories/category-relationship-actions"
import { useSiteSwitcher } from "@/components/admin/site-switcher/site-switcher-provider"
import type { Directory } from "@/lib/actions/directories/directory-actions"

export default function DirectoriesPage() {
  const router = useRouter()
  const { currentSite, pageSize: contextPageSize } = useSiteSwitcher()
  const [directories, setDirectories] = useState<Directory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [deleteDirectoryId, setDeleteDirectoryId] = useState<string | null>(null)
  const [duplicatingDirectoryId, setDuplicatingDirectoryId] = useState<string | null>(null)
  const [settingsDirectoryId, setSettingsDirectoryId] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState<'all' | 'published' | 'draft'>('all')
  const [filterPrivacy, setFilterPrivacy] = useState<'all' | 'public' | 'private'>('all')
  const [directoryCategories, setDirectoryCategories] = useState<Record<string, CategoryInfo[]>>({})

  const [errorDialogOpen, setErrorDialogOpen] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [selectedDirectoryIds, setSelectedDirectoryIds] = useState<Set<string>>(new Set())
  // Tracks if user selected all items across all pages
  const [allSelected, setAllSelected] = useState(false)
  const [massDeleting, setMassDeleting] = useState(false)
  const [massDeleteConfirmOpen, setMassDeleteConfirmOpen] = useState(false)
  const [sortColumn, setSortColumn] = useState<'title' | 'category' | 'status' | 'modified' | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [currentPage, setCurrentPage] = useState(1)
  const [total, setTotal] = useState(0)
  const pageSize = contextPageSize


  // Load directories
  useEffect(() => {
    async function loadDirectories() {
      if (!currentSite?.id) {
        setLoading(true)
        setDirectories([])
        return
      }

      try {
        setLoading(true)
        setError(null)

        const { data: directoriesData, categories, total: directoriesTotal, error: directoriesError } = await getSiteDirectoriesWithCategoriesAction(currentSite.id, { page: currentPage, pageSize })
        if (directoriesError) {
          setError(directoriesError)
          setLoading(false)
          return
        }

        if (directoriesData) {
          setDirectories(directoriesData)
          setTotal(directoriesTotal)
          if (categories) setDirectoryCategories(categories)
        }
        setLoading(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load directories')
        setLoading(false)
      }
    }

    loadDirectories()
  }, [currentSite?.id, currentPage])


  const handleDeleteDirectory = async (directoryId: string) => {
    setPendingDeleteId(directoryId)
    setConfirmDialogOpen(true)
  }

  const confirmDeleteDirectory = async () => {
    if (!pendingDeleteId) return

    const directoryIdToDelete = pendingDeleteId

    // Close dialog immediately and clear state
    setConfirmDialogOpen(false)
    setPendingDeleteId(null)

    try {
      setDeleteDirectoryId(directoryIdToDelete)
      const { success, error: deleteError } = await deleteDirectoryAction(directoryIdToDelete)

      if (deleteError) {
        setErrorMessage(deleteError)
        setErrorDialogOpen(true)
        return
      }

      if (success) {
        setDirectories(prev => prev.filter(directory => directory.id !== directoryIdToDelete))
      }
    } catch (err) {
      setErrorMessage('Failed to delete directory')
      setErrorDialogOpen(true)
    } finally {
      setDeleteDirectoryId(null)
    }
  }

  const cancelDeleteDirectory = () => {
    setConfirmDialogOpen(false)
    setPendingDeleteId(null)
  }

  const toggleSelectDirectory = (directoryId: string) => {
    setSelectedDirectoryIds(prev => {
      const next = new Set(prev)
      if (next.has(directoryId)) {
        next.delete(directoryId)
        setAllSelected(false)
      } else {
        next.add(directoryId)
      }
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedDirectoryIds.size === filteredDirectories.length) {
      setSelectedDirectoryIds(new Set())
      setAllSelected(false)
    } else {
      setSelectedDirectoryIds(new Set(filteredDirectories.map(d => d.id)))
    }
  }

  // Select all items across all pages (lightweight ID-only fetch)
  const handleSelectAll = async () => {
    if (!currentSite?.id || total === 0) return
    const { ids } = await getDirectoryIdsAction(currentSite.id)
    if (ids) {
      setSelectedDirectoryIds(new Set(ids))
      setAllSelected(true)
    }
  }

  // Clear all selections
  const handleClearSelection = () => {
    setSelectedDirectoryIds(new Set())
    setAllSelected(false)
  }

  const confirmMassDelete = async () => {
    setMassDeleteConfirmOpen(false)
    setMassDeleting(true)
    try {
      const ids = Array.from(selectedDirectoryIds)
      const { success, error: deleteError } = await deleteDirectoriesAction(ids)
      if (deleteError) {
        setErrorMessage(deleteError)
        setErrorDialogOpen(true)
        return
      }
      if (success) {
        setDirectories(prev => prev.filter(d => !selectedDirectoryIds.has(d.id)))
        setSelectedDirectoryIds(new Set())
        setAllSelected(false)
      }
    } catch (err) {
      setErrorMessage('Failed to delete directories')
      setErrorDialogOpen(true)
    } finally {
      setMassDeleting(false)
    }
  }

  const handleDuplicateDirectory = async (directoryId: string) => {
    try {
      setDuplicatingDirectoryId(directoryId)
      const originalDirectory = directories.find(d => d.id === directoryId)
      const duplicateTitle = `${originalDirectory?.title || 'Directory'} Copy`
      
      const { data, error: duplicateError } = await duplicateDirectoryAction(directoryId, duplicateTitle)
      
      if (duplicateError) {
        setErrorMessage(`Failed to duplicate directory: ${duplicateError}`)
        setErrorDialogOpen(true)
        return
      }
      
      if (data) {
        setDirectories(prev => [...prev, data])
      }
    } catch (err) {
      setErrorMessage('Failed to duplicate directory')
      setErrorDialogOpen(true)
    } finally {
      setDuplicatingDirectoryId(null)
    }
  }

  const getStatusBadge = (directory: Directory) => {
    if (directory.is_published) {
      return <Badge variant="default" className="bg-green-100 text-green-800">Published</Badge>
    }
    return <Badge variant="secondary">Draft</Badge>
  }

  const isDirectoryPrivate = (directory: Directory) => {
    return directory.content_blocks?._settings?.is_private === true
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

  const handleDirectoryUpdated = (updatedDirectory: Directory) => {
    setDirectories(prev => prev.map(d => d.id === updatedDirectory.id ? updatedDirectory : d))
  }

  // Filter directories based on status and privacy
  const filteredDirectories = directories.filter(directory => {
    // Status filter
    let statusMatch = true
    if (filterStatus === 'published') statusMatch = directory.is_published
    if (filterStatus === 'draft') statusMatch = !directory.is_published
    
    // Privacy filter - only filter when "private" is selected
    let privacyMatch = true
    if (filterPrivacy === 'private') privacyMatch = isDirectoryPrivate(directory)
    
    return statusMatch && privacyMatch
  })

  const toggleSort = (column: 'title' | 'category' | 'status' | 'modified') => {
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

  const getSortIcon = (column: 'title' | 'category' | 'status' | 'modified') => {
    if (sortColumn !== column) return <ChevronsUpDown className="h-3 w-3 opacity-70" />
    if (sortDirection === 'asc') return <ArrowUp className="h-3 w-3" />
    return <ArrowDown className="h-3 w-3" />
  }

  const sortedDirectories = [...filteredDirectories].sort((a, b) => {
    if (!sortColumn) return 0
    const dir = sortDirection === 'asc' ? 1 : -1
    if (sortColumn === 'title') return a.title.localeCompare(b.title) * dir
    if (sortColumn === 'status') return (Number(a.is_published) - Number(b.is_published)) * dir
    if (sortColumn === 'category') {
      const aCat = directoryCategories[a.id]?.[0]?.title || '\uffff'
      const bCat = directoryCategories[b.id]?.[0]?.title || '\uffff'
      return aCat.localeCompare(bCat) * dir
    }
    if (sortColumn === 'modified') return (new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()) * dir
    return 0
  })

  // Get counts for each status
  const statusCounts = {
    all: directories.length,
    published: directories.filter(d => d.is_published).length,
    draft: directories.filter(d => !d.is_published).length
  }

  // Get counts for each privacy level
  const privacyCounts = {
    all: directories.length,
    public: directories.filter(d => !isDirectoryPrivate(d)).length,
    private: directories.filter(d => isDirectoryPrivate(d)).length
  }


  return (
    <>
      <StickyHeader navLinks={getDirectoryAdminNavLinks('directory')} />
      <AdminLayout>
        <div className="w-full">
          {/* Breadcrumb navigation + action buttons */}
          <DashboardSubheader
            items={[{ label: "Directory" }]}
            tabs={{
              value: filterStatus,
              onValueChange: (value) => { setFilterStatus(value as 'all' | 'published' | 'draft'); setSelectedDirectoryIds(new Set()); setAllSelected(false); setCurrentPage(1) },
              items: [
                { value: "all", label: "All", icon: List, count: statusCounts.all },
                { value: "published", label: "Published", icon: Globe, count: statusCounts.published },
                { value: "draft", label: "Draft", icon: FileEdit, count: statusCounts.draft },
              ],
            }}
            preActions={
              selectedDirectoryIds.size > 0 ? (
                <Button
                  variant="destructive"
                  onClick={() => setMassDeleteConfirmOpen(true)}
                  disabled={massDeleting}
                >
                  {massDeleting ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      <span className="hidden sm:inline">Deleting...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-4 w-4" />
                      <span className="hidden sm:inline">Delete ({selectedDirectoryIds.size})</span>
                    </>
                  )}
                </Button>
              ) : undefined
            }
            actions={
              <Button onClick={() => setShowCreateDialog(true)}>
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">Create Item</span>
              </Button>
            }
          />

          <Card className="shadow-sm">
            {/* Table Header */}
            <div className="px-6 py-4 border-b bg-muted/30">
              <div className="grid grid-cols-6 gap-4 text-sm font-medium text-muted-foreground">
                <div className="col-span-2 flex items-center space-x-4">
                  <Checkbox
                    checked={filteredDirectories.length > 0 && selectedDirectoryIds.size === filteredDirectories.length}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Select all directories"
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
                    <span>Directory</span>
                    <span className="ml-2 flex h-3.5 w-3.5 items-center justify-center">{getSortIcon('title')}</span>
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => toggleSort('category')}
                  className={cn(
                    "flex items-center gap-1.5",
                    "text-[0.8125rem] text-muted-foreground hover:text-foreground",
                    "cursor-pointer outline-none transition-colors"
                  )}
                >
                  <span>Category</span>
                  <span className="ml-2 flex h-3.5 w-3.5 items-center justify-center">{getSortIcon('category')}</span>
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
            {filteredDirectories.length > 0 && selectedDirectoryIds.size === filteredDirectories.length && total > filteredDirectories.length && (
              <div className="px-6 py-2 bg-accent/50 border-b text-sm text-center">
                {allSelected ? (
                  <span>All {total} items selected. <button type="button" onClick={handleClearSelection} className="underline hover:text-foreground text-muted-foreground">Clear selection</button></span>
                ) : (
                  <span>{filteredDirectories.length} items on this page are selected. <button type="button" onClick={handleSelectAll} className="underline font-medium">Select all {total}</button></span>
                )}
              </div>
            )}

            <div className="divide-y divide-muted/80">
              {loading ? (
                // Skeleton loading state for directories
                <div className="space-y-0">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="p-6 border-b border-muted/80">
                      <div className="grid grid-cols-6 gap-4 items-center">
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
                          <div className="h-5 bg-muted rounded-full animate-pulse w-16"></div>
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
              ) : filteredDirectories.length === 0 ? (
                <div className="p-8 text-center">
                  <FolderOpen className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground mb-4">
                    {directories.length === 0 
                      ? 'No directories found' 
                      : `No ${filterStatus === 'all' && filterPrivacy === 'all' ? '' : 
                          `${filterStatus === 'all' ? '' : filterStatus}${filterStatus !== 'all' && filterPrivacy === 'private' ? ', ' : ''}${filterPrivacy === 'private' ? 'private ' : ''}`
                        }directories found`
                    }
                  </p>
                  <Button onClick={() => setShowCreateDialog(true)} variant="outline">
                    Create Your First Directory
                  </Button>
                </div>
              ) : (
                sortedDirectories.map((directory) => (
                  <div key={directory.id} className={`p-6 transition-colors ${selectedDirectoryIds.has(directory.id) ? 'bg-accent/50' : ''}`}>
                    <div className="grid grid-cols-6 gap-4 items-center">
                      <div className="col-span-2">
                        <div className="flex items-center space-x-4">
                          <Checkbox
                            checked={selectedDirectoryIds.has(directory.id)}
                            onCheckedChange={() => toggleSelectDirectory(directory.id)}
                            aria-label={`Select ${directory.title}`}
                          />
                        <Link
                          href={`/admin/directories/builder/${directory.site_id}?directory=${directory.slug}`}
                          className="flex items-center space-x-4 hover:opacity-80 transition-opacity"
                        >
                          <div className="w-12 h-12 bg-muted rounded flex items-center justify-center overflow-hidden ml-2">
                            {directory.featured_image ? (
                              <img
                                src={directory.featured_image}
                                alt={directory.title}
                                className="w-full h-full object-contain"
                              />
                            ) : (
                              <FolderOpen className="h-6 w-6 text-muted-foreground" />
                            )}
                          </div>
                          <div>
                            <h4 className="font-medium hover:underline">{directory.title}</h4>
                            <p className="text-sm text-muted-foreground">
                              /directories/{directory.slug}
                            </p>
                          </div>
                        </Link>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {directoryCategories[directory.id]?.length ? (
                          directoryCategories[directory.id].map((cat) => (
                            <Badge key={cat.id} variant="outline" className="text-xs">
                              {cat.title}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </div>
                      <div>
                        {getStatusBadge(directory)}
                      </div>
                      <div>
                        <span className="text-sm text-muted-foreground">
                          {formatDate(directory.updated_at)}
                        </span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => setSettingsDirectoryId(directory.id)}
                          title="Directory Settings"
                        >
                          <Settings className="h-4 w-4" />
                          <span className="sr-only">Directory Settings</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          asChild
                        >
                          <a href={currentSite ? `${getSiteUrl(currentSite)}/directories/${directory.slug}` : '#'} target="_blank" rel="noopener noreferrer" title="Preview">
                            <Eye className="h-4 w-4" />
                            <span className="sr-only">Preview</span>
                          </a>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => handleDuplicateDirectory(directory.id)}
                          disabled={duplicatingDirectoryId === directory.id}
                          title="Duplicate"
                        >
                          <Copy className="h-4 w-4" />
                          <span className="sr-only">Duplicate</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-red-600 hover:text-red-600"
                          onClick={() => handleDeleteDirectory(directory.id)}
                          disabled={deleteDirectoryId === directory.id}
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                          <span className="sr-only">Delete</span>
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

        {/* Create Directory Dialog */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogPortal>
            <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center overflow-y-auto p-4"
                 onClick={(e) => e.target === e.currentTarget && setShowCreateDialog(false)}>
              <div className="bg-background rounded-lg border shadow-lg w-[840px] max-w-[95vw] p-10 relative my-8"
                   style={{ width: '840px', maxWidth: '95vw' }}
                   onClick={(e) => e.stopPropagation()}>
                <DialogPrimitive.Close className="absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden">
                  <X className="h-4 w-4" />
                  <span className="sr-only">Close</span>
                </DialogPrimitive.Close>
                <DialogHeader>
                  <DialogTitle>Create New Directory Item</DialogTitle>
                  <DialogDescription>
                    Add a new item to your directory. You can customize the content after creation.
                  </DialogDescription>
                </DialogHeader>
                <CreateDirectoryModal
                  onSuccess={(directory, continueToBuilder) => {
                    setDirectories(prev => [...prev, directory])
                    setShowCreateDialog(false)
                    if (continueToBuilder && currentSite?.id) {
                      router.push(`/admin/directories/builder/${currentSite.id}?directory=${directory.slug}`)
                    }
                  }}
                  onCancel={() => setShowCreateDialog(false)}
                />
              </div>
            </div>
          </DialogPortal>
        </Dialog>

        {/* Directory Settings Modal */}
        <DirectorySettingsModal 
          open={settingsDirectoryId !== null}
          onOpenChange={(open) => setSettingsDirectoryId(open ? settingsDirectoryId : null)}
          directory={directories.find(d => d.id === settingsDirectoryId) || null}
          site={null}
          onSuccess={handleDirectoryUpdated}
        />

        {/* Confirmation Dialog */}
        {confirmDialogOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div
              className="fixed inset-0 bg-black/50"
              onClick={cancelDeleteDirectory}
            />
            <div className="relative bg-background rounded-lg border shadow-lg p-6 w-full max-w-lg z-50">
              <h2 className="text-lg font-semibold mb-2">Delete Directory</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Are you sure you want to delete this directory? This action cannot be undone.
              </p>
              <div className="flex justify-end gap-2">
                <Button onClick={cancelDeleteDirectory} variant="outline">Cancel</Button>
                <Button onClick={confirmDeleteDirectory} variant="destructive">Delete</Button>
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
              <h2 className="text-lg font-semibold mb-2">Delete {selectedDirectoryIds.size} Director{selectedDirectoryIds.size !== 1 ? 'ies' : 'y'}</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Are you sure you want to delete {selectedDirectoryIds.size} director{selectedDirectoryIds.size !== 1 ? 'ies' : 'y'}? This action cannot be undone.
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
                  Delete {selectedDirectoryIds.size} Director{selectedDirectoryIds.size !== 1 ? 'ies' : 'y'}
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
              <h2 className="text-lg font-semibold mb-2">Error</h2>
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
