import * as React from "react"
import {
  EditIcon,
  GridIcon,
  ImageIcon,
  ListIcon,
  Loader2Icon,
  SearchIcon,
  Trash2Icon,
  UploadIcon,
  VideoIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  bulkDeleteMedia,
  deleteMedia,
  getMediaErrorMessage,
  listMedia,
  updateMedia,
  uploadMedia,
  type MediaFileType,
  type MediaItem,
  type MediaListResponse,
} from "@/lib/media-api"
import { cn } from "@/lib/utils"

const imageTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"]
const videoTypes = ["video/mp4", "video/webm", "video/quicktime", "video/x-msvideo", "video/x-matroska"]
const pageSize = 20
const pageTabs = ["all", "images", "videos"] as const

export type MediaTabId = (typeof pageTabs)[number]

type ViewMode = "list" | "gallery"

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
})

export function getMediaTabFromPath(path: string): MediaTabId {
  if (path === "/admin/media/images") return "images"
  if (path === "/admin/media/videos") return "videos"
  return "all"
}

export function MediaLibraryPage({ activeTab }: { activeTab: MediaTabId }) {
  const [data, setData] = React.useState<MediaListResponse | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [notice, setNotice] = React.useState<string | null>(null)
  const [searchQuery, setSearchQuery] = React.useState("")
  const [currentPage, setCurrentPage] = React.useState(1)
  const [viewMode, setViewMode] = React.useState<ViewMode>("list")
  const [uploading, setUploading] = React.useState(false)
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const [editingMedia, setEditingMedia] = React.useState<MediaItem | null>(null)
  const [editAltText, setEditAltText] = React.useState("")
  const [savingEdit, setSavingEdit] = React.useState(false)
  const [deleteIds, setDeleteIds] = React.useState<string[] | null>(null)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  const fileType = activeTabToFileType(activeTab)

  const loadCurrentPage = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await listMedia({ page: currentPage, pageSize, fileType }))
    } catch (loadError) {
      setError(getMediaErrorMessage(loadError))
    } finally {
      setLoading(false)
    }
  }, [currentPage, fileType])

  React.useEffect(() => {
    setCurrentPage(1)
    setSelectedIds(new Set())
  }, [activeTab])

  React.useEffect(() => {
    loadCurrentPage()
  }, [loadCurrentPage])

  const visibleMedia = React.useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    return (data?.media ?? []).filter((item) => {
      if (!query) return true
      return `${item.original_name} ${item.filename} ${item.alt_text ?? ""} ${item.file_type}`
        .toLowerCase()
        .includes(query)
    })
  }, [data?.media, searchQuery])

  const visibleIds = visibleMedia.map((item) => item.id)
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id))

  function handleToggleOne(mediaId: string) {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(mediaId)) {
        next.delete(mediaId)
      } else {
        next.add(mediaId)
      }
      return next
    })
  }

  function handleToggleVisible() {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (allVisibleSelected) {
        visibleIds.forEach((id) => next.delete(id))
      } else {
        visibleIds.forEach((id) => next.add(id))
      }
      return next
    })
  }

  async function handleUploadSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    const allowedTypes = [...imageTypes, ...videoTypes]
    if (!allowedTypes.includes(file.type)) {
      setError("Invalid file type. Only images and videos are allowed.")
      event.target.value = ""
      return
    }

    const kind = imageTypes.includes(file.type) ? "image" : "video"
    const maxSize = kind === "image" ? 10 * 1024 * 1024 : 100 * 1024 * 1024
    if (file.size > maxSize) {
      setError(`File size too large. Maximum size is ${kind === "image" ? "10MB" : "100MB"}.`)
      event.target.value = ""
      return
    }

    setUploading(true)
    setError(null)
    setNotice(null)
    try {
      await uploadMedia(file)
      setNotice("Media uploaded.")
      await loadCurrentPage()
    } catch (uploadError) {
      setError(getMediaErrorMessage(uploadError))
    } finally {
      setUploading(false)
      event.target.value = ""
    }
  }

  function handleEdit(media: MediaItem) {
    setEditingMedia(media)
    setEditAltText(media.alt_text ?? "")
  }

  async function handleSaveEdit() {
    if (!editingMedia) return

    setSavingEdit(true)
    setError(null)
    setNotice(null)
    try {
      const updated = await updateMedia(editingMedia.id, editAltText)
      setData((current) =>
        current
          ? {
              ...current,
              media: current.media.map((item) => (item.id === updated.id ? updated : item)),
            }
          : current
      )
      setEditingMedia(null)
      setNotice("Media updated.")
    } catch (saveError) {
      setError(getMediaErrorMessage(saveError))
    } finally {
      setSavingEdit(false)
    }
  }

  async function handleConfirmDelete() {
    if (!deleteIds?.length) return

    const ids = deleteIds
    setError(null)
    setNotice(null)
    try {
      if (ids.length === 1) {
        await deleteMedia(ids[0])
        setNotice("Media deleted.")
      } else {
        const result = await bulkDeleteMedia(ids)
        setNotice(`Deleted ${result.deleted_count} media ${result.deleted_count === 1 ? "item" : "items"}.`)
      }
      setSelectedIds((current) => {
        const next = new Set(current)
        ids.forEach((id) => next.delete(id))
        return next
      })
      setDeleteIds(null)
      await loadCurrentPage()
    } catch (deleteError) {
      setError(getMediaErrorMessage(deleteError))
    }
  }

  return (
    <div className="w-full pb-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="font-heading text-xl font-semibold">Media Library</h1>
          <p className="text-sm text-muted-foreground">
            Upload, organize, and reuse images and videos.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {selectedIds.size > 0 ? (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => setDeleteIds(Array.from(selectedIds))}
            >
              <Trash2Icon className="size-4" />
              Delete {selectedIds.size}
            </Button>
          ) : null}
          <div className="flex rounded-lg border">
            <Button
              type="button"
              variant={viewMode === "list" ? "secondary" : "ghost"}
              size="icon-sm"
              className="rounded-r-none"
              onClick={() => setViewMode("list")}
              aria-label="List view"
            >
              <ListIcon className="size-4" />
            </Button>
            <Button
              type="button"
              variant={viewMode === "gallery" ? "secondary" : "ghost"}
              size="icon-sm"
              className="rounded-l-none"
              onClick={() => setViewMode("gallery")}
              aria-label="Gallery view"
            >
              <GridIcon className="size-4" />
            </Button>
          </div>
          <Button type="button" size="sm" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
            {uploading ? <Loader2Icon className="size-4 animate-spin" /> : <UploadIcon className="size-4" />}
            {uploading ? "Uploading" : "Upload Media"}
          </Button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept={[...imageTypes, ...videoTypes].join(",")}
        onChange={handleUploadSelect}
      />

      {error ? (
        <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="mb-4 rounded-md border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
          {notice}
        </div>
      ) : null}

      <Card>
        <CardHeader className="gap-3 sm:flex sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <CardTitle>{getTabTitle(activeTab)}</CardTitle>
            {data ? (
              <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {data.total}
              </span>
            ) : null}
          </div>
          <div className="relative w-full sm:w-72">
            <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search media"
              className="pl-9"
            />
          </div>
        </CardHeader>

        <CardContent className="min-h-[340px]">
          {loading ? (
            <div className="grid h-72 place-items-center text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <Loader2Icon className="size-4 animate-spin" />
                Loading media
              </span>
            </div>
          ) : visibleMedia.length === 0 ? (
            <div className="grid h-72 place-items-center text-center text-sm text-muted-foreground">
              <div>
                <ImageIcon className="mx-auto mb-3 size-10" />
                <p>No media found.</p>
              </div>
            </div>
          ) : viewMode === "gallery" ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {visibleMedia.map((item) => (
                <GalleryItem
                  key={item.id}
                  item={item}
                  selected={selectedIds.has(item.id)}
                  onEdit={() => handleEdit(item)}
                  onDelete={() => setDeleteIds([item.id])}
                  onToggle={() => handleToggleOne(item.id)}
                />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allVisibleSelected}
                      onCheckedChange={handleToggleVisible}
                      aria-label="Select visible media"
                    />
                  </TableHead>
                  <TableHead className="min-w-[240px]">File</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="hidden md:table-cell">Size</TableHead>
                  <TableHead className="hidden lg:table-cell">Added</TableHead>
                  <TableHead className="w-[110px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleMedia.map((item) => (
                  <MediaTableRow
                    key={item.id}
                    item={item}
                    selected={selectedIds.has(item.id)}
                    onToggle={() => handleToggleOne(item.id)}
                    onEdit={() => handleEdit(item)}
                    onDelete={() => setDeleteIds([item.id])}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>

        {data && data.total_pages > 1 ? (
          <CardFooter className="justify-between">
            <span className="text-sm text-muted-foreground">
              Page {data.page} of {data.total_pages}
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              >
                Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={currentPage >= data.total_pages}
                onClick={() => setCurrentPage((page) => page + 1)}
              >
                Next
              </Button>
            </div>
          </CardFooter>
        ) : null}
      </Card>

      <Dialog open={!!editingMedia} onOpenChange={(open) => !open && setEditingMedia(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingMedia?.file_type === "video" ? "Edit Video" : "Edit Image"}</DialogTitle>
          </DialogHeader>
          {editingMedia ? (
            <div className="space-y-4">
              <MediaPreview item={editingMedia} className="aspect-video rounded-lg border bg-muted" />
              <div className="grid gap-2">
                <Label htmlFor="media-alt-text">
                  {editingMedia.file_type === "video" ? "Description" : "Alt text"}
                </Label>
                <Input
                  id="media-alt-text"
                  value={editAltText}
                  onChange={(event) => setEditAltText(event.target.value)}
                  placeholder="Optional"
                />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditingMedia(null)}>
              Cancel
            </Button>
            <Button type="button" disabled={savingEdit} onClick={handleSaveEdit}>
              {savingEdit ? <Loader2Icon className="size-4 animate-spin" /> : null}
              {savingEdit ? "Saving" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteIds} onOpenChange={(open) => !open && setDeleteIds(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Delete {deleteIds?.length ?? 0} {(deleteIds?.length ?? 0) === 1 ? "item" : "items"}?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This removes the selected media from the library. This action cannot be undone.
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteIds(null)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={handleConfirmDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function MediaTableRow({
  item,
  selected,
  onToggle,
  onEdit,
  onDelete,
}: {
  item: MediaItem
  selected: boolean
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <TableRow data-state={selected ? "selected" : undefined}>
      <TableCell>
        <Checkbox checked={selected} onCheckedChange={onToggle} aria-label={`Select ${item.original_name}`} />
      </TableCell>
      <TableCell>
        <div className="flex min-w-0 items-center gap-3">
          <MediaPreview item={item} className="size-12 shrink-0 rounded-md border bg-muted" />
          <div className="min-w-0">
            <div className="truncate font-medium">{item.original_name}</div>
            {item.alt_text ? (
              <div className="max-w-[280px] truncate text-xs text-muted-foreground">{item.alt_text}</div>
            ) : null}
          </div>
        </div>
      </TableCell>
      <TableCell className="capitalize text-muted-foreground">{item.file_type}</TableCell>
      <TableCell className="hidden text-muted-foreground md:table-cell">{formatFileSize(item.file_size)}</TableCell>
      <TableCell className="hidden text-muted-foreground lg:table-cell">
        {dateFormatter.format(new Date(item.created_at))}
      </TableCell>
      <TableCell>
        <div className="flex justify-end gap-1">
          <Button type="button" variant="ghost" size="icon-sm" onClick={onEdit} aria-label="Edit media">
            <EditIcon className="size-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" onClick={onDelete} aria-label="Delete media">
            <Trash2Icon className="size-4 text-destructive" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}

function GalleryItem({
  item,
  selected,
  onToggle,
  onEdit,
  onDelete,
}: {
  item: MediaItem
  selected: boolean
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div className={cn("group overflow-hidden rounded-lg border bg-card", selected && "ring-2 ring-primary/25")}>
      <button type="button" className="relative block aspect-square w-full bg-muted" onClick={onToggle}>
        <MediaPreview item={item} className="h-full w-full" />
        <span className="absolute top-2 left-2 rounded bg-background/90 px-1.5 py-0.5 text-[10px] capitalize">
          {item.file_type}
        </span>
      </button>
      <div className="flex items-center justify-between gap-2 p-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{item.original_name}</p>
          <p className="text-xs text-muted-foreground">{formatFileSize(item.file_size)}</p>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button type="button" variant="ghost" size="icon-sm" onClick={onEdit} aria-label="Edit media">
            <EditIcon className="size-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" onClick={onDelete} aria-label="Delete media">
            <Trash2Icon className="size-4 text-destructive" />
          </Button>
        </div>
      </div>
    </div>
  )
}

function MediaPreview({ item, className }: { item: MediaItem; className?: string }) {
  return (
    <div className={cn("relative grid place-items-center overflow-hidden", className)}>
      {item.file_type === "video" ? (
        <>
          <video src={item.url} className="h-full w-full object-contain" muted preload="metadata" />
          <VideoIcon className="absolute top-2 left-2 size-4 text-white drop-shadow" />
        </>
      ) : (
        <img src={item.url} alt={item.alt_text ?? item.original_name} className="h-full w-full object-contain" />
      )}
    </div>
  )
}

function activeTabToFileType(tab: MediaTabId): MediaFileType | undefined {
  if (tab === "images") return "image"
  if (tab === "videos") return "video"
  return undefined
}

function getTabTitle(tab: MediaTabId) {
  if (tab === "images") return "Images"
  if (tab === "videos") return "Videos"
  return "All Media"
}

function formatFileSize(bytes: number) {
  if (bytes === 0) return "0 Bytes"
  const units = ["Bytes", "KB", "MB", "GB"]
  const index = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${parseFloat((bytes / 1024 ** index).toFixed(2))} ${units[index]}`
}
