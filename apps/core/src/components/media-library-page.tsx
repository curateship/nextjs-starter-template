import * as React from "react"
import {
  AlertCircleIcon,
  EditIcon,
  GridIcon,
  ImageIcon,
  ListIcon,
  Loader2Icon,
  Trash2Icon,
  UploadIcon,
  VideoIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { DashboardTable } from "@/components/dashboard-table"
import {
  DashboardSelectedActionButton,
  DashboardToolbarSearch,
  DashboardToolbarSelectTrigger,
} from "@/components/dashboard-toolbar"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select"
import {
  TableCell,
  TableHead,
  TableHeader,
  TableSortButton,
  TableRow,
  type TableSortDirection,
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
  type MediaSortBy,
} from "@/lib/api/media"
import { cn } from "@/lib/utils"

const imageTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp", "image/svg+xml"]
const videoTypes = ["video/mp4", "video/webm", "video/quicktime", "video/x-msvideo", "video/x-matroska"]
const pageSizeOptions = [10, 20, 50]
const pageTabs = ["all", "images", "videos"] as const

export type MediaTabId = (typeof pageTabs)[number]

type ViewMode = "list" | "gallery"
type MediaTypeFilter = "all" | MediaFileType | "svg"

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
})

export function MediaLibraryPage({ activeTab }: { activeTab: MediaTabId }) {
  const [data, setData] = React.useState<MediaListResponse | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [notice, setNotice] = React.useState<string | null>(null)
  const [searchQuery, setSearchQuery] = React.useState("")
  const [mediaTypeFilter, setMediaTypeFilter] = React.useState<MediaTypeFilter>(() => activeTabToFileType(activeTab) ?? "all")
  const [currentPage, setCurrentPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(pageSizeOptions[1])
  const [sortBy, setSortBy] = React.useState<MediaSortBy>("created_at")
  const [sortDirection, setSortDirection] = React.useState<TableSortDirection>("desc")
  const [viewMode, setViewMode] = React.useState<ViewMode>("gallery")
  const [uploading, setUploading] = React.useState(false)
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const [editingMedia, setEditingMedia] = React.useState<MediaItem | null>(null)
  const [editAltText, setEditAltText] = React.useState("")
  const [savingEdit, setSavingEdit] = React.useState(false)
  const [deleteIds, setDeleteIds] = React.useState<string[] | null>(null)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    setMediaTypeFilter(activeTabToFileType(activeTab) ?? "all")
    setCurrentPage(1)
  }, [activeTab])

  const fileType = mediaTypeFilter === "all" || mediaTypeFilter === "svg" ? undefined : mediaTypeFilter
  const mimeType = mediaTypeFilter === "svg" ? "image/svg+xml" : undefined

  const loadCurrentPage = React.useCallback(async () => {
    setError(null)
    try {
      setData(await listMedia({ page: currentPage, pageSize, fileType, mimeType, sortBy, sortDirection }))
    } catch (loadError) {
      setError(getMediaErrorMessage(loadError))
    }
  }, [currentPage, fileType, mimeType, pageSize, sortBy, sortDirection])

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

  function toggleSort(column: MediaSortBy) {
    setCurrentPage(1)
    if (sortBy === column) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"))
      return
    }

    setSortBy(column)
    setSortDirection("asc")
  }

  async function handleUploadSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    const allowedTypes = [...imageTypes, ...videoTypes]
    if (!allowedTypes.includes(file.type)) {
      setError("Invalid file type. Only images, SVGs, and videos are allowed.")
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

  const mediaControls = (
    <>
      {selectedIds.size > 0 ? (
        <DashboardSelectedActionButton
          type="button"
          variant="destructive"
          onClick={() => setDeleteIds(Array.from(selectedIds))}
        >
          <Trash2Icon className="size-4" />
          Delete {selectedIds.size}
        </DashboardSelectedActionButton>
      ) : null}
      <DashboardToolbarSearch
        name="media-search"
        aria-label="Search media"
        placeholder="Search media..."
        value={searchQuery}
        onChange={(event) => setSearchQuery(event.target.value)}
      />
      <Select
        value={mediaTypeFilter}
        onValueChange={(value) => {
          setMediaTypeFilter(value as MediaTypeFilter)
          setCurrentPage(1)
        }}
      >
        <DashboardToolbarSelectTrigger
          aria-label="Media type filter"
          labels={["All", "Images", "Videos", "SVG"]}
        >
          <SelectValue />
        </DashboardToolbarSelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          <SelectItem value="image">Images</SelectItem>
          <SelectItem value="video">Videos</SelectItem>
          <SelectItem value="svg">SVG</SelectItem>
        </SelectContent>
      </Select>
      <div className="flex rounded-lg border">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            "h-8 rounded-r-none",
            viewMode === "list" &&
              "border-black bg-black bg-clip-border text-white hover:bg-black hover:text-white"
          )}
          onClick={() => setViewMode("list")}
          aria-label="List view"
        >
          <ListIcon className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            "h-8 rounded-l-none",
            viewMode === "gallery" &&
              "border-black bg-black bg-clip-border text-white hover:bg-black hover:text-white"
          )}
          onClick={() => setViewMode("gallery")}
          aria-label="Gallery view"
        >
          <GridIcon className="size-4" />
        </Button>
      </div>
      <Button
        type="button"
        size="sm"
        className="h-8 gap-2 sm:h-9"
        disabled={uploading}
        onClick={() => fileInputRef.current?.click()}
      >
        {uploading ? <Loader2Icon className="size-4 animate-spin" /> : <UploadIcon className="size-4" />}
        {uploading ? "Uploading" : "Upload Media"}
      </Button>
    </>
  )

  return (
    <div className="w-full pb-8">
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept={[...imageTypes, ...videoTypes].join(",")}
        onChange={handleUploadSelect}
      />

      {notice ? (
        <div className="mb-4 rounded-md border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
          {notice}
        </div>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {viewMode === "gallery" ? (
        <DashboardTable
          title={getTabTitle(activeTab)}
          icon={<ImageIcon className="size-4 text-muted-foreground sm:size-[18px]" />}
          count={data?.total ?? 0}
          controls={mediaControls}
          content={
            <div className="px-5 pb-5">
              {visibleMedia.length === 0 ? (
                <div className="grid h-72 place-items-center text-center text-sm text-muted-foreground">
                  <div>
                    <ImageIcon className="mx-auto mb-3 size-10" />
                    <p>No media found.</p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8">
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
              )}
            </div>
          }
          footer={{
            type: "pagination",
            page: currentPage,
            pageSize,
            total: data?.total ?? 0,
            totalPages: data?.total_pages ?? 0,
            pageSizeOptions,
            onPageChange: setCurrentPage,
            onPageSizeChange: (size) => {
              setPageSize(size)
              setCurrentPage(1)
            },
          }}
        />
      ) : (
        <DashboardTable
          title={getTabTitle(activeTab)}
          icon={<ImageIcon className="size-4 text-muted-foreground sm:size-[18px]" />}
          count={data?.total ?? 0}
          controls={mediaControls}
          header={
            <TableHeader>
              <TableRow>
                <TableHead column="select">
                  <Checkbox
                    checked={allVisibleSelected}
                    onCheckedChange={handleToggleVisible}
                    aria-label="Select visible media"
                  />
                </TableHead>
                <TableHead column="main">
                  <TableSortButton active={sortBy === "original_name"} direction={sortDirection} onClick={() => toggleSort("original_name")}>
                    File
                  </TableSortButton>
                </TableHead>
                <TableHead column="meta">
                  <TableSortButton active={sortBy === "file_type"} direction={sortDirection} onClick={() => toggleSort("file_type")}>
                    Type
                  </TableSortButton>
                </TableHead>
                <TableHead column="meta" className="hidden md:table-cell">
                  <TableSortButton active={sortBy === "file_size"} direction={sortDirection} onClick={() => toggleSort("file_size")}>
                    Size
                  </TableSortButton>
                </TableHead>
                <TableHead column="meta" className="hidden lg:table-cell">
                  <TableSortButton active={sortBy === "created_at"} direction={sortDirection} onClick={() => toggleSort("created_at")}>
                    Added
                  </TableSortButton>
                </TableHead>
                <TableHead column="meta">Actions</TableHead>
              </TableRow>
            </TableHeader>
          }
          isEmpty={visibleMedia.length === 0}
          emptyText="No media found."
          emptyColSpan={6}
          footer={{
            type: "pagination",
            page: currentPage,
            pageSize,
            total: data?.total ?? 0,
            totalPages: data?.total_pages ?? 0,
            pageSizeOptions,
            onPageChange: setCurrentPage,
            onPageSizeChange: (size) => {
              setPageSize(size)
              setCurrentPage(1)
            },
          }}
        >
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
        </DashboardTable>
      )}

      <Dialog open={!!editingMedia} onOpenChange={(open) => !open && setEditingMedia(null)}>
        <DialogContent variant="admin" className="max-h-[85vh] w-[710px] max-w-[calc(100vw-2rem)] sm:max-w-[710px]">
          <DialogHeader>
            <DialogTitle>{editingMedia?.file_type === "video" ? "Edit Video" : "Edit Image"}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            {editingMedia ? (
              <div className="space-y-4">
                {editingMedia.file_type === "video" ? (
                  <video
                    src={editingMedia.url}
                    className="mx-auto max-h-[50vh] w-full rounded-lg object-contain"
                    controls
                    muted
                  />
                ) : (
                  <img
                    src={editingMedia.url}
                    alt={editingMedia.alt_text ?? editingMedia.original_name}
                    className="mx-auto max-h-[50vh] w-full rounded-lg object-contain"
                  />
                )}
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
          </DialogBody>
          <DialogFooter variant="plain">
            {editingMedia ? (
              <Button
                type="button"
                variant="destructive"
                onClick={() => {
                  setDeleteIds([editingMedia.id])
                  setEditingMedia(null)
                }}
              >
                Delete
              </Button>
            ) : null}
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
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>
              Delete {deleteIds?.length ?? 0} {(deleteIds?.length ?? 0) === 1 ? "item" : "items"}?
            </DialogTitle>
          </DialogHeader>
          <DialogBody>
            <p className="text-sm text-muted-foreground">
              This removes the selected media from the library. This action cannot be undone.
            </p>
          </DialogBody>
          <DialogFooter variant="plain">
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
    <TableRow className="group" data-state={selected ? "selected" : undefined}>
      <TableCell column="select">
        <Checkbox checked={selected} onCheckedChange={onToggle} aria-label={`Select ${item.original_name}`} />
      </TableCell>
      <TableCell column="main">
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
      <TableCell column="mutedMeta" className="capitalize">{item.file_type}</TableCell>
      <TableCell column="mutedMeta" className="hidden md:table-cell">{formatFileSize(item.file_size)}</TableCell>
      <TableCell column="mutedMeta" className="hidden lg:table-cell">
        {dateFormatter.format(new Date(item.created_at))}
      </TableCell>
      <TableCell column="meta">
        <div className="flex justify-start gap-1 md:opacity-0 md:transition-opacity md:group-hover:opacity-100 md:focus-within:opacity-100">
          <Button type="button" variant="ghost" size="icon-sm" onClick={onEdit} aria-label="Edit media">
            <EditIcon className="size-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" onClick={onDelete} aria-label="Delete media">
            <Trash2Icon className="size-4" />
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
    <div className={cn("group relative overflow-hidden rounded-lg border bg-muted", selected && "border-destructive ring-2 ring-destructive/25")}>
      <button type="button" className="relative block aspect-[3/4] w-full bg-muted" onClick={onEdit}>
        <MediaPreview item={item} className="h-full w-full" />
        <span className="absolute top-2 left-2 rounded bg-background/90 px-1.5 py-0.5 text-[10px] capitalize">
          {item.file_type}
        </span>
      </button>
      <div className="absolute right-2 bottom-2 flex shrink-0 gap-1 rounded-md bg-background/90 p-1 shadow-sm md:opacity-0 md:transition-opacity md:group-hover:opacity-100 md:focus-within:opacity-100">
        <div className="flex h-8 w-8 items-center justify-center">
          <Checkbox
            checked={selected}
            onCheckedChange={onToggle}
            className="border-foreground"
            aria-label={`Select ${item.original_name}`}
          />
        </div>
        <Button type="button" variant="ghost" size="icon-sm" onClick={onEdit} aria-label="Edit media">
          <EditIcon className="size-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon-sm" onClick={onDelete} aria-label="Delete media">
          <Trash2Icon className="size-4" />
        </Button>
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
        <img
          src={item.url}
          alt={item.alt_text ?? item.original_name}
          className="h-full w-full object-contain"
        />
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
