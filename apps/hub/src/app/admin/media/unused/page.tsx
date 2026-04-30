"use client"

import { useEffect, useMemo, useState } from "react"
import Image from "next/image"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { getMediaAdminTopNavLinks } from "@/components/admin/layout/stickybar/StickybarTopLeftNav"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { cn } from "@/lib/utils/tailwind"
import { deleteMediaItemsAction, scanUnusedMediaAction } from "@/lib/actions/media/media-actions"
import type { MediaData } from "@/lib/actions/media/media-actions"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import { ArrowDown, ArrowUp, ChevronsUpDown, ImageOff, Image as ImageIcon, RefreshCw, Trash2, VideoIcon } from "lucide-react"
import { toast } from "sonner"

type SortColumn = "name" | "type" | "size" | "added"

export default function UnusedMediaPage() {
  const { currentSite, loading: siteLoading } = useSiteSwitcher()
  const currentSiteId = currentSite?.id
  const [mediaItems, setMediaItems] = useState<MediaData[] | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isScanning, setIsScanning] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [scannedAt, setScannedAt] = useState<string | null>(null)
  const [sortColumn, setSortColumn] = useState<SortColumn | null>(null)
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc")

  useEffect(() => {
    setMediaItems(null)
    setSelectedIds(new Set())
    setScannedAt(null)
  }, [currentSiteId])

  async function handleScan() {
    if (!currentSiteId) return

    setIsScanning(true)
    setSelectedIds(new Set())
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
      setSelectedIds((prev) => {
        const next = new Set(prev)
        ids.forEach((id) => next.delete(id))
        return next
      })
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
      if (!sortColumn) return 0
      const dir = sortDirection === "asc" ? 1 : -1
      if (sortColumn === "name") return a.original_name.localeCompare(b.original_name) * dir
      if (sortColumn === "type") return a.file_type.localeCompare(b.file_type) * dir
      if (sortColumn === "size") return (a.file_size - b.file_size) * dir
      if (sortColumn === "added") return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * dir
      return 0
    })
  }, [filteredMedia, sortColumn, sortDirection])

  const allFilteredSelected = sortedMedia.length > 0 && sortedMedia.every((item) => selectedIds.has(item.id))

  function handleToggleSelectAll() {
    if (allFilteredSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        sortedMedia.forEach((item) => next.delete(item.id))
        return next
      })
      return
    }

    setSelectedIds((prev) => {
      const next = new Set(prev)
      sortedMedia.forEach((item) => next.add(item.id))
      return next
    })
  }

  function handleToggleSelection(mediaId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(mediaId)) {
        next.delete(mediaId)
      } else {
        next.add(mediaId)
      }
      return next
    })
  }

  function toggleSort(column: SortColumn) {
    if (sortColumn === column) {
      if (sortDirection === "desc") {
        setSortColumn(null)
        setSortDirection("asc")
      } else {
        setSortDirection("desc")
      }
      return
    }

    setSortColumn(column)
    setSortDirection("asc")
  }

  function getSortIcon(column: SortColumn) {
    if (sortColumn !== column) return <ChevronsUpDown className="h-3 w-3 opacity-70" />
    if (sortDirection === "asc") return <ArrowUp className="h-3 w-3" />
    return <ArrowDown className="h-3 w-3" />
  }

  function formatDate(dateString: string) {
    const date = new Date(dateString)
    const now = new Date()
    const diffTime = Math.abs(now.getTime() - date.getTime())
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    if (diffDays === 1) return "1 day ago"
    if (diffDays < 7) return `${diffDays} days ago`
    if (diffDays < 30) return `${Math.ceil(diffDays / 7)} weeks ago`
    return `${Math.ceil(diffDays / 30)} months ago`
  }

  function formatFileSize(bytes: number) {
    if (bytes === 0) return "0 Bytes"
    const k = 1024
    const sizes = ["Bytes", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
  }

  return (
    <>
      <StickyHeader navLinks={getMediaAdminTopNavLinks("unused")} />
      <AdminLayout>
        <div className="w-full">
          <DashboardSubheader
            items={[
              { label: "Media", href: "/admin/media" },
              { label: "Unused" },
            ]}
            search={{
              value: searchQuery,
              onValueChange: setSearchQuery,
              placeholder: "Search unused media",
            }}
            preActions={
              selectedIds.size > 0 ? (
                <Button
                  variant="destructive"
                  onClick={() => setDeleteConfirmOpen(true)}
                  disabled={isDeleting}
                >
                  <Trash2 className="h-4 w-4" />
                  <span className="hidden sm:inline">{isDeleting ? "Deleting..." : `Delete ${selectedIds.size}`}</span>
                </Button>
              ) : undefined
            }
            actions={
              <Button onClick={handleScan} disabled={siteLoading || !currentSiteId || isScanning}>
                <RefreshCw className={cn("h-4 w-4", isScanning && "animate-spin")} />
                <span className="hidden sm:inline">{isScanning ? "Scanning..." : "Scan"}</span>
              </Button>
            }
          />

          <Card className="shadow-sm">
            <div className="px-6 py-4 border-b bg-muted/30">
              <div className="grid grid-cols-6 gap-4 text-sm font-medium text-muted-foreground">
                <div className="col-span-2 flex items-center space-x-4">
                  <Checkbox
                    checked={allFilteredSelected}
                    onCheckedChange={handleToggleSelectAll}
                    aria-label="Select all unused media"
                  />
                  <button
                    type="button"
                    onClick={() => toggleSort("name")}
                    className="flex cursor-pointer items-center gap-1.5 text-[0.8125rem] text-muted-foreground transition-colors hover:text-foreground outline-none"
                  >
                    <span>File</span>
                    <span className="ml-2 flex h-3.5 w-3.5 items-center justify-center">{getSortIcon("name")}</span>
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => toggleSort("type")}
                  className="flex cursor-pointer items-center gap-1.5 text-[0.8125rem] text-muted-foreground transition-colors hover:text-foreground outline-none"
                >
                  <span>Type</span>
                  <span className="ml-2 flex h-3.5 w-3.5 items-center justify-center">{getSortIcon("type")}</span>
                </button>
                <button
                  type="button"
                  onClick={() => toggleSort("size")}
                  className="flex cursor-pointer items-center gap-1.5 text-[0.8125rem] text-muted-foreground transition-colors hover:text-foreground outline-none"
                >
                  <span>Size</span>
                  <span className="ml-2 flex h-3.5 w-3.5 items-center justify-center">{getSortIcon("size")}</span>
                </button>
                <button
                  type="button"
                  onClick={() => toggleSort("added")}
                  className="flex cursor-pointer items-center gap-1.5 text-[0.8125rem] text-muted-foreground transition-colors hover:text-foreground outline-none"
                >
                  <span>Added</span>
                  <span className="ml-2 flex h-3.5 w-3.5 items-center justify-center">{getSortIcon("added")}</span>
                </button>
                <div>Actions</div>
              </div>
            </div>

            <div className="divide-y divide-muted/80">
              {isScanning ? (
                <div className="space-y-0">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="p-6 border-b border-muted/80">
                      <div className="grid grid-cols-6 gap-4 items-center">
                        <div className="col-span-2 flex items-center space-x-4">
                          <div className="h-4 w-4 rounded bg-muted animate-pulse" />
                          <div className="h-12 w-12 rounded bg-muted animate-pulse" />
                          <div>
                            <div className="mb-2 h-4 w-32 rounded bg-muted animate-pulse" />
                            <div className="h-3 w-24 rounded bg-muted/60 animate-pulse" />
                          </div>
                        </div>
                        <div className="h-4 w-12 rounded bg-muted animate-pulse" />
                        <div className="h-4 w-14 rounded bg-muted animate-pulse" />
                        <div className="h-4 w-16 rounded bg-muted animate-pulse" />
                        <div className="h-8 w-20 rounded bg-muted animate-pulse" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : mediaItems === null ? (
                <div className="p-8 text-center">
                  <ImageOff className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                  <p className="mb-4 text-muted-foreground">Run a scan to find media that is not referenced by this site.</p>
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
                    <p className="mt-2 text-xs text-muted-foreground">Last scanned {new Date(scannedAt).toLocaleString()}</p>
                  ) : null}
                </div>
              ) : (
                sortedMedia.map((media) => {
                  const isSelected = selectedIds.has(media.id)
                  return (
                    <div key={media.id} className={cn("p-6 transition-colors", isSelected && "bg-accent/50")}>
                      <div className="grid grid-cols-6 gap-4 items-center">
                        <div className="col-span-2">
                          <div className="flex items-center space-x-4">
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => handleToggleSelection(media.id)}
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

          <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Delete {selectedIds.size} {selectedIds.size === 1 ? "item" : "items"}?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  This removes the selected unused media from the library. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-white hover:bg-destructive/90"
                  disabled={isDeleting}
                  onClick={(event) => {
                    event.preventDefault()
                    handleDelete(Array.from(selectedIds))
                  }}
                >
                  {isDeleting ? "Deleting..." : "Delete"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </AdminLayout>
    </>
  )
}
