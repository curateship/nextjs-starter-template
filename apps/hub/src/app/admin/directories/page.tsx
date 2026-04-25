"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import dynamic from "next/dynamic"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { ArrowDown, ArrowUp, Copy, Eye, FileEdit, FolderOpen, Globe, List, Plus, Settings, Trash2, X } from "lucide-react"
import { getSiteUrl } from "@/lib/utils/site-url-generator"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { getDirectoryAdminTopNavLinks } from "@/components/admin/layout/stickybar/StickybarTopLeftNav"
import { Card } from "@/components/ui/card"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { Button } from "@/components/ui/button"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { CursorPagination } from "@/components/ui/cursor-pagination"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogPortal, DialogTitle } from "@/components/ui/dialog"
import {
  deleteDirectoryAction,
  deleteDirectoriesAction,
  duplicateDirectoryAction,
  getDirectoryByIdAction,
  type Directory,
} from "@/lib/actions/directories/directory-actions"
import {
  getDirectoryListPageAction,
  type DirectorySummary,
  type DirectoryListSort,
  type DirectoryListDirection,
} from "@/lib/actions/directories/directory-list-actions"
import type { CategoryInfo } from "@/lib/actions/categories/category-relationship-actions"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import { cn } from "@/lib/utils/tailwind"

const CreateDirectoryModal = dynamic(() =>
  import("@/components/admin/directory-builder/layout/CreateDirectoryModal").then((m) => ({ default: m.CreateDirectoryModal })),
  { ssr: false }
)
const DirectorySettingsModal = dynamic(() =>
  import("@/components/admin/directory-builder/layout/DirectorySettingsModal").then((m) => ({ default: m.DirectorySettingsModal })),
  { ssr: false }
)

export default function DirectoriesPage() {
  const router = useRouter()
  const { currentSite, pageSize: contextPageSize } = useSiteSwitcher()
  const pageSize = contextPageSize

  const [directories, setDirectories] = useState<DirectorySummary[]>([])
  const [directoryCategories, setDirectoryCategories] = useState<Record<string, CategoryInfo[]>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [deleteDirectoryId, setDeleteDirectoryId] = useState<string | null>(null)
  const [duplicatingDirectoryId, setDuplicatingDirectoryId] = useState<string | null>(null)
  const [settingsDirectoryId, setSettingsDirectoryId] = useState<string | null>(null)
  const [settingsDirectory, setSettingsDirectory] = useState<Directory | null>(null)
  const [settingsLoading, setSettingsLoading] = useState(false)
  const [filterStatus, setFilterStatus] = useState<'all' | 'published' | 'draft'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<DirectoryListSort>('default')
  const [sortDirection, setSortDirection] = useState<DirectoryListDirection>('asc')
  const [activeCursor, setActiveCursor] = useState<string | null>(null)
  const [cursorHistory, setCursorHistory] = useState<Array<string | null>>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [total, setTotal] = useState(0)
  const [statusCounts, setStatusCounts] = useState({ all: 0, published: 0, draft: 0 })
  const [reloadToken, setReloadToken] = useState(0)

  const [errorDialogOpen, setErrorDialogOpen] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [selectedDirectoryIds, setSelectedDirectoryIds] = useState<Set<string>>(new Set())
  const [massDeleting, setMassDeleting] = useState(false)
  const [massDeleteConfirmOpen, setMassDeleteConfirmOpen] = useState(false)

  useEffect(() => {
    setActiveCursor(null)
    setCursorHistory([])
    setSelectedDirectoryIds(new Set())
  }, [currentSite?.id, filterStatus, searchQuery, sortBy, sortDirection])

  useEffect(() => {
    async function loadDirectories() {
      if (!currentSite?.id) {
        setLoading(false)
        setDirectories([])
        setDirectoryCategories({})
        setTotal(0)
        setStatusCounts({ all: 0, published: 0, draft: 0 })
        setNextCursor(null)
        return
      }

      try {
        setLoading(true)
        setError(null)

        const { data, error: directoriesError } = await getDirectoryListPageAction({
          siteId: currentSite.id,
          search: searchQuery,
          status: filterStatus,
          sortBy,
          sortDirection,
          cursor: activeCursor,
          limit: pageSize,
        })

        if (directoriesError || !data) {
          setError(directoriesError || 'Failed to load directories')
          setDirectories([])
          setDirectoryCategories({})
          setTotal(0)
          setStatusCounts({ all: 0, published: 0, draft: 0 })
          setNextCursor(null)
          return
        }

        setDirectories(data.rows)
        setDirectoryCategories(data.categories)
        setTotal(data.totalCount)
        setStatusCounts(data.statusCounts)
        setNextCursor(data.nextCursor)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load directories')
      } finally {
        setLoading(false)
      }
    }

    void loadDirectories()
  }, [currentSite?.id, filterStatus, searchQuery, sortBy, sortDirection, activeCursor, pageSize, reloadToken])

  useEffect(() => {
    async function loadSettingsDirectory() {
      if (!settingsDirectoryId) {
        setSettingsDirectory(null)
        return
      }

      try {
        setSettingsLoading(true)
        const { data, error: settingsError } = await getDirectoryByIdAction(settingsDirectoryId)
        if (settingsError || !data) {
          setErrorMessage(settingsError || 'Failed to load directory settings')
          setErrorDialogOpen(true)
          setSettingsDirectoryId(null)
          return
        }

        setSettingsDirectory(data)
      } finally {
        setSettingsLoading(false)
      }
    }

    void loadSettingsDirectory()
  }, [settingsDirectoryId])

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

  const getStatusBadge = (directory: DirectorySummary) => {
    if (directory.status === 'published') {
      return <Badge variant="default" className="bg-green-100 text-green-800">Published</Badge>
    }

    return <Badge variant="secondary">Draft</Badge>
  }

  const toggleSelectDirectory = (directoryId: string) => {
    setSelectedDirectoryIds((prev) => {
      const next = new Set(prev)
      if (next.has(directoryId)) {
        next.delete(directoryId)
      } else {
        next.add(directoryId)
      }
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedDirectoryIds.size === directories.length) {
      setSelectedDirectoryIds(new Set())
      return
    }

    setSelectedDirectoryIds(new Set(directories.map((directory) => directory.id)))
  }

  const handleDeleteDirectory = async (directoryId: string) => {
    setPendingDeleteId(directoryId)
    setConfirmDialogOpen(true)
  }

  const confirmDeleteDirectory = async () => {
    if (!pendingDeleteId) return

    const directoryIdToDelete = pendingDeleteId
    setConfirmDialogOpen(false)
    setPendingDeleteId(null)

    try {
      setDeleteDirectoryId(directoryIdToDelete)
      const { success, error: deleteError } = await deleteDirectoryAction(directoryIdToDelete)

      if (deleteError || !success) {
        setErrorMessage(deleteError || 'Failed to delete directory')
        setErrorDialogOpen(true)
        return
      }

      setSelectedDirectoryIds((prev) => {
        const next = new Set(prev)
        next.delete(directoryIdToDelete)
        return next
      })
      setReloadToken((token) => token + 1)
    } catch {
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

  const confirmMassDelete = async () => {
    setMassDeleteConfirmOpen(false)
    setMassDeleting(true)

    try {
      const ids = Array.from(selectedDirectoryIds)
      const { success, error: deleteError } = await deleteDirectoriesAction(ids)

      if (deleteError || !success) {
        setErrorMessage(deleteError || 'Failed to delete directories')
        setErrorDialogOpen(true)
        return
      }

      setSelectedDirectoryIds(new Set())
      setReloadToken((token) => token + 1)
    } catch {
      setErrorMessage('Failed to delete directories')
      setErrorDialogOpen(true)
    } finally {
      setMassDeleting(false)
    }
  }

  const handleDuplicateDirectory = async (directoryId: string) => {
    try {
      setDuplicatingDirectoryId(directoryId)
      const originalDirectory = directories.find((directory) => directory.id === directoryId)
      const duplicateTitle = `${originalDirectory?.title || 'Directory'} Copy`
      const { error: duplicateError } = await duplicateDirectoryAction(directoryId, duplicateTitle)

      if (duplicateError) {
        setErrorMessage(`Failed to duplicate directory: ${duplicateError}`)
        setErrorDialogOpen(true)
        return
      }

      setReloadToken((token) => token + 1)
    } catch {
      setErrorMessage('Failed to duplicate directory')
      setErrorDialogOpen(true)
    } finally {
      setDuplicatingDirectoryId(null)
    }
  }

  const handleDirectoryUpdated = (updatedDirectory: Directory) => {
    setDirectories((prev) => prev.map((directory) => directory.id === updatedDirectory.id ? {
      ...directory,
      title: updatedDirectory.title,
      slug: updatedDirectory.slug,
      status: updatedDirectory.status,
      featured_image: updatedDirectory.featured_image,
      description: updatedDirectory.description,
      meta_description: updatedDirectory.meta_description,
      updated_at: updatedDirectory.updated_at,
    } : directory))
    setSettingsDirectory(updatedDirectory)
    setReloadToken((token) => token + 1)
  }

  const toggleSort = (column: 'title' | 'modified') => {
    if (sortBy === column) {
      setSortDirection((direction) => direction === 'asc' ? 'desc' : 'asc')
      return
    }

    setSortBy(column)
    setSortDirection(column === 'modified' ? 'desc' : 'asc')
  }

  const resetSort = () => {
    setSortBy('default')
    setSortDirection('asc')
  }

  const getSortIcon = (column: 'title' | 'modified') => {
    if (sortBy !== column) return null
    if (sortDirection === 'asc') return <ArrowUp className="h-3 w-3" />
    return <ArrowDown className="h-3 w-3" />
  }

  const handleNextPage = () => {
    if (!nextCursor) return

    setCursorHistory((prev) => [...prev, activeCursor])
    setActiveCursor(nextCursor)
    setSelectedDirectoryIds(new Set())
  }

  const handlePreviousPage = () => {
    setCursorHistory((prev) => {
      if (prev.length === 0) return prev

      const nextHistory = [...prev]
      const previousCursor = nextHistory.pop() ?? null
      setActiveCursor(previousCursor)
      setSelectedDirectoryIds(new Set())
      return nextHistory
    })
  }

  return (
    <>
      <StickyHeader navLinks={getDirectoryAdminTopNavLinks("directory")} />
      <AdminLayout>
        <div className="w-full">
          <DashboardSubheader
            items={[{ label: "Directory" }]}
            search={{
              value: searchQuery,
              onValueChange: setSearchQuery,
              placeholder: "Search directories",
            }}
            filterMenu={{
              value: filterStatus,
              onValueChange: (value) => setFilterStatus(value as 'all' | 'published' | 'draft'),
              items: [
                { value: "all", label: "All", icon: List, count: statusCounts.all },
                { value: "published", label: "Published", icon: Globe, count: statusCounts.published },
                { value: "draft", label: "Draft", icon: FileEdit, count: statusCounts.draft },
              ],
            }}
            preActions={
              <div className="flex items-center gap-2">
                {sortBy !== 'default' && (
                  <Button variant="outline" size="sm" onClick={resetSort}>
                    Clear Sort
                  </Button>
                )}
                {selectedDirectoryIds.size > 0 && (
                  <Button
                    variant="destructive"
                    onClick={() => setMassDeleteConfirmOpen(true)}
                    disabled={massDeleting}
                  >
                    {massDeleting ? 'Deleting...' : `Delete (${selectedDirectoryIds.size})`}
                  </Button>
                )}
              </div>
            }
            actions={
              <Button onClick={() => setShowCreateDialog(true)}>
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">Create Item</span>
              </Button>
            }
          />

          <Card className="shadow-sm">
            <div className="px-6 py-4 border-b bg-muted/30">
              <div className="grid grid-cols-6 gap-4 text-sm font-medium text-muted-foreground">
                <div className="col-span-2 flex items-center space-x-4">
                  <Checkbox
                    checked={directories.length > 0 && selectedDirectoryIds.size === directories.length}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Select all directories on this page"
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
                    <span className="ml-2 flex h-3.5 w-3.5 items-center justify-center">
                      {getSortIcon('title')}
                    </span>
                  </button>
                </div>
                <div>Category</div>
                <div>Status</div>
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
                  <span className="ml-2 flex h-3.5 w-3.5 items-center justify-center">
                    {getSortIcon('modified')}
                  </span>
                </button>
                <div>Actions</div>
              </div>
            </div>

            <div className="divide-y divide-muted/80">
              {loading ? (
                <div className="space-y-0">
                  {[1, 2, 3, 4, 5].map((item) => (
                    <div key={item} className="p-6 border-b border-muted/80">
                      <div className="grid grid-cols-6 gap-4 items-center">
                        <div className="col-span-2">
                          <div className="flex items-center space-x-4">
                            <div className="w-4 h-4 bg-muted rounded animate-pulse" />
                            <div className="w-12 h-12 bg-muted rounded animate-pulse ml-2" />
                            <div>
                              <div className="h-4 bg-muted rounded animate-pulse mb-2 w-32" />
                              <div className="h-3 bg-muted/60 rounded animate-pulse w-24" />
                            </div>
                          </div>
                        </div>
                        <div><div className="h-5 bg-muted rounded-full animate-pulse w-16" /></div>
                        <div><div className="h-6 bg-muted rounded-full animate-pulse w-20" /></div>
                        <div><div className="h-3 bg-muted/60 rounded animate-pulse w-16" /></div>
                        <div>
                          <div className="flex items-center space-x-2">
                            <div className="h-8 w-8 bg-muted rounded animate-pulse" />
                            <div className="h-8 w-8 bg-muted rounded animate-pulse" />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : error ? (
                <div className="p-8 text-center">
                  <p className="text-red-600 mb-4">{error}</p>
                  <Button onClick={() => setReloadToken((token) => token + 1)} variant="outline" size="sm">
                    Try Again
                  </Button>
                </div>
              ) : directories.length === 0 ? (
                <div className="p-8 text-center">
                  <FolderOpen className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground mb-4">No directories found for the current filters.</p>
                  <Button onClick={() => setShowCreateDialog(true)} variant="outline">
                    Create Your First Directory
                  </Button>
                </div>
              ) : (
                directories.map((directory) => (
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
                              <p className="text-sm text-muted-foreground">/directories/{directory.slug}</p>
                            </div>
                          </Link>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {directoryCategories[directory.id]?.length ? (
                          directoryCategories[directory.id].map((category) => (
                            <Badge key={category.id} variant="outline" className="text-xs">
                              {category.title}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {getStatusBadge(directory)}
                      </div>
                      <div>
                        <span className="text-sm text-muted-foreground">{formatDate(directory.updated_at)}</span>
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
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" asChild>
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
                <div className="text-sm text-muted-foreground">
                  Showing {directories.length} items from a filtered total of {total}
                </div>
                <CursorPagination
                  hasPreviousPage={cursorHistory.length > 0}
                  hasNextPage={Boolean(nextCursor)}
                  onPreviousPage={handlePreviousPage}
                  onNextPage={handleNextPage}
                />
              </div>
            )}
          </Card>

          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogContent size="admin">
              <DialogHeader>
                <DialogTitle>Create New Directory Item</DialogTitle>
                <DialogDescription>
                  Add a new item to your directory. You can customize the content after creation.
                </DialogDescription>
              </DialogHeader>
              <CreateDirectoryModal
                onSuccess={(directory, continueToBuilder) => {
                  setShowCreateDialog(false)
                  setReloadToken((token) => token + 1)
                  if (continueToBuilder && currentSite?.id) {
                    router.push(`/admin/directories/builder/${currentSite.id}?directory=${directory.slug}`)
                  }
                }}
                onCancel={() => setShowCreateDialog(false)}
              />
            </DialogContent>
          </Dialog>

          <DirectorySettingsModal
            open={settingsDirectoryId !== null}
            onOpenChange={(open) => {
              if (!open) {
                setSettingsDirectoryId(null)
                setSettingsDirectory(null)
              }
            }}
            directory={settingsLoading ? null : settingsDirectory}
            site={null}
            onSuccess={handleDirectoryUpdated}
          />

          {confirmDialogOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              <div className="fixed inset-0 bg-black/50" onClick={cancelDeleteDirectory} />
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

          {massDeleteConfirmOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              <div className="fixed inset-0 bg-black/50" onClick={() => setMassDeleteConfirmOpen(false)} />
              <div className="relative bg-background rounded-lg border shadow-lg p-6 w-full max-w-lg z-50">
                <h2 className="text-lg font-semibold mb-2">Delete {selectedDirectoryIds.size} Director{selectedDirectoryIds.size !== 1 ? 'ies' : 'y'}</h2>
                <p className="text-sm text-muted-foreground mb-4">
                  Are you sure you want to delete {selectedDirectoryIds.size} director{selectedDirectoryIds.size !== 1 ? 'ies' : 'y'}? This action cannot be undone.
                </p>
                <div className="flex justify-end gap-2">
                  <Button onClick={() => setMassDeleteConfirmOpen(false)} variant="outline">Cancel</Button>
                  <Button onClick={confirmMassDelete} variant="destructive">Delete</Button>
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
