"use client"

import { useState, useEffect, useCallback } from "react"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
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
  TableRightActions,
  TableRightActionsButton,
  TableRightActionsSearch,
  TableRightActionsSelectTrigger
} from "@/components/admin/layout/content/table-right-actions"
import {
  AdminBulkDeleteButton,
  AdminConfirmDialog,
  AdminListFooter,
  AdminListSkeleton,
  AdminSortButton,
  AdminTableShell,
  formatRelativeDate as formatDate,
  useAdminBulkSelection,
  useAdminSort
} from "@/components/admin/layout/list"
import {
  getPaginatedMediaAction,
  deleteImageAction,
  updateImageAction
} from "@/lib/actions/media/media-actions"
import type { MediaData, PaginatedMediaResponse } from "@/lib/actions/media/media-actions"
import Image from "next/image"
import { toast } from "sonner"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectValue } from "@/components/ui/select"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table"

type MediaSortColumn = "name" | "type" | "size" | "added"

export default function ImagesPage() {
  const { currentSite, loading: siteLoading, pageSize } = useSiteSwitcher()
  const currentSiteId = currentSite?.id
  const [viewMode, setViewMode] = useState<"list" | "gallery">("gallery")
  const [paginatedData, setPaginatedData] = useState<PaginatedMediaResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [filterType, setFilterType] = useState<"all" | "image" | "video" | "svg">("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [editingImage, setEditingImage] = useState<MediaData | null>(null)
  const [editAltText, setEditAltText] = useState("")
  const [isUploading, setIsUploading] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const mediaSelection = useAdminBulkSelection()
  const clearMediaSelection = mediaSelection.clearSelection
  const mediaSort = useAdminSort<MediaSortColumn>()
  const [isDeleting, setIsDeleting] = useState(false)
  const [massDeleteConfirmOpen, setMassDeleteConfirmOpen] = useState(false)

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

      const fileType = filterType === "all" || filterType === "svg" ? undefined : (filterType as "image" | "video")
      const mimeType = filterType === "svg" ? "image/svg+xml" : undefined
      const { data, error } = await getPaginatedMediaAction(currentPage, pageSize, fileType, currentSiteId, mimeType)
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

  // Reset to first page when filter changes
  const handleFilterChange = (newFilter: "all" | "image" | "video" | "svg") => {
    setFilterType(newFilter)
    setCurrentPage(1)
    clearMediaSelection()
  }

  // Handle page change
  const handlePageChange = (page: number) => {
    setCurrentPage(page)
  }

  const handlePageSizeChange = () => {
    clearMediaSelection()
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
    const imageTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp", "image/svg+xml"]
    const videoTypes = ["video/mp4", "video/webm", "video/quicktime", "video/x-msvideo", "video/x-matroska"]
    const allowedTypes = [...imageTypes, ...videoTypes]

    if (!allowedTypes.includes(file.type)) {
      toast.error(
        "Invalid file type. Only images (JPEG, PNG, GIF, WebP, SVG) and videos (MP4, WebM, MOV, AVI, MKV) are allowed."
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
  const sortedImages = [...filteredImages].sort((a, b) => {
    if (!mediaSort.sortColumn) return 0
    const dir = mediaSort.sortDirection === "asc" ? 1 : -1
    if (mediaSort.sortColumn === "name") return a.original_name.localeCompare(b.original_name) * dir
    if (mediaSort.sortColumn === "type") return a.file_type.localeCompare(b.file_type) * dir
    if (mediaSort.sortColumn === "size") return (a.file_size - b.file_size) * dir
    if (mediaSort.sortColumn === "added") return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * dir
    return 0
  })
  const visibleMediaIds = sortedImages.map((media) => media.id)

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
          />

          {/* Hidden file input */}
          <input
            id="image-upload-input"
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/gif,image/webp,image/svg+xml,video/mp4,video/webm,video/quicktime,video/x-msvideo,video/x-matroska"
            onChange={handleImageUpload}
            className="hidden"
          />

          <AdminTableShell
            title="Media"
            icon={<ImageIcon className="size-4 text-muted-foreground sm:size-[18px]" />}
            count={paginatedData?.total ?? 0}
            selectedCount={mediaSelection.selectedCount}
            onClearSelection={mediaSelection.clearSelection}
            titleActions={
              <AdminBulkDeleteButton
                deleting={isDeleting}
                onClick={() => setMassDeleteConfirmOpen(true)}
                selectedCount={mediaSelection.selectedCount}
              />
            }
            controls={
              <TableRightActions>
                <TableRightActionsSearch
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search media"
                />
                <Select
                  value={filterType}
                  onValueChange={(value) => handleFilterChange(value as "all" | "image" | "video" | "svg")}
                >
                  <TableRightActionsSelectTrigger aria-label="Media type filter">
                    <SelectValue />
                  </TableRightActionsSelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="image">Images</SelectItem>
                    <SelectItem value="video">Videos</SelectItem>
                    <SelectItem value="svg">SVG</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex h-8 items-center rounded-md border">
                  <TableRightActionsButton
                    variant={viewMode === "list" ? "default" : "ghost"}
                    size="icon"
                    onClick={() => setViewMode("list")}
                    className="h-8 w-8 rounded-r-none sm:h-8"
                    aria-label="List view"
                  >
                    <List className="h-4 w-4" />
                  </TableRightActionsButton>
                  <TableRightActionsButton
                    variant={viewMode === "gallery" ? "default" : "ghost"}
                    size="icon"
                    onClick={() => setViewMode("gallery")}
                    className="h-8 w-8 rounded-l-none sm:h-8"
                    aria-label="Gallery view"
                  >
                    <Grid className="h-4 w-4" />
                  </TableRightActionsButton>
                </div>
                <TableRightActionsButton
                  onClick={isUploading ? undefined : () => document.getElementById("image-upload-input")?.click()}
                  disabled={isUploading}
                >
                  <Upload className="h-4 w-4" />
                  <span className="hidden sm:inline">{isUploading ? "Uploading..." : "Upload Media"}</span>
                </TableRightActionsButton>
              </TableRightActions>
            }
            footer={
              !isLoading ? (
                <AdminListFooter
                  currentPage={currentPage}
                  onPageChange={handlePageChange}
                  onPageSizeChange={handlePageSizeChange}
                  pageSize={pageSize}
                  total={paginatedData?.total ?? 0}
                />
              ) : null
            }
          >

            {viewMode === "gallery" ? (
              isLoading ? (
                <div className="px-5 pb-5">
                  <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8">
                    {[...Array(10)].map((_, i) => (
                      <div
                        key={i}
                        className="relative aspect-square animate-pulse overflow-hidden rounded-lg bg-muted"
                      >
                        <div className="absolute inset-0 bg-muted" />
                      </div>
                    ))}
                  </div>
                </div>
              ) : sortedImages.length === 0 ? (
                <div className="p-8 text-center">
                  <ImageIcon className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
                  <p className="mb-4 text-muted-foreground">No media found. Upload your first file to get started.</p>
                  <Button onClick={() => document.getElementById("image-upload-input")?.click()} variant="outline">
                    Upload Your First Media File
                  </Button>
                </div>
              ) : (
                <div className="px-5 pb-5">
                  <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8">
                    {sortedImages.map((media) => {
                      const isSelected = mediaSelection.selectedIds.has(media.id)
                      return (
                        <div
                          key={media.id}
                          className={`group relative aspect-square overflow-hidden rounded-lg border bg-muted ${isSelected ? "border-green-500 ring-2 ring-green-500/25" : ""}`}
                        >
                          <button
                            type="button"
                            className="relative block h-full w-full"
                            onClick={() => mediaSelection.toggleOne(media.id)}
                            aria-pressed={isSelected}
                            aria-label={`Select ${media.original_name}`}
                          >
                            {media.file_type === "video" ? (
                              <div className="relative h-full w-full bg-black">
                                <video
                                  key={media.id}
                                  src={`/api/media/proxy?url=${encodeURIComponent(media.public_url)}`}
                                  className="h-full w-full object-contain"
                                  muted
                                  playsInline
                                  preload="metadata"
                                  onLoadedMetadata={(e) => {
                                    e.currentTarget.currentTime = 0.1
                                  }}
                                />
                                <div className="absolute left-2 top-2">
                                  <VideoIcon className="h-4 w-4 text-white drop-shadow-lg" />
                                </div>
                              </div>
                            ) : media.mime_type === "image/svg+xml" ? (
                              <img
                                src={media.public_url}
                                alt={media.alt_text || media.original_name}
                                className="h-full w-full object-contain"
                              />
                            ) : (
                              <Image
                                src={media.public_url}
                                alt={media.alt_text || media.original_name}
                                fill
                                className="object-contain"
                                sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 20vw"
                              />
                            )}
                          </button>
                          <div className="absolute right-2 bottom-2 flex gap-1 rounded-md bg-background/90 p-1 shadow-sm md:opacity-0 md:transition-opacity md:group-hover:opacity-100 md:focus-within:opacity-100">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleEditImage(media)}
                              className="h-8 w-8 cursor-pointer p-0"
                              aria-label="Edit media"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDeleteImage(media)}
                              className="h-8 w-8 cursor-pointer p-0 text-destructive hover:text-destructive"
                              aria-label="Delete media"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            ) : (
              <ScrollArea className="w-full">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead column="select">
                        <Checkbox
                          checked={mediaSelection.isPageSelected(visibleMediaIds)}
                          onCheckedChange={() => mediaSelection.togglePage(visibleMediaIds)}
                          aria-label="Select all media"
                        />
                      </TableHead>
                      <TableHead column="main">
                        <AdminSortButton
                          active={mediaSort.sortColumn === "name"}
                          direction={mediaSort.sortDirection}
                          onClick={() => mediaSort.toggleSort("name")}
                        >
                          File
                        </AdminSortButton>
                      </TableHead>
                      <TableHead column="meta">
                        <AdminSortButton
                          active={mediaSort.sortColumn === "type"}
                          direction={mediaSort.sortDirection}
                          onClick={() => mediaSort.toggleSort("type")}
                        >
                          Type
                        </AdminSortButton>
                      </TableHead>
                      <TableHead column="meta">
                        <AdminSortButton
                          active={mediaSort.sortColumn === "size"}
                          direction={mediaSort.sortDirection}
                          onClick={() => mediaSort.toggleSort("size")}
                        >
                          Size
                        </AdminSortButton>
                      </TableHead>
                      <TableHead column="meta">
                        <AdminSortButton
                          active={mediaSort.sortColumn === "added"}
                          direction={mediaSort.sortDirection}
                          onClick={() => mediaSort.toggleSort("added")}
                        >
                          Added
                        </AdminSortButton>
                      </TableHead>
                      <TableHead column="meta">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <AdminListSkeleton columns={6} rowCount={8} actionCount={3} />
                    ) : images.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="h-32 text-center">
                          <ImageIcon className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
                          <p className="mb-4 text-muted-foreground">
                            No media found. Upload your first file to get started.
                          </p>
                          <Button onClick={() => document.getElementById("image-upload-input")?.click()} variant="outline">
                            Upload Your First Media File
                          </Button>
                        </TableCell>
                      </TableRow>
                    ) : (
                      sortedImages.map((media) => {
                        const isSelected = mediaSelection.selectedIds.has(media.id)
                        return (
                          <TableRow
                            key={media.id}
                            data-state={isSelected ? "selected" : undefined}
                            className="group"
                          >
                            <TableCell column="select">
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => mediaSelection.toggleOne(media.id)}
                                aria-label={`Select ${media.original_name}`}
                              />
                            </TableCell>
                            <TableCell column="main">
                              <div className="flex min-w-0 items-center space-x-4">
                                <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded bg-muted">
                                  {media.file_type === "video" ? (
                                    <VideoIcon className="h-5 w-5 text-muted-foreground" />
                                  ) : media.mime_type === "image/svg+xml" ? (
                                    <img
                                      src={media.public_url}
                                      alt={media.alt_text || media.original_name}
                                      className="h-full w-full object-contain"
                                    />
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
                                <div className="min-w-0">
                                  <h4 className="truncate text-sm font-medium sm:text-base">{media.original_name}</h4>
                                  {media.alt_text && (
                                    <p className="truncate text-xs text-muted-foreground sm:text-sm">{media.alt_text}</p>
                                  )}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell column="mutedMeta" className="capitalize">{media.file_type}</TableCell>
                            <TableCell column="mutedMeta">{formatFileSize(media.file_size)}</TableCell>
                            <TableCell column="mutedMeta">{formatDate(media.created_at)}</TableCell>
                            <TableCell column="meta">
                              <div className="flex items-center space-x-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 md:opacity-0 md:transition-opacity md:group-hover:opacity-100 md:focus-within:opacity-100"
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
                                  className="h-8 w-8 p-0 text-destructive hover:text-destructive md:opacity-0 md:transition-opacity md:group-hover:opacity-100 md:focus-within:opacity-100"
                                  onClick={() => handleDeleteImage(media)}
                                  title="Delete"
                                >
                                  <Trash2 className="h-4 w-4" />
                                  <span className="sr-only">Delete</span>
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        )
                      })
                    )}
                  </TableBody>
                </Table>
                <ScrollBar orientation="horizontal" />
              </ScrollArea>
            )}
          </AdminTableShell>

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
                  <div
                    className={
                      editingImage.file_type === "video"
                        ? "relative mx-auto aspect-video w-full max-w-xl overflow-hidden rounded-lg border bg-muted"
                        : "relative mx-auto h-[50vh] max-h-96 min-h-48 w-full max-w-80 overflow-hidden rounded-lg border bg-muted"
                    }
                  >
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
