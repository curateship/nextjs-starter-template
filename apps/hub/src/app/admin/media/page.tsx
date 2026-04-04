"use client"

import { useState, useEffect } from "react"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { Card } from "@/components/ui/card"
import { StickyHeader } from "@/components/admin/layout/dashboard/StickyHeader"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Grid, List, Image as ImageIcon, Trash2, Edit, VideoIcon, ArrowUp, ArrowDown, ChevronsUpDown, Upload } from "lucide-react"
import { cn } from "@/lib/utils/tailwind"
import { getPaginatedMediaAction, deleteImageAction, updateImageAction, getMediaIdsAction } from "@/lib/actions/media/media-actions"
import type { MediaData, PaginatedMediaResponse } from "@/lib/actions/media/media-actions"
import Image from "next/image"
import { toast } from "sonner"
import { useSiteSwitcher } from "@/components/admin/providers/site-switcher-provider"
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Pagination, PaginationInfo } from "@/components/ui/pagination"



export default function ImagesPage() {
  const { currentSite } = useSiteSwitcher()
  const [viewMode, setViewMode] = useState<'list' | 'gallery'>('list')
  const [paginatedData, setPaginatedData] = useState<PaginatedMediaResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [filterType, setFilterType] = useState<'all' | 'image' | 'video'>('all')
  const [editingImage, setEditingImage] = useState<MediaData | null>(null)
  const [editAltText, setEditAltText] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize] = useState(20)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  // Tracks if user selected all items across all pages
  const [allSelected, setAllSelected] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [sortColumn, setSortColumn] = useState<'name' | 'type' | 'size' | 'added' | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [typeCounts, setTypeCounts] = useState<{ all: number; image: number; video: number }>({ all: 0, image: 0, video: 0 })

  // Load images when page, pageSize, or filterType changes
  useEffect(() => {
    loadImages()
  }, [currentPage, pageSize, filterType])

  // Load type counts after mutations
  const loadTypeCounts = async () => {
    const [allRes, imgRes, vidRes] = await Promise.all([
      getPaginatedMediaAction(1, 1),
      getPaginatedMediaAction(1, 1, 'image'),
      getPaginatedMediaAction(1, 1, 'video'),
    ])
    setTypeCounts({
      all: allRes.data?.total ?? 0,
      image: imgRes.data?.total ?? 0,
      video: vidRes.data?.total ?? 0,
    })
  }

  useEffect(() => {
    loadTypeCounts()
  }, [])

  const loadImages = async () => {
    try {
      setIsLoading(true)
      const fileType = filterType === 'all' ? undefined : filterType as 'image' | 'video'
      const { data, error } = await getPaginatedMediaAction(currentPage, pageSize, fileType)
      if (error) {
        toast.error(`Failed to load images: ${error}`)
      } else {
        setPaginatedData(data)
      }
    } catch (error) {
      toast.error('Failed to load images')
    } finally {
      setIsLoading(false)
    }
  }

  // Reset to first page when filter changes
  const handleFilterChange = (newFilter: 'all' | 'image' | 'video') => {
    setFilterType(newFilter)
    setCurrentPage(1)
    setSelectedIds(new Set())
    setAllSelected(false)
  }

  // Handle page change
  const handlePageChange = (page: number) => {
    setCurrentPage(page)
  }

  const handleDeleteImage = async (image: MediaData) => {
    if (!confirm(`Are you sure you want to delete "${image.original_name}"? This action cannot be undone.`)) {
      return
    }

    try {
      const { error } = await deleteImageAction(image.id)
      if (error) {
        toast.error(`Failed to delete image: ${error}`)
      } else {
        toast.success('Image deleted successfully')
        loadImages()
        loadTypeCounts()
      }
    } catch (error) {
      toast.error('Failed to delete image')
    }
  }

  const handleEditImage = (image: MediaData) => {
    setEditingImage(image)
    setEditAltText(image.alt_text || '')
  }

  const handleSaveEdit = async () => {
    if (!editingImage) return

    try {
      const { data, error } = await updateImageAction(editingImage.id, {
        alt_text: editAltText.trim() || undefined
      })
      
      if (error) {
        toast.error(`Failed to update image: ${error}`)
      } else {
        toast.success('Image updated successfully')
        // Update the item in current page data
        if (paginatedData) {
          setPaginatedData({
            ...paginatedData,
            data: paginatedData.data.map(img => img.id === editingImage.id ? data! : img)
          })
        }
        setEditingImage(null)
        setEditAltText('')
      }
    } catch (error) {
      toast.error('Failed to update image')
    }
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !currentSite) return

    // Validate file type
    const imageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']
    const videoTypes = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska']
    const allowedTypes = [...imageTypes, ...videoTypes]

    if (!allowedTypes.includes(file.type)) {
      toast.error('Invalid file type. Only images (JPEG, PNG, GIF, WebP, SVG) and videos (MP4, WebM, MOV, AVI, MKV) are allowed.')
      return
    }

    const fileType = imageTypes.includes(file.type) ? 'image' : 'video'

    // Validate file size (10MB for images, 100MB for videos)
    const maxSize = fileType === 'image' ? 10 * 1024 * 1024 : 100 * 1024 * 1024
    const maxSizeLabel = fileType === 'image' ? '10MB' : '100MB'
    if (file.size > maxSize) {
      toast.error(`File size too large. Maximum size is ${maxSizeLabel}.`)
      return
    }

    setIsUploading(true)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('siteId', currentSite.id)

      const response = await fetch('/api/media/upload', {
        method: 'POST',
        body: formData
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Upload failed')
      }

      toast.success("Image uploaded successfully!")
      loadImages()
      loadTypeCounts()

    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Upload failed')
    } finally {
      setIsUploading(false)
      // Clear the input
      if (e.target) {
        e.target.value = ''
      }
    }
  }

  const handleToggleSelection = (mediaId: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(mediaId)) {
        newSet.delete(mediaId)
        setAllSelected(false)
      } else {
        newSet.add(mediaId)
      }
      return newSet
    })
  }

  const handleToggleSelectAll = () => {
    const allPageIds = images.map(media => media.id)
    const allPageSelected_ = allPageIds.every(id => selectedIds.has(id))

    if (allPageSelected_) {
      setSelectedIds(prev => {
        const newSet = new Set(prev)
        allPageIds.forEach(id => newSet.delete(id))
        return newSet
      })
      setAllSelected(false)
    } else {
      setSelectedIds(prev => {
        const newSet = new Set(prev)
        allPageIds.forEach(id => newSet.add(id))
        return newSet
      })
    }
  }

  // Select all items across all pages (lightweight ID-only fetch)
  const handleSelectAll = async () => {
    const total = paginatedData?.total ?? 0
    if (total === 0) return
    const fileType = filterType === 'all' ? undefined : filterType as 'image' | 'video'
    const { ids } = await getMediaIdsAction(fileType)
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

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return

    const count = selectedIds.size
    if (!confirm(`Are you sure you want to delete ${count} ${count === 1 ? 'item' : 'items'}? This action cannot be undone.`)) {
      return
    }

    setIsDeleting(true)
    let successCount = 0
    let failCount = 0

    try {
      for (const id of Array.from(selectedIds)) {
        try {
          const { success } = await deleteImageAction(id)
          if (success) {
            successCount++
          } else {
            failCount++
          }
        } catch (error) {
          failCount++
        }
      }

      if (successCount > 0) {
        toast.success(`Successfully deleted ${successCount} ${successCount === 1 ? 'item' : 'items'}`)
      }
      if (failCount > 0) {
        toast.error(`Failed to delete ${failCount} ${failCount === 1 ? 'item' : 'items'}`)
      }

      setSelectedIds(new Set())
      setAllSelected(false)
      loadImages()
      loadTypeCounts()

    } catch (error) {
      toast.error('Failed to delete items')
    } finally {
      setIsDeleting(false)
    }
  }

  // Get current images from paginated data
  const images = paginatedData?.data || []

  // Check if all items on current page are selected
  const allPageSelected = images.length > 0 && images.every(media => selectedIds.has(media.id))

  const toggleSort = (column: 'name' | 'type' | 'size' | 'added') => {
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

  const getSortIcon = (column: 'name' | 'type' | 'size' | 'added') => {
    if (sortColumn !== column) return <ChevronsUpDown className="h-3 w-3 opacity-70" />
    if (sortDirection === 'asc') return <ArrowUp className="h-3 w-3" />
    return <ArrowDown className="h-3 w-3" />
  }

  const sortedImages = [...images].sort((a, b) => {
    if (!sortColumn) return 0
    const dir = sortDirection === 'asc' ? 1 : -1
    if (sortColumn === 'name') return a.original_name.localeCompare(b.original_name) * dir
    if (sortColumn === 'type') return a.file_type.localeCompare(b.file_type) * dir
    if (sortColumn === 'size') return (a.file_size - b.file_size) * dir
    if (sortColumn === 'added') return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * dir
    return 0
  })

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

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  return (
    <>
      <StickyHeader />
      <AdminLayout>
        <div className="w-full">
          <DashboardSubheader
            items={[{ label: "Media" }]}
            tabs={{
              value: filterType,
              onValueChange: (value) => handleFilterChange(value as 'all' | 'image' | 'video'),
              items: [
                { value: "all", label: "All", icon: List, count: typeCounts.all },
                { value: "image", label: "Images", icon: ImageIcon, count: typeCounts.image },
                { value: "video", label: "Videos", icon: VideoIcon, count: typeCounts.video },
              ],
            }}
            preActions={
              <>
                {/* Bulk Actions */}
                {selectedIds.size > 0 && (
                  <Button
                    variant="destructive"
                    onClick={handleBulkDelete}
                    disabled={isDeleting}
                  >
                    <Trash2 className="w-4 h-4" />
                    {isDeleting ? <span className="hidden sm:inline">Deleting...</span> : <span className="hidden sm:inline">Delete {selectedIds.size}</span>}
                  </Button>
                )}
                {/* View Mode Toggle */}
                <div className="flex items-center border rounded-md">
                  <Button
                    variant={viewMode === 'list' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setViewMode('list')}
                    className="rounded-r-none h-9"
                  >
                    <List className="w-4 h-4" />
                  </Button>
                  <Button
                    variant={viewMode === 'gallery' ? 'default' : 'ghost'}
                    onClick={() => setViewMode('gallery')}
                    className="rounded-l-none h-9"
                  >
                    <Grid className="w-4 h-4" />
                  </Button>
                </div>
              </>
            }
            actions={
              <>

                <Button
                  onClick={isUploading ? undefined : () => document.getElementById('image-upload-input')?.click()}
                  disabled={isUploading}
                >
                  <Upload className="h-4 w-4" />
                  <span className="hidden sm:inline">{isUploading ? "Uploading..." : "Upload Media"}</span>
                </Button>
              </>
            }
          />

        {/* Hidden file input */}
        <input
          id="image-upload-input"
          type="file"
          accept="image/jpeg,image/jpg,image/png,image/gif,image/webp,image/svg+xml,video/mp4,video/webm,video/quicktime"
          onChange={handleImageUpload}
          className="hidden"
        />
        
        <Card className="shadow-sm">
          {viewMode === 'list' && (
            /* Table Header */
            <div className="px-6 py-4 border-b bg-muted/30">
              <div className="grid grid-cols-6 gap-4 text-sm font-medium text-muted-foreground">
                <div className="col-span-2 flex items-center space-x-4">
                  <Checkbox
                    checked={allPageSelected}
                    onCheckedChange={handleToggleSelectAll}
                    aria-label="Select all media"
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
                    <span>File</span>
                    <span className="ml-2 flex h-3.5 w-3.5 items-center justify-center">{getSortIcon('name')}</span>
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => toggleSort('type')}
                  className={cn(
                    "flex items-center gap-1.5",
                    "text-[0.8125rem] text-muted-foreground hover:text-foreground",
                    "cursor-pointer outline-none transition-colors"
                  )}
                >
                  <span>Type</span>
                  <span className="ml-2 flex h-3.5 w-3.5 items-center justify-center">{getSortIcon('type')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => toggleSort('size')}
                  className={cn(
                    "flex items-center gap-1.5",
                    "text-[0.8125rem] text-muted-foreground hover:text-foreground",
                    "cursor-pointer outline-none transition-colors"
                  )}
                >
                  <span>Size</span>
                  <span className="ml-2 flex h-3.5 w-3.5 items-center justify-center">{getSortIcon('size')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => toggleSort('added')}
                  className={cn(
                    "flex items-center gap-1.5",
                    "text-[0.8125rem] text-muted-foreground hover:text-foreground",
                    "cursor-pointer outline-none transition-colors"
                  )}
                >
                  <span>Added</span>
                  <span className="ml-2 flex h-3.5 w-3.5 items-center justify-center">{getSortIcon('added')}</span>
                </button>
                <div className="">Actions</div>
              </div>
            </div>
          )}

          {/* "Select all" banner — shown when all page items selected but more exist */}
          {allPageSelected && paginatedData && paginatedData.total > images.length && (
            <div className="px-6 py-2 bg-accent/50 border-b text-sm text-center">
              {allSelected ? (
                <span>All {paginatedData.total} items selected. <button type="button" onClick={handleClearSelection} className="underline hover:text-foreground text-muted-foreground">Clear selection</button></span>
              ) : (
                <span>{images.length} items on this page are selected. <button type="button" onClick={handleSelectAll} className="underline font-medium">Select all {paginatedData.total}</button></span>
              )}
            </div>
          )}

          <div className="divide-y divide-muted/80">
          {isLoading ? (
            viewMode === 'gallery' ? (
              <div className="p-6">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {[...Array(10)].map((_, i) => (
                    <div key={i} className="relative bg-muted rounded-lg overflow-hidden aspect-square animate-pulse">
                      <div className="absolute inset-0 bg-muted"></div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-0">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="p-6 border-b border-muted/80">
                    <div className="grid grid-cols-6 gap-4 items-center">
                      <div className="col-span-2 flex items-center space-x-4">
                        <div className="w-4 h-4 bg-muted rounded animate-pulse"></div>
                        <div className="w-12 h-12 bg-muted rounded animate-pulse"></div>
                        <div>
                          <div className="h-4 bg-muted rounded animate-pulse mb-2 w-32"></div>
                          <div className="h-3 bg-muted/60 rounded animate-pulse w-20"></div>
                        </div>
                      </div>
                      <div><div className="h-5 bg-muted rounded-full animate-pulse w-16"></div></div>
                      <div><div className="h-3 bg-muted/60 rounded animate-pulse w-14"></div></div>
                      <div><div className="h-3 bg-muted/60 rounded animate-pulse w-16"></div></div>
                      <div><div className="h-8 w-8 bg-muted rounded animate-pulse"></div></div>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : images.length === 0 ? (
            <div className="p-8 text-center">
              <ImageIcon className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground mb-4">
                No media found. Upload your first file to get started.
              </p>
              <Button onClick={() => document.getElementById('image-upload-input')?.click()} variant="outline">
                Upload Your First Media File
              </Button>
            </div>
          ) : viewMode === 'gallery' ? (
            <div className="p-6">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {images.map((media) => (
                  <div key={media.id} className="group relative bg-muted rounded-lg overflow-hidden aspect-square">
                    {media.file_type === 'video' ? (
                      <div className="relative w-full h-full bg-black">
                        <video
                          key={media.id}
                          src={`/api/media/proxy?url=${encodeURIComponent(media.public_url)}`}
                          className="w-full h-full object-contain"
                          muted
                          playsInline
                          preload="metadata"
                          onLoadedMetadata={(e) => {
                            e.currentTarget.currentTime = 0.1;
                          }}
                        />
                        <div className="absolute top-2 left-2">
                          <VideoIcon className="w-4 h-4 text-white drop-shadow-lg" />
                        </div>
                      </div>
                    ) : (
                      <Image
                        src={media.public_url}
                        alt={media.alt_text || media.original_name}
                        fill
                        className="object-contain"
                        sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 20vw"
                      />
                    )}
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <div className="flex justify-center space-x-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleEditImage(media)}
                          className="cursor-pointer"
                        >
                          <Edit className="w-3 h-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDeleteImage(media)}
                          className="cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            sortedImages.map((media) => {
              const isSelected = selectedIds.has(media.id)
              return (
                <div
                  key={media.id}
                  className={`p-6 transition-colors ${isSelected ? 'bg-accent/50' : ''}`}
                >
                  <div className="grid grid-cols-6 gap-4 items-center">
                    <div className="col-span-2">
                      <div className="flex items-center space-x-4">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => handleToggleSelection(media.id)}
                          aria-label={`Select ${media.original_name}`}
                        />
                        <div className="w-12 h-12 bg-muted rounded flex items-center justify-center overflow-hidden relative ml-2">
                          {media.file_type === 'video' ? (
                            <VideoIcon className="h-6 w-6 text-muted-foreground" />
                          ) : (
                            <Image
                              src={media.public_url}
                              alt={media.alt_text || media.original_name}
                              fill
                              className="object-contain"
                              sizes="48px"
                            />
                          )}
                        </div>
                        <div>
                          <h4 className="font-medium text-sm">{media.original_name}</h4>
                          {media.alt_text && (
                            <p className="text-xs text-muted-foreground truncate max-w-[200px]">{media.alt_text}</p>
                          )}
                        </div>
                      </div>
                    </div>
                    <div>
                      <span className="text-sm text-muted-foreground capitalize">{media.file_type}</span>
                    </div>
                    <div>
                      <span className="text-sm text-muted-foreground">{formatFileSize(media.file_size)}</span>
                    </div>
                    <div>
                      <span className="text-sm text-muted-foreground">{formatDate(media.created_at)}</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => handleEditImage(media)}
                        title="Edit Details"
                      >
                        <Edit className="h-4 w-4" />
                        <span className="sr-only">Edit</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => window.open(media.public_url, '_blank')}
                        title="View Original"
                      >
                        <ImageIcon className="h-4 w-4" />
                        <span className="sr-only">View Original</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-red-600 hover:text-red-600"
                        onClick={() => handleDeleteImage(media)}
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                        <span className="sr-only">Delete</span>
                      </Button>
                    </div>
                  </div>
                </div>
              )
            })
          )}
          </div>
          {paginatedData && paginatedData.totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-4 border-t">
              <PaginationInfo
                currentPage={currentPage}
                pageSize={pageSize}
                total={paginatedData.total}
              />
              <Pagination
                currentPage={currentPage}
                totalPages={paginatedData.totalPages}
                onPageChange={handlePageChange}
              />
            </div>
          )}
        </Card>

        {/* Edit Image Dialog */}
        <Dialog open={!!editingImage} onOpenChange={(open) => !open && setEditingImage(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingImage?.file_type === 'video' ? 'Edit Video' : 'Edit Image'}</DialogTitle>
            </DialogHeader>
            {editingImage && (
              <div className="space-y-4">
                <div className="relative aspect-video rounded-lg overflow-hidden bg-muted">
                  {editingImage.file_type === 'video' ? (
                    <video
                      src={`/api/media/proxy?url=${encodeURIComponent(editingImage.public_url)}`}
                      className="w-full h-full object-contain"
                      controls
                      muted
                    />
                  ) : (
                    <Image
                      src={editingImage.public_url}
                      alt={editingImage.alt_text || editingImage.original_name}
                      fill
                      className="object-contain"
                    />
                  )}
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-alt-text">
                    {editingImage.file_type === 'video' ? 'Description' : 'Alt Text'}
                  </Label>
                  <Input
                    id="edit-alt-text"
                    value={editAltText}
                    onChange={(e) => setEditAltText(e.target.value)}
                    placeholder={editingImage.file_type === 'video' ? 'Describe this video...' : 'Describe this image for accessibility'}
                  />
                  <p className="text-xs text-muted-foreground">
                    {editingImage.file_type === 'video' 
                      ? 'Description helps with organization and accessibility'
                      : 'Alt text helps screen readers and improves SEO'
                    }
                  </p>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingImage(null)}>
                Cancel
              </Button>
              <Button onClick={handleSaveEdit}>
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
    </>
  )
}