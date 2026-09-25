"use client"

import { useState, useEffect, useCallback } from "react"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import Grid from "lucide-react/dist/esm/icons/grid-3x3.js"
import List from "lucide-react/dist/esm/icons/list.js"
import ImageIcon from "lucide-react/dist/esm/icons/image.js"
import Trash2 from "lucide-react/dist/esm/icons/trash-2.js"
import Eye from "lucide-react/dist/esm/icons/eye.js"
import Settings from "lucide-react/dist/esm/icons/settings.js"
import VideoIcon from "lucide-react/dist/esm/icons/video.js"
import Upload from "lucide-react/dist/esm/icons/upload.js"
import {
  TableRightActions,
  TableRightActionsButton,
  TableRightActionsSearch,
  TableRightActionsSelectTrigger
} from "@/components/admin/layout/content/table-right-actions"
import {
  AdminBulkDeleteButton,
  AdminListFooter,
  AdminListPending,
  AdminRowAction,
  AdminRowActions,
  AdminSortableHead,
  AdminSortButton,
  AdminTableShell,
  ConfirmDestructive,
  RelativeDate,
  useAdminBulkSelection,
  useAdminSort,
} from "@/components/admin/layout/list"
import {
  getPaginatedMediaAction,
  deleteMediaAction,
  updateMediaAction
} from "@/lib/actions/media/media-actions"
import type { MediaData, PaginatedMediaResponse } from "@/lib/actions/media/media-actions"
import Image from "@/components/app-image"
import { resolveMediaPlaybackUrl } from "@/lib/utils/media-url"
import { resizeImageForUpload } from "@/lib/utils/image-resize"
import { showActionError, showActionSuccess } from "@/lib/utils/admin-action-feedback"
import { useClearSelectionOnListChange } from "@/lib/use-clear-selection"
import { useResetPageOnListChange } from "@/lib/use-reset-page"
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
  // Everything that changes what the table shows, minus the page itself.
  const listQueryKey = `${currentSiteId}|${filterType}|${searchQuery}|${mediaSort.sortColumn}|${mediaSort.sortDirection}`
  // Searching, filtering or re-sorting from a later page would otherwise
  // land you past the end of the shorter result.
  useResetPageOnListChange(setCurrentPage, listQueryKey)
  // Ticks never survive a change to what the table is showing — the page
  // and rows-per-page included, so a bulk action only ever means rows on
  // screen.
  useClearSelectionOnListChange(mediaSelection, `${listQueryKey}|${currentPage}|${pageSize}`)

  const [isDeleting, setIsDeleting] = useState(false)
  const [massDeleteConfirmOpen, setMassDeleteConfirmOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<MediaData | null>(null)

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
      const { data, error } = await getPaginatedMediaAction({ data: { page: currentPage, pageSize: pageSize, fileType: fileType, site_id: currentSiteId, mimeType: mimeType } })
      if (error) {
        showActionError(`Failed to load images: ${error}`)
      } else {
        setPaginatedData(data)
      }
    } catch (error) {
      showActionError("Failed to load images")
    } finally {
      setIsLoading(false)
    }
  }, [currentSiteId, currentPage, pageSize, filterType])

  // Load images when page, pageSize, or filterType changes
  useEffect(() => {
    if (siteLoading) return
    loadImages()
  }, [siteLoading, loadImages])

  const handleFilterChange = (newFilter: "all" | "image" | "video" | "svg") => {
    setFilterType(newFilter)
  }

  // Handle page change
  const handlePageChange = (page: number) => {
    setCurrentPage(page)
  }

  const handleDeleteImage = async (image: MediaData) => {
    if (!currentSiteId) return false

    setIsDeleting(true)
    try {
      const { error } = await deleteMediaAction({ data: { mediaId: image.id, site_id: currentSiteId } })
      if (error) {
        showActionError(`Failed to delete image: ${error}`)
        return false
      } else {
        showActionSuccess("Image deleted.")
        loadImages()
        return true
      }
    } catch (error) {
      showActionError("Failed to delete image")
      return false
    } finally {
      setIsDeleting(false)
    }
  }

  const handleEditImage = (image: MediaData) => {
    setEditingImage(image)
    setEditAltText(image.alt_text || "")
  }

  const handleSaveEdit = async () => {
    if (!editingImage || !currentSiteId) return

    try {
      const { data, error } = await updateMediaAction({ data: { mediaId: editingImage.id, updates: {
          alt_text: editAltText.trim() || undefined
        }, site_id: currentSiteId } })

      if (error) {
        showActionError(`Failed to update image: ${error}`)
      } else {
        showActionSuccess("Image updated.")
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
      showActionError("Failed to update image")
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
      showActionError(
        "Invalid file type. Only images (JPEG, PNG, GIF, WebP, SVG) and videos (MP4, WebM, MOV, AVI, MKV) are allowed."
      )
      return
    }

    const fileType = imageTypes.includes(file.type) ? "image" : "video"

    // Validate file size (10MB for images, 100MB for videos)
    const maxSize = fileType === "image" ? 10 * 1024 * 1024 : 100 * 1024 * 1024
    const maxSizeLabel = fileType === "image" ? "10MB" : "100MB"
    if (file.size > maxSize) {
      showActionError(`File size too large. Maximum size is ${maxSizeLabel}.`)
      return
    }

    setIsUploading(true)

    try {
      const formData = new FormData()
      // Shrunk before upload so visitors are not served the original camera- or
      // export-sized file. Falls back to the original if it cannot be resized.
      formData.append("file", await resizeImageForUpload(file))
      formData.append("siteId", currentSite.id)

      const response = await fetch("/api/media/upload", {
        method: "POST",
        body: formData
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || "Upload failed")
      }

      showActionSuccess("Image uploaded.")
      loadImages()
    } catch (error) {
      showActionError(error instanceof Error ? error.message : "Upload failed")
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
          const { success } = await deleteMediaAction({ data: { mediaId: id, site_id: currentSiteId } })
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
        showActionSuccess(successCount === 1 ? "Item deleted." : "Items deleted.")
      }
      if (failCount > 0) {
        showActionError(`Failed to delete ${failCount} ${failCount === 1 ? "item" : "items"}`)
      }

      clearMediaSelection()
      setMassDeleteConfirmOpen(false)
      loadImages()
    } catch (error) {
      showActionError("Failed to delete items")
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
            icon={<ImageIcon className="text-muted-foreground" />}
            count={paginatedData?.total ?? 0}
            loading={isLoading}
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
                  pageSize={pageSize}
                  total={paginatedData?.total ?? 0}
                />
              ) : null
            }
          >

            {viewMode === "gallery" ? (
              isLoading && sortedImages.length === 0 ? null : sortedImages.length === 0 ? (
                <div className="p-8 text-center">
                  <ImageIcon className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
                  {normalizedSearchQuery || filterType !== "all" ? (
                    <p className="text-muted-foreground">No media found matching your search.</p>
                  ) : (
                    <>
                      <p className="mb-4 text-muted-foreground">No media found. Upload your first file to get started.</p>
                      <Button onClick={() => document.getElementById("image-upload-input")?.click()} variant="outline">
                        Upload Your First Media File
                      </Button>
                    </>
                  )}
                </div>
              ) : (
                <div className="px-5 pb-5">
                  <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8">
                    {sortedImages.map((media) => {
                      const isSelected = mediaSelection.selectedIds.has(media.id)
                      return (
                        <div
                          key={media.id}
                          className={`group relative aspect-square overflow-hidden rounded-lg border bg-muted ${isSelected ? "border-destructive ring-2 ring-destructive/25" : ""}`}
                        >
                          <button
                            type="button"
                            className="relative block h-full w-full"
                            onClick={() => handleEditImage(media)}
                            aria-label={`Edit ${media.original_name}`}
                          >
                            {media.file_type === "video" ? (
                              <div className="relative h-full w-full bg-black">
                                <video
                                  key={media.id}
                                  src={resolveMediaPlaybackUrl(media.public_url)}
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
                            <div className="flex h-8 w-8 items-center justify-center">
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => mediaSelection.toggleOne(media.id)}
                                className="border-foreground"
                                aria-label={`Select ${media.original_name}`}
                              />
                            </div>
                            <AdminRowAction
                              icon={Settings}
                              label="File settings"
                              onClick={() => handleEditImage(media)}
                            />
                            <AdminRowAction
                              icon={Trash2}
                              label="Delete file"
                              onClick={() => setDeleteTarget(media)}
                            />
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
                      <AdminSortableHead column="main" sort={mediaSort} sortKey="name">File</AdminSortableHead>
                      <AdminSortableHead column="meta" sort={mediaSort} sortKey="type">Type</AdminSortableHead>
                      <AdminSortableHead column="meta" sort={mediaSort} sortKey="size">Size</AdminSortableHead>
                      <AdminSortableHead column="meta" sort={mediaSort} sortKey="added">Added</AdminSortableHead>
                      <TableHead column="meta">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading && sortedImages.length === 0 ? (
                      <AdminListPending />
                    ) : images.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="h-32 text-center">
                          <ImageIcon className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
                          {normalizedSearchQuery || filterType !== "all" ? (
                            <p className="text-muted-foreground">No media found matching your search.</p>
                          ) : (
                            <>
                              <p className="mb-4 text-muted-foreground">
                                No media found. Upload your first file to get started.
                              </p>
                              <Button onClick={() => document.getElementById("image-upload-input")?.click()} variant="outline">
                                Upload Your First Media File
                              </Button>
                            </>
                          )}
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
                                  <h4 className="truncate text-sm font-medium sm:text-base" title={media.original_name}>{media.original_name}</h4>
                                  {media.alt_text && (
                                    <p className="truncate text-xs text-muted-foreground sm:text-sm" title={media.alt_text}>{media.alt_text}</p>
                                  )}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell column="mutedMeta" className="capitalize">{media.file_type}</TableCell>
                            <TableCell column="mutedMeta">{formatFileSize(media.file_size)}</TableCell>
                            <TableCell column="mutedMeta"><RelativeDate date={media.created_at} /></TableCell>
                            <TableCell column="meta">
                              <AdminRowActions>
                                <AdminRowAction
                                  icon={Settings}
                                  className="md:opacity-0 md:transition-opacity md:group-hover:opacity-100 md:focus-within:opacity-100"
                                  label="File settings"
                                  onClick={() => handleEditImage(media)}
                                />
                                <AdminRowAction
                                  icon={Eye}
                                  external
                                  href={media.public_url}
                                  label="Preview original"
                                />
                                <AdminRowAction
                                  icon={Trash2}
                                  className="md:opacity-0 md:transition-opacity md:group-hover:opacity-100 md:focus-within:opacity-100"
                                  label="Delete file"
                                  onClick={() => setDeleteTarget(media)}
                                />
                              </AdminRowActions>
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

          <ConfirmDestructive
            action="delete-media"
            open={massDeleteConfirmOpen}
            title={`Delete ${mediaSelection.selectedCount} ${mediaSelection.selectedCount === 1 ? "item" : "items"}?`}
            description="This removes the selected media from the image library. This action cannot be undone."
            disabled={isDeleting}
            confirmLabel={isDeleting ? "Deleting..." : "Delete"}
            onCancel={() => setMassDeleteConfirmOpen(false)}
            onConfirm={handleBulkDelete}
          />
          <ConfirmDestructive
            action="delete-media"
            open={!!deleteTarget}
            title={`Delete ${deleteTarget?.original_name ?? "media"}?`}
            description="This removes the media from the image library. This action cannot be undone."
            disabled={isDeleting}
            confirmLabel={isDeleting ? "Deleting..." : "Delete"}
            onCancel={() => setDeleteTarget(null)}
            onConfirm={async () => {
              if (deleteTarget && await handleDeleteImage(deleteTarget)) {
                setDeleteTarget(null)
              }
            }}
          />

          {/* Edit Image Dialog */}
          <Dialog open={!!editingImage} onOpenChange={(open) => !open && setEditingImage(null)}>
            <DialogContent className="max-h-[85vh] w-[710px] max-w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-[710px]">
              <DialogHeader>
                <DialogTitle>{editingImage?.file_type === "video" ? "Edit Video" : "Edit Image"}</DialogTitle>
              </DialogHeader>
              {editingImage && (
                <div className="space-y-4">
                  {editingImage.file_type === "video" ? (
                    <video
                      src={resolveMediaPlaybackUrl(editingImage.public_url)}
                      className="mx-auto max-h-[50vh] w-full rounded-lg object-contain"
                      controls
                      muted
                    />
                  ) : (
                    <Image
                      src={editingImage.public_url}
                      alt={editingImage.alt_text || editingImage.original_name}
                      width={384}
                      height={384}
                      className="mx-auto max-h-[50vh] w-full rounded-lg object-contain"
                    />
                  )}
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
                {editingImage && (
                  <Button
                    variant="destructive"
                    onClick={() => {
                      setDeleteTarget(editingImage)
                      setEditingImage(null)
                    }}
                  >
                    Delete
                  </Button>
                )}
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
