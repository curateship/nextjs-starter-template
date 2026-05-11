"use client"

import { useEffect, useMemo, useState } from "react"
import Image from "next/image"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { Card, CardTableHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  AdminBulkDeleteButton,
  AdminConfirmDialog,
  AdminListSkeleton,
  AdminSortButton,
  formatRelativeDate as formatDate,
  useAdminBulkSelection,
  useAdminSort
} from "@/components/admin/layout/list"
import { cn } from "@/lib/utils/tailwind"
import { deleteMediaItemsAction, scanUnusedMediaAction } from "@/lib/actions/media/media-actions"
import type { MediaData } from "@/lib/actions/media/media-actions"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import { ImageOff, Image as ImageIcon, RefreshCw, Trash2, VideoIcon } from "lucide-react"
import { toast } from "sonner"

type SortColumn = "name" | "type" | "size" | "added"

export default function UnusedMediaPage() {
  const { currentSite, loading: siteLoading } = useSiteSwitcher()
  const currentSiteId = currentSite?.id
  const [mediaItems, setMediaItems] = useState<MediaData[] | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [isScanning, setIsScanning] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [scannedAt, setScannedAt] = useState<string | null>(null)
  const mediaSelection = useAdminBulkSelection()
  const clearMediaSelection = mediaSelection.clearSelection
  const mediaSort = useAdminSort<SortColumn>()

  useEffect(() => {
    setMediaItems(null)
    clearMediaSelection()
    setScannedAt(null)
  }, [currentSiteId, clearMediaSelection])

  async function handleScan() {
    if (!currentSiteId) return

    setIsScanning(true)
    clearMediaSelection()
    try {
      const { data, error } = await scanUnusedMediaAction(currentSiteId)
      if (error) {
        toast.error(`Scan failed: ${error}`)
        return
      }

      setMediaItems(data?.data ?? [])
      setScannedAt(data?.scanned_at ?? new Date().toISOString())
      toast.success(`Found ${data?.total ?? 0} unused media ${(data?.total ?? 0) === 1 ? "item" : "items"}`)
    } catch {
      toast.error("Scan failed")
    } finally {
      setIsScanning(false)
    }
  }

  async function handleDelete(ids: string[]) {
    if (!currentSiteId || ids.length === 0) return

    setIsDeleting(true)
    try {
      const { success, deletedCount, error } = await deleteMediaItemsAction(ids, currentSiteId)
      if (!success || error) {
        toast.error(`Delete failed: ${error ?? "Unknown error"}`)
        return
      }

      setMediaItems((prev) => prev?.filter((item) => !ids.includes(item.id)) ?? null)
      ids.forEach((id) => mediaSelection.remove(id))
      toast.success(`Deleted ${deletedCount} ${deletedCount === 1 ? "item" : "items"}`)
    } catch {
      toast.error("Delete failed")
    } finally {
      setIsDeleting(false)
      setDeleteConfirmOpen(false)
    }
  }

  async function handleDeleteOne(media: MediaData) {
    if (!confirm(`Delete "${media.original_name}"? This action cannot be undone.`)) return
    await handleDelete([media.id])
  }

  const normalizedSearchQuery = searchQuery.trim().toLowerCase()
  const filteredMedia = useMemo(() => {
    const items = mediaItems ?? []
    return items.filter((item) => {
      if (!normalizedSearchQuery) return true
      return `${item.original_name} ${item.filename} ${item.alt_text ?? ""} ${item.file_type}`
        .toLowerCase()
        .includes(normalizedSearchQuery)
    })
  }, [mediaItems, normalizedSearchQuery])

  const sortedMedia = useMemo(() => {
    return [...filteredMedia].sort((a, b) => {
      if (!mediaSort.sortColumn) return 0
      const dir = mediaSort.sortDirection === "asc" ? 1 : -1
      if (mediaSort.sortColumn === "name") return a.original_name.localeCompare(b.original_name) * dir
      if (mediaSort.sortColumn === "type") return a.file_type.localeCompare(b.file_type) * dir
      if (mediaSort.sortColumn === "size") return (a.file_size - b.file_size) * dir
      if (mediaSort.sortColumn === "added") return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * dir
      return 0
    })
  }, [filteredMedia, mediaSort.sortColumn, mediaSort.sortDirection])

  const sortedMediaIds = sortedMedia.map((media) => media.id)

  function formatFileSize(bytes: number) {
    if (bytes === 0) return "0 Bytes"
    const k = 1024
    const sizes = ["Bytes", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
  }

  return (
    <>
      <StickyHeader />
      <AdminLayout>
        <div className="w-full">
          <DashboardSubheader
            items={[{ label: "Media", href: "/admin/media" }, { label: "Unused" }]}
            search={{
              value: searchQuery,
              onValueChange: setSearchQuery,
              placeholder: "Search unused media"
            }}
            preActions={
              <AdminBulkDeleteButton
                deleting={isDeleting}
                onClick={() => setDeleteConfirmOpen(true)}
                selectedCount={mediaSelection.selectedCount}
              />
            }
            actions={
              <Button onClick={handleScan} disabled={siteLoading || !currentSiteId || isScanning}>
                <RefreshCw className={cn("h-4 w-4", isScanning && "animate-spin")} />
                <span className="hidden sm:inline">{isScanning ? "Scanning..." : "Scan"}</span>
              </Button>
            }
          />

          <Card>
            <CardTableHeader className="grid-cols-6">
              <div className="col-span-2 flex items-center space-x-4">
                <Checkbox
                  checked={mediaSelection.isPageSelected(sortedMediaIds)}
                  onCheckedChange={() => mediaSelection.togglePage(sortedMediaIds)}
                  aria-label="Select all unused media"
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

            <div className="divide-y divide-muted/80">
              {isScanning ? (
                <AdminListSkeleton rowCount={6} />
              ) : mediaItems === null ? (
                <div className="p-8 text-center">
                  <ImageOff className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                  <p className="mb-4 text-muted-foreground">
                    Run a scan to find media that is not referenced by this site.
                  </p>
                  <Button onClick={handleScan} disabled={siteLoading || !currentSiteId}>
                    <RefreshCw className="h-4 w-4" />
                    Scan
                  </Button>
                </div>
              ) : sortedMedia.length === 0 ? (
                <div className="p-8 text-center">
                  <ImageOff className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                  <p className="text-muted-foreground">
                    {mediaItems.length === 0 ? "No unused media found." : "No unused media matches your search."}
                  </p>
                  {scannedAt ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Last scanned {new Date(scannedAt).toLocaleString()}
                    </p>
                  ) : null}
                </div>
              ) : (
                sortedMedia.map((media) => {
                  const isSelected = mediaSelection.selectedIds.has(media.id)
                  return (
                    <div key={media.id} className={cn("p-6 transition-colors", isSelected && "bg-accent/50")}>
                      <div className="grid grid-cols-6 gap-4 items-center">
                        <div className="col-span-2">
                          <div className="flex items-center space-x-4">
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => mediaSelection.toggleOne(media.id)}
                              aria-label={`Select ${media.original_name}`}
                            />
                            <div className="relative ml-2 flex h-12 w-12 items-center justify-center overflow-hidden rounded bg-muted">
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
                              <h4 className="text-sm font-medium">{media.original_name}</h4>
                              {media.alt_text ? (
                                <p className="max-w-[200px] truncate text-xs text-muted-foreground">{media.alt_text}</p>
                              ) : null}
                            </div>
                          </div>
                        </div>
                        <div>
                          <span className="text-sm capitalize text-muted-foreground">{media.file_type}</span>
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
                            onClick={() => handleDeleteOne(media)}
                            disabled={isDeleting}
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
          </Card>

          <AdminConfirmDialog
            open={deleteConfirmOpen}
            title={`Delete ${mediaSelection.selectedCount} ${mediaSelection.selectedCount === 1 ? "item" : "items"}?`}
            description="This removes the selected unused media from the library. This action cannot be undone."
            disabled={isDeleting}
            confirmLabel={isDeleting ? "Deleting..." : "Delete"}
            onCancel={() => setDeleteConfirmOpen(false)}
            onConfirm={() => handleDelete(Array.from(mediaSelection.selectedIds))}
          />
        </div>
      </AdminLayout>
    </>
  )
}
