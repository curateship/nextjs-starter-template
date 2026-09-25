"use client"

import { useEffect, useMemo, useState } from "react"
import Image from "@/components/app-image"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import {
  TableRightActions,
  TableRightActionsButton,
  TableRightActionsSearch
} from "@/components/admin/layout/content/table-right-actions"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table"
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
import { cn } from "@/lib/utils/tailwind"
import { deleteMediaItemsAction, scanUnusedMediaAction } from "@/lib/actions/media/media-actions"
import type { MediaData } from "@/lib/actions/media/media-actions"
import { useClearSelectionOnListChange } from "@/lib/use-clear-selection"
import { useResetPageOnListChange } from "@/lib/use-reset-page"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import Eye from "lucide-react/dist/esm/icons/eye.js"
import ImageOff from "lucide-react/dist/esm/icons/image-off.js"
import RefreshCw from "lucide-react/dist/esm/icons/refresh-cw.js"
import Trash2 from "lucide-react/dist/esm/icons/trash-2.js"
import VideoIcon from "lucide-react/dist/esm/icons/video.js"
import { showActionError, showActionSuccess } from "@/lib/utils/admin-action-feedback"

type SortColumn = "name" | "type" | "size" | "added"

export default function UnusedMediaPage() {
  const { currentSite, loading: siteLoading, pageSize } = useSiteSwitcher()
  const currentSiteId = currentSite?.id
  const [mediaItems, setMediaItems] = useState<MediaData[] | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [isScanning, setIsScanning] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [mediaToDelete, setMediaToDelete] = useState<MediaData | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [scannedAt, setScannedAt] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const mediaSelection = useAdminBulkSelection()
  const clearMediaSelection = mediaSelection.clearSelection
  const mediaSort = useAdminSort<SortColumn>()
  // Everything that changes what the table shows, minus the page itself.
  const listQueryKey = `${currentSiteId}|${searchQuery}|${mediaSort.sortColumn}|${mediaSort.sortDirection}`
  // Searching or re-sorting from a later page would otherwise land you past the
  // end of the shorter result.
  useResetPageOnListChange(setCurrentPage, listQueryKey)
  // Ticks never survive a change to what the table is showing — the page and
  // rows-per-page included, so "Delete (n)" only ever means rows on screen.
  useClearSelectionOnListChange(mediaSelection, `${listQueryKey}|${currentPage}|${pageSize}`)


  useEffect(() => {
    setMediaItems(null)
    setScannedAt(null)
  }, [currentSiteId])

  async function handleScan() {
    if (!currentSiteId) return

    setIsScanning(true)
    clearMediaSelection()
    try {
      const { data, error } = await scanUnusedMediaAction({ data: { site_id: currentSiteId } })
      if (error) {
        showActionError(`Scan failed: ${error}`)
        return
      }

      setMediaItems(data?.data ?? [])
      setScannedAt(data?.scanned_at ?? new Date().toISOString())
      showActionSuccess(`Scan finished — ${data?.total ?? 0} unused ${(data?.total ?? 0) === 1 ? "item" : "items"} found.`)
    } catch {
      showActionError("Scan failed")
    } finally {
      setIsScanning(false)
    }
  }

  async function handleDelete(ids: string[]) {
    if (!currentSiteId || ids.length === 0) return

    setIsDeleting(true)
    try {
      const { success, deletedCount, error } = await deleteMediaItemsAction({ data: { mediaIds: ids, site_id: currentSiteId } })
      if (!success || error) {
        const message = `Delete failed: ${error ?? "Unknown error"}`
        setDeleteError(message)
        showActionError(message)
        return
      }

      setMediaItems((prev) => prev?.filter((item) => !ids.includes(item.id)) ?? null)
      ids.forEach((id) => mediaSelection.remove(id))
      showActionSuccess(deletedCount === 1 ? "Item deleted." : "Items deleted.")
      setDeleteConfirmOpen(false)
      setMediaToDelete(null)
    } catch {
      setDeleteError("Delete failed")
      showActionError("Delete failed")
    } finally {
      setIsDeleting(false)
    }
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

  const pagedMedia = useMemo(
    () => sortedMedia.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [currentPage, pageSize, sortedMedia]
  )

  // Select-all ticks the page in front of you, never the whole scan result.
  const pagedMediaIds = pagedMedia.map((media) => media.id)

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
          />

          <AdminTableShell
            title="Unused Media"
            icon={<ImageOff className="text-muted-foreground" />}
            count={filteredMedia.length}
            loading={isScanning}
            selectedCount={mediaSelection.selectedCount}
            onClearSelection={mediaSelection.clearSelection}
            titleActions={
              <AdminBulkDeleteButton
                deleting={isDeleting}
                onClick={() => setDeleteConfirmOpen(true)}
                selectedCount={mediaSelection.selectedCount}
              />
            }
            controls={
              <TableRightActions>
                <TableRightActionsSearch
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search unused media"
                />
                <TableRightActionsButton onClick={handleScan} disabled={siteLoading || !currentSiteId || isScanning}>
                  <RefreshCw className={cn("h-4 w-4", isScanning && "animate-spin")} />
                  <span className="hidden sm:inline">{isScanning ? "Scanning..." : "Scan"}</span>
                </TableRightActionsButton>
              </TableRightActions>
            }
            footer={mediaItems ? <AdminListFooter currentPage={currentPage} pageSize={pageSize} total={filteredMedia.length} onPageChange={setCurrentPage} /> : null}
          >

            <ScrollArea className="w-full">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead column="select">
                      <Checkbox
                        checked={mediaSelection.isPageSelected(pagedMediaIds)}
                        onCheckedChange={() => mediaSelection.togglePage(pagedMediaIds)}
                        aria-label="Select all unused media"
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
                  {isScanning && sortedMedia.length === 0 ? (
                    <AdminListPending />
                  ) : mediaItems === null ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-32 text-center">
                        <ImageOff className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
                        <p className="mb-4 text-muted-foreground">
                          Run a scan to find media that is not referenced by this site.
                        </p>
                        <Button onClick={handleScan} disabled={siteLoading || !currentSiteId} variant="outline">
                          <RefreshCw className="h-4 w-4" />
                          Scan
                        </Button>
                      </TableCell>
                    </TableRow>
                  ) : sortedMedia.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-32 text-center">
                        <ImageOff className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
                        <p className="text-muted-foreground">
                          {normalizedSearchQuery ? "No unused media found matching your search." : "No unused media found."}
                        </p>
                        {scannedAt ? (
                          <p className="mt-2 text-xs text-muted-foreground">
                            Last scanned {new Date(scannedAt).toLocaleString()}
                          </p>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ) : (
                    pagedMedia.map((media) => {
                      const isSelected = mediaSelection.selectedIds.has(media.id)
                      return (
                        <TableRow key={media.id} data-state={isSelected ? "selected" : undefined} className="group">
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
                                {media.alt_text ? (
                                  <p className="truncate text-xs text-muted-foreground sm:text-sm" title={media.alt_text}>{media.alt_text}</p>
                                ) : null}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell column="mutedMeta" className="capitalize">{media.file_type}</TableCell>
                          <TableCell column="mutedMeta">{formatFileSize(media.file_size)}</TableCell>
                          <TableCell column="mutedMeta"><RelativeDate date={media.created_at} /></TableCell>
                          <TableCell column="meta">
                            <AdminRowActions>
                              <AdminRowAction
                                icon={Eye}
                                external
                                href={media.public_url}
                                label="Preview original"
                              />
                              <AdminRowAction
                                icon={Trash2}
                                label="Delete file"
                                disabled={isDeleting}
                                onClick={() => {
                                  setDeleteError(null)
                                  setMediaToDelete(media)
                                }}
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
          </AdminTableShell>

          <ConfirmDestructive
            action="delete-media"
            open={deleteConfirmOpen || mediaToDelete !== null}
            title={mediaToDelete
              ? `Delete “${mediaToDelete.original_name}”?`
              : `Delete ${mediaSelection.selectedCount} ${mediaSelection.selectedCount === 1 ? "item" : "items"}?`}
            description="This removes the selected unused media from the library. This action cannot be undone."
            disabled={isDeleting}
            error={deleteError}
            confirmLabel={isDeleting ? "Deleting..." : "Delete"}
            onCancel={() => {
              setDeleteConfirmOpen(false)
              setMediaToDelete(null)
              setDeleteError(null)
            }}
            onConfirm={() => handleDelete(mediaToDelete ? [mediaToDelete.id] : Array.from(mediaSelection.selectedIds))}
          />
        </div>
      </AdminLayout>
    </>
  )
}
