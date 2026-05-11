"use client"

import { useState, useEffect, useCallback } from "react"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { Card, CardTableHeader } from "@/components/ui/card"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Grid,
  List,
  Image as ImageIcon,
  Trash2,
  Edit,
  VideoIcon,
  Upload
} from "lucide-react"
import {
  AdminBulkDeleteButton,
  AdminConfirmDialog,
  AdminListFooter,
  AdminListSkeleton,
  AdminSelectionBanner,
  AdminSortButton,
  formatRelativeDate as formatDate,
  useAdminBulkSelection,
  useAdminSort
} from "@/components/admin/layout/list"
import {
  getPaginatedMediaAction,
  deleteImageAction,
  updateImageAction,
  getMediaIdsAction
} from "@/lib/actions/media/media-actions"
import type { MediaData, PaginatedMediaResponse } from "@/lib/actions/media/media-actions"
import Image from "next/image"
import { toast } from "sonner"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type MediaSortColumn = "name" | "type" | "size" | "added"

export default function ImagesPage() {
  const { currentSite, loading: siteLoading } = useSiteSwitcher()
  const currentSiteId = currentSite?.id
  const [viewMode, setViewMode] = useState<"list" | "gallery">("list")
  const [paginatedData, setPaginatedData] = useState<PaginatedMediaResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [filterType, setFilterType] = useState<"all" | "image" | "video">("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [editingImage, setEditingImage] = useState<MediaData | null>(null)
  const [editAltText, setEditAltText] = useState("")
  const [isUploading, setIsUploading] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize] = useState(20)
  const mediaSelection = useAdminBulkSelection()
  const clearMediaSelection = mediaSelection.clearSelection
  const mediaSort = useAdminSort<MediaSortColumn>()
  const [isDeleting, setIsDeleting] = useState(false)
  const [massDeleteConfirmOpen, setMassDeleteConfirmOpen] = useState(false)
  const [typeCounts, setTypeCounts] = useState<{
    all: number
    image: number
    video: number
  }>({ all: 0, image: 0, video: 0 })

  // Load type counts after mutations
  const loadTypeCounts = useCallback(async () => {
    if (!currentSiteId) {
      setTypeCounts({ all: 0, image: 0, video: 0 })
      return
    }

    const [allRes, imgRes, vidRes] = await Promise.all([
      getPaginatedMediaAction(1, 1, undefined, currentSiteId),
      getPaginatedMediaAction(1, 1, "image", currentSiteId),
      getPaginatedMediaAction(1, 1, "video", currentSiteId)
    ])
    setTypeCounts({
      all: allRes.data?.total ?? 0,
      image: imgRes.data?.total ?? 0,
      video: vidRes.data?.total ?? 0
    })
  }, [currentSiteId])

  const loadImages = useCallback(async () => {
    try {
      setIsLoading(true)
      if (!currentSiteId) {
        setPaginatedData({
          data: [],
          total: 0,
          page: currentPage,
          pageSize,
          totalPages: 0
        })
        return
      }

      const fileType = filterType === "all" ? undefined : (filterType as "image" | "video")
      const { data, error } = await getPaginatedMediaAction(currentPage, pageSize, fileType, currentSiteId)
      if (error) {
        toast.error(`Failed to load images: ${error}`)
      } else {
        setPaginatedData(data)
      }
    } catch (error) {
      toast.error("Failed to load images")
    } finally {
      setIsLoading(false)
    }
  }, [currentSiteId, currentPage, pageSize, filterType])

  // Load images when page, pageSize, or filterType changes
  useEffect(() => {
    if (siteLoading) return
    loadImages()
  }, [siteLoading, loadImages])

  useEffect(() => {
    setCurrentPage(1)
    clearMediaSelection()
  }, [currentSiteId, clearMediaSelection])

  useEffect(() => {
    if (siteLoading) return
    loadTypeCounts()
  }, [siteLoading, loadTypeCounts])

  // Reset to first page when filter changes
  const handleFilterChange = (newFilter: "all" | "image" | "video") => {
    setFilterType(newFilter)
    setCurrentPage(1)
    clearMediaSelection()
  }

  // Handle page change
  const handlePageChange = (page: number) => {
    setCurrentPage(page)
  }

  const handleDeleteImage = async (image: MediaData) => {
    if (!currentSiteId) return

    if (!confirm(`Are you sure you want to delete "${image.original_name}"? This action cannot be undone.`)) {
      return
    }

    try {
      const { error } = await deleteImageAction(image.id, currentSiteId)
      if (error) {
        toast.error(`Failed to delete image: ${error}`)
      } else {
        toast.success("Image deleted successfully")
        loadImages()
        loadTypeCounts()
      }
    } catch (error) {
      toast.error("Failed to delete image")
    }
  }

  const handleEditImage = (image: MediaData) => {
    setEditingImage(image)
    setEditAltText(image.alt_text || "")
  }

  const handleSaveEdit = async () => {
    if (!editingImage || !currentSiteId) return

    try {
      const { data, error } = await updateImageAction(
        editingImage.id,
        {
          alt_text: editAltText.trim() || undefined
        },
        currentSiteId
      )

      if (error) {
        toast.error(`Failed to update image: ${error}`)
      } else {
        toast.success("Image updated successfully")
        // Update the item in current page data
        if (paginatedData) {
          setPaginatedData({
            ...paginatedData,
            data: paginatedData.data.map((img) => (img.id === editingImage.id ? data! : img))
          })
        }
        setEditingImage(null)
        setEditAltText("")
      }
    } catch (error) {
      toast.error("Failed to update image")
    }
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !currentSite) return

    // Validate file type
    const imageTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"]
    const videoTypes = ["video/mp4", "video/webm", "video/quicktime", "video/x-msvideo", "video/x-matroska"]
    const allowedTypes = [...imageTypes, ...videoTypes]

    if (!allowedTypes.includes(file.type)) {
      toast.error(
        "Invalid file type. Only images (JPEG, PNG, GIF, WebP) and videos (MP4, WebM, MOV, AVI, MKV) are allowed."
      )
      return
    }

    const fileType = imageTypes.includes(file.type) ? "image" : "video"

    // Validate file size (10MB for images, 100MB for videos)
    const maxSize = fileType === "image" ? 10 * 1024 * 1024 : 100 * 1024 * 1024
    const maxSizeLabel = fileType === "image" ? "10MB" : "100MB"
    if (file.size > maxSize) {
      toast.error(`File size too large. Maximum size is ${maxSizeLabel}.`)
      return
    }

    setIsUploading(true)

    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("siteId", currentSite.id)

      const response = await fetch("/api/media/upload", {
        method: "POST",
        body: formData
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || "Upload failed")
      }

      toast.success("Image uploaded successfully!")
      loadImages()
      loadTypeCounts()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed")
    } finally {
      setIsUploading(false)
      // Clear the input
      if (e.target) {
        e.target.value = ""
      }
    }
  }

  // Select all items across all pages (lightweight ID-only fetch)
  const handleSelectAll = async () => {
    const total = paginatedData?.total ?? 0
    if (!currentSiteId || total === 0) return
    const fileType = filterType === "all" ? undefined : (filterType as "image" | "video")
    const { ids } = await getMediaIdsAction(fileType, currentSiteId)
    if (ids) {
      mediaSelection.selectAll(ids)
    }
  }

  const handleBulkDelete = async () => {
    if (!currentSiteId || mediaSelection.selectedCount === 0) {
      setMassDeleteConfirmOpen(false)
      return
    }

    const idsToDelete = Array.from(mediaSelection.selectedIds)
    setIsDeleting(true)
    let successCount = 0
    let failCount = 0

    try {
      for (const id of idsToDelete) {
        try {
          const { success } = await deleteImageAction(id, currentSiteId)
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
        toast.success(`Successfully deleted ${successCount} ${successCount === 1 ? "item" : "items"}`)
      }
      if (failCount > 0) {
        toast.error(`Failed to delete ${failCount} ${failCount === 1 ? "item" : "items"}`)
      }

      clearMediaSelection()
      setMassDeleteConfirmOpen(false)
      loadImages()
      loadTypeCounts()
    } catch (error) {
      toast.error("Failed to delete items")
    } finally {
      setIsDeleting(false)
    }
  }

  // Get current images from paginated data
  const images = paginatedData?.data || []
  const normalizedSearchQuery = searchQuery.trim().toLowerCase()
  const filteredImages = images.filter((image) => {
    if (!normalizedSearchQuery) return true
    return `${image.original_name} ${image.filename} ${image.alt_text ?? ""} ${image.file_type}`
      .toLowerCase()
      .includes(normalizedSearchQuery)
  })
  const filteredImageIds = filteredImages.map((media) => media.id)

  // Check if all items on current page are selected
  const allPageSelected = mediaSelection.isPageSelected(filteredImageIds)

  const sortedImages = [...filteredImages].sort((a, b) => {
    if (!mediaSort.sortColumn) return 0
    const dir = mediaSort.sortDirection === "asc" ? 1 : -1
    if (mediaSort.sortColumn === "name") return a.original_name.localeCompare(b.original_name) * dir
    if (mediaSort.sortColumn === "type") return a.file_type.localeCompare(b.file_type) * dir
    if (mediaSort.sortColumn === "size") return (a.file_size - b.file_size) * dir
    if (mediaSort.sortColumn === "added") return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * dir
    return 0
  })

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes"
    const k = 1024
    const sizes = ["Bytes", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
  }

  return (
    <>
      <StickyHeader />
      <AdminLayout>
        <div className="w-full">
          <DashboardSubheader
            items={[{ label: "Media" }]}
            search={{
              value: searchQuery,
              onValueChange: setSearchQuery,
              placeholder: "Search media"
            }}
            filterMenu={{
              value: filterType,
              onValueChange: (value) => handleFilterChange(value as "all" | "image" | "video"),
              items: [
                {
                  value: "all",
                  label: "All",
                  icon: List,
                  count: typeCounts.all
                },
                {
                  value: "image",
                  label: "Images",
                  icon: ImageIcon,
                  count: typeCounts.image
                },
                {
                  value: "video",
                  label: "Videos",
                  icon: VideoIcon,
                  count: typeCounts.video
                }
              ]
            }}
            preActions={
              <>
                <AdminBulkDeleteButton
                  deleting={isDeleting}
                  onClick={() => setMassDeleteConfirmOpen(true)}
                  selectedCount={mediaSelection.selectedCount}
                />
                {/* View Mode Toggle */}
                <div className="flex items-center border rounded-md">
                  <Button
                    variant={viewMode === "list" ? "default" : "ghost"}
                    size="default"
                    onClick={() => setViewMode("list")}
                    className="rounded-r-none"
                  >
                    <List className="w-4 h-4" />
                  </Button>
                  <Button
                    variant={viewMode === "gallery" ? "default" : "ghost"}
                    onClick={() => setViewMode("gallery")}
                    className="rounded-l-none"
                  >
                    <Grid className="w-4 h-4" />
                  </Button>
                </div>
              </>
            }
            actions={
              <>
                <Button
                  onClick={isUploading ? undefined : () => document.getElementById("image-upload-input")?.click()}
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
            accept="image/jpeg,image/jpg,image/png,image/gif,image/webp,video/mp4,video/webm,video/quicktime"
            onChange={handleImageUpload}
            className="hidden"
          />

          <Card>
            {viewMode === "list" && (
              /* Table Header */
              <CardTableHeader className="grid-cols-6">
                <div className="col-span-2 flex items-center space-x-4">
                  <Checkbox
                    checked={allPageSelected}
                    onCheckedChange={() => mediaSelection.togglePage(filteredImageIds)}
                    aria-label="Select all media"
                  />
                  <AdminSortButton
                    active={mediaSort.sortColumn === "name"}
                    direction={mediaSort.sortDirection}
                    onClick={() => mediaSort.toggleSort("name")}
                  >
                    File
                  </AdminSortButton>
                </div>
                <AdminSortButton
                  active={mediaSort.sortColumn === "type"}
                  direction={mediaSort.sortDirection}
                  onClick={() => mediaSort.toggleSort("type")}
                >
                  Type
                </AdminSortButton>
                <AdminSortButton
                  active={mediaSort.sortColumn === "size"}
                  direction={mediaSort.sortDirection}
                  onClick={() => mediaSort.toggleSort("size")}
                >
                  Size
                </AdminSortButton>
                <AdminSortButton
                  active={mediaSort.sortColumn === "added"}
                  direction={mediaSort.sortDirection}
                  onClick={() => mediaSort.toggleSort("added")}
                >
                  Added
                </AdminSortButton>
                <div>Actions</div>
              </CardTableHeader>
            )}

            {/* "Select all" banner — shown when all page items selected but more exist */}
            {paginatedData && (
              <AdminSelectionBanner
                allSelected={mediaSelection.allSelected}
                onClearSelection={mediaSelection.clearSelection}
                onSelectAll={handleSelectAll}
                selectedCount={mediaSelection.selectedCount}
                total={paginatedData.total}
                visibleCount={filteredImages.length}
              />
            )}

            <div className="divide-y divide-muted/80">
              {isLoading ? (
                viewMode === "gallery" ? (
                  <div className="p-6">
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                      {[...Array(10)].map((_, i) => (
                        <div
                          key={i}
                          className="relative bg-muted rounded-lg overflow-hidden aspect-square animate-pulse"
                        >
                          <div className="absolute inset-0 bg-muted"></div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <AdminListSkeleton rowCount={8} />
                )
              ) : images.length === 0 ? (
                <div className="p-8 text-center">
                  <ImageIcon className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground mb-4">No media found. Upload your first file to get started.</p>
                  <Button onClick={() => document.getElementById("image-upload-input")?.click()} variant="outline">
                    Upload Your First Media File
                  </Button>
                </div>
              ) : viewMode === "gallery" ? (
                <div className="p-6">
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                    {images.map((media) => (
                      <div key={media.id} className="group relative bg-muted rounded-lg overflow-hidden aspect-square">
                        {media.file_type === "video" ? (
                          <div className="relative w-full h-full bg-black">
                            <video
                              key={media.id}
                              src={`/api/media/proxy?url=${encodeURIComponent(media.public_url)}`}
                              className="w-full h-full object-contain"
                              muted
                              playsInline
                              preload="metadata"
                              onLoadedMetadata={(e) => {
                                e.currentTarget.currentTime = 0.1
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
                  const isSelected = mediaSelection.selectedIds.has(media.id)
                  return (
                    <div key={media.id} className={`p-6 transition-colors ${isSelected ? "bg-accent/50" : ""}`}>
                      <div className="grid grid-cols-6 gap-4 items-center">
                        <div className="col-span-2">
                          <div className="flex items-center space-x-4">
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => mediaSelection.toggleOne(media.id)}
                              aria-label={`Select ${media.original_name}`}
                            />
                            <div className="w-12 h-12 bg-muted rounded flex items-center justify-center overflow-hidden relative ml-2">
                              {media.file_type === "video" ? (
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
                            onClick={() => window.open(media.public_url, "_blank")}
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
              <AdminListFooter
                currentPage={currentPage}
                onPageChange={handlePageChange}
                pageSize={pageSize}
                total={paginatedData.total}
              />
            )}
          </Card>

          <AdminConfirmDialog
            open={massDeleteConfirmOpen}
            title={`Delete ${mediaSelection.selectedCount} ${mediaSelection.selectedCount === 1 ? "item" : "items"}?`}
            description="This removes the selected media from the image library. This action cannot be undone."
            disabled={isDeleting}
            confirmLabel={isDeleting ? "Deleting..." : "Delete"}
            onCancel={() => setMassDeleteConfirmOpen(false)}
            onConfirm={handleBulkDelete}
          />

          {/* Edit Image Dialog */}
          <Dialog open={!!editingImage} onOpenChange={(open) => !open && setEditingImage(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingImage?.file_type === "video" ? "Edit Video" : "Edit Image"}</DialogTitle>
              </DialogHeader>
              {editingImage && (
                <div className="space-y-4">
                  <div className="relative aspect-video rounded-lg overflow-hidden bg-muted">
                    {editingImage.file_type === "video" ? (
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
                      {editingImage.file_type === "video" ? "Description" : "Alt Text"}
                    </Label>
                    <Input
                      id="edit-alt-text"
                      value={editAltText}
                      onChange={(e) => setEditAltText(e.target.value)}
                      placeholder={
                        editingImage.file_type === "video"
                          ? "Describe this video..."
                          : "Describe this image for accessibility"
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      {editingImage.file_type === "video"
                        ? "Description helps with organization and accessibility"
                        : "Alt text helps screen readers and improves SEO"}
                    </p>
                  </div>
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditingImage(null)}>
                  Cancel
                </Button>
                <Button onClick={handleSaveEdit}>Save Changes</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </AdminLayout>
    </>
  )
}
