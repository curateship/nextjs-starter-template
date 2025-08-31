"use client"

import { useState, useEffect, useRef } from "react"
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
  DialogPortal,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { CreateDirectoryModal } from "@/components/admin/directory-builder/CreateDirectoryModal"
import { DirectorySettingsModal } from "@/components/admin/directory-builder/DirectorySettingsModal"
import { Eye, Edit, Copy, Trash2, Plus, Settings, MoreHorizontal, FolderOpen, X } from "lucide-react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { getSiteDirectoriesAction, deleteDirectoryAction, duplicateDirectoryAction } from "@/lib/actions/directories/directory-actions"
import { useSiteContext } from "@/contexts/site-context"
import type { Directory } from "@/lib/actions/directories/directory-actions"

export default function DirectoriesPage() {
  const router = useRouter()
  const { currentSite } = useSiteContext()
  const [directories, setDirectories] = useState<Directory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [deleteDirectoryId, setDeleteDirectoryId] = useState<string | null>(null)
  const [duplicatingDirectoryId, setDuplicatingDirectoryId] = useState<string | null>(null)
  const [settingsDirectoryId, setSettingsDirectoryId] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState<'all' | 'published' | 'draft'>('all')
  const [filterPrivacy, setFilterPrivacy] = useState<'all' | 'public' | 'private'>('all')
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [errorDialogOpen, setErrorDialogOpen] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const filterRef = useRef<HTMLDivElement>(null)

  // Load directories
  useEffect(() => {
    async function loadDirectories() {
      if (!currentSite?.id) {
        // Keep loading true when no site is selected (during site switching)
        setLoading(true)
        setDirectories([])
        return
      }
      
      try {
        setLoading(true)
        setError(null)

        const { data: directoriesData, error: directoriesError } = await getSiteDirectoriesAction(currentSite.id)
        if (directoriesError) {
          setError(directoriesError)
          setLoading(false)
          return
        }
        
        if (directoriesData) {
          setDirectories(directoriesData)
        }
        setLoading(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load directories')
        setLoading(false)
      }
    }

    loadDirectories()
  }, [currentSite?.id])

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

  const handleDeleteDirectory = async (directoryId: string) => {
    setPendingDeleteId(directoryId)
    setConfirmDialogOpen(true)
  }

  const confirmDeleteDirectory = async () => {
    if (!pendingDeleteId) return
    
    try {
      setDeleteDirectoryId(pendingDeleteId)
      setConfirmDialogOpen(false)
      const { success, error: deleteError } = await deleteDirectoryAction(pendingDeleteId)
      
      if (deleteError) {
        setErrorMessage(deleteError)
        setErrorDialogOpen(true)
        return
      }
      
      if (success) {
        setDirectories(prev => prev.filter(directory => directory.id !== pendingDeleteId))
      }
    } catch (err) {
      setErrorMessage('Failed to delete directory')
      setErrorDialogOpen(true)
    } finally {
      setDeleteDirectoryId(null)
      setPendingDeleteId(null)
    }
  }

  const cancelDeleteDirectory = () => {
    setConfirmDialogOpen(false)
    setPendingDeleteId(null)
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
    <AdminLayout>
      <div className="w-full max-w-6xl mx-auto">
        <AdminPageHeader
          title="Directory"
          subtitle="Manage your directory listings"
          primaryAction={{
            label: "Create Item",
            onClick: () => setShowCreateDialog(true)
          }}
        />
        
        <AdminCard>
            <div className="p-6 border-b">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-semibold">Directory List</h3>
                  <div className="text-sm text-muted-foreground mt-1">
                    {loading ? (
                      <div className="h-4 bg-muted rounded animate-pulse w-24"></div>
                    ) : (
                      `${filteredDirectories.length} ${filteredDirectories.length !== 1 ? 'directories' : 'directory'} ${filterStatus === 'all' && filterPrivacy === 'all' ? 'total' : 
                        `${filterStatus === 'all' ? '' : filterStatus}${filterStatus !== 'all' && filterPrivacy === 'private' ? ', ' : ''}${filterPrivacy === 'private' ? 'private' : ''}`}`
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
                          All Directory ({statusCounts.all})
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
                        <div className="border-t my-1"></div>
                        <button 
                          onClick={() => { setFilterPrivacy('private'); setIsFilterOpen(false) }}
                          className={`block w-full text-left px-4 py-2 text-sm hover:bg-muted ${
                            filterPrivacy === 'private' ? 'bg-muted font-medium' : ''
                          }`}
                        >
                          Private ({privacyCounts.private})
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
                <div className="col-span-2">Directory</div>
                <div>Status</div>
                <div>Modified</div>
                <div>Actions</div>
              </div>
            </div>
            
            <div className="divide-y">
              {loading ? (
                // Skeleton loading state for directories
                <div className="space-y-0">
                  {[1, 2, 3, 4, 5].map((i) => (
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
                filteredDirectories.map((directory) => (
                  <div key={directory.id} className="p-6">
                    <div className="grid grid-cols-5 gap-4 items-center">
                      <div className="col-span-2">
                        <Link 
                          href={`/admin/directories/builder/${directory.site_id}?directory=${directory.slug}`}
                          className="flex items-center space-x-4 hover:opacity-80 transition-opacity"
                        >
                          <div className="w-12 h-12 bg-muted rounded flex items-center justify-center overflow-hidden">
                            {directory.featured_image ? (
                              <img 
                                src={directory.featured_image} 
                                alt={directory.title}
                                className="w-full h-full object-cover"
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
                      <div>
                        {getStatusBadge(directory)}
                      </div>
                      <div>
                        <span className="text-sm text-muted-foreground">
                          {formatDate(directory.updated_at)}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2">
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
                              <Link href={`/admin/directories/builder/${directory.site_id}?directory=${directory.slug}`} className="flex items-center">
                                <Edit className="mr-2 h-4 w-4" />
                                Edit Directory
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link 
                                href={`/directories/${directory.slug}`}
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="flex items-center"
                              >
                                <Eye className="mr-2 h-4 w-4" />
                                Preview Directory
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              onClick={() => handleDuplicateDirectory(directory.id)}
                              disabled={duplicatingDirectoryId === directory.id}
                              className="flex items-center"
                            >
                              {duplicatingDirectoryId === directory.id ? (
                                <>
                                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"></div>
                                  Duplicating...
                                </>
                              ) : (
                                <>
                                  <Copy className="mr-2 h-4 w-4" />
                                  Duplicate Directory
                                </>
                              )}
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => handleDeleteDirectory(directory.id)}
                              disabled={deleteDirectoryId === directory.id}
                              className="flex items-center text-red-600 focus:text-red-600"
                            >
                              {deleteDirectoryId === directory.id ? (
                                <>
                                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-600 mr-2"></div>
                                  Deleting...
                                </>
                              ) : (
                                <>
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Delete Directory
                                </>
                              )}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </AdminCard>
        
        {/* Create Directory Dialog */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogPortal>
            <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center overflow-y-auto p-4"
                 onClick={(e) => e.target === e.currentTarget && setShowCreateDialog(false)}>
              <div className="bg-background rounded-lg border shadow-lg w-[840px] max-w-[95vw] p-6 relative my-8"
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
                  onSuccess={(directory) => {
                    setDirectories(prev => [...prev, directory])
                    setShowCreateDialog(false)
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
        <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Directory</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete this directory? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-2">
              <Button 
                onClick={cancelDeleteDirectory}
                variant="outline"
              >
                Cancel
              </Button>
              <Button 
                onClick={confirmDeleteDirectory}
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
              <DialogTitle>Error</DialogTitle>
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