import * as React from "react"
import {
  AlertCircleIcon,
  ExternalLinkIcon,
  ImageOffIcon,
  Loader2Icon,
  RefreshCwIcon,
  Trash2Icon,
} from "lucide-react"

import { DashboardTable } from "@/components/dashboard-table"
import {
  DashboardSelectedActionButton,
  DashboardToolbarSearch,
} from "@/components/dashboard-toolbar"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  bulkDeleteMedia,
  getMediaErrorMessage,
  scanUnusedImages,
  type MediaItem,
} from "@/lib/api/media"

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
})
const BULK_DELETE_CHUNK_SIZE = 500

export function UnusedImagesPage() {
  const [items, setItems] = React.useState<MediaItem[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [notice, setNotice] = React.useState<string | null>(null)
  const [searchQuery, setSearchQuery] = React.useState("")
  const [scanning, setScanning] = React.useState(false)
  const [deleteIds, setDeleteIds] = React.useState<string[] | null>(null)
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())

  const visibleItems = React.useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    return (items ?? []).filter((item) => {
      if (!query) return true
      return `${item.original_name} ${item.filename} ${item.alt_text ?? ""}`
        .toLowerCase()
        .includes(query)
    })
  }, [items, searchQuery])

  const visibleIds = visibleItems.map((item) => item.id)
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id))

  async function handleScan() {
    setScanning(true)
    setError(null)
    setNotice(null)
    setSelectedIds(new Set())

    try {
      const result = await scanUnusedImages()
      setItems(result.media)
      setNotice(`Found ${result.total} unused ${result.total === 1 ? "image" : "images"}.`)
    } catch (scanError) {
      setError(getMediaErrorMessage(scanError))
    } finally {
      setScanning(false)
    }
  }

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

  async function handleConfirmDelete() {
    if (!deleteIds?.length) return

    const ids = deleteIds
    setError(null)
    setNotice(null)

    try {
      let deletedCount = 0
      for (let index = 0; index < ids.length; index += BULK_DELETE_CHUNK_SIZE) {
        const result = await bulkDeleteMedia(ids.slice(index, index + BULK_DELETE_CHUNK_SIZE))
        deletedCount += result.deleted_count
      }
      setItems((current) => current?.filter((item) => !ids.includes(item.id)) ?? current)
      setSelectedIds((current) => {
        const next = new Set(current)
        ids.forEach((id) => next.delete(id))
        return next
      })
      setDeleteIds(null)
      setNotice(`Deleted ${deletedCount} ${deletedCount === 1 ? "image" : "images"}.`)
    } catch (deleteError) {
      setError(getMediaErrorMessage(deleteError))
    }
  }

  const controls = (
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
        name="unused-image-search"
        aria-label="Search unused images"
        placeholder="Search unused images..."
        value={searchQuery}
        onChange={(event) => setSearchQuery(event.target.value)}
      />
      <Button type="button" size="sm" className="h-8 gap-2 sm:h-9" disabled={scanning} onClick={handleScan}>
        {scanning ? <Loader2Icon className="size-4 animate-spin" /> : <RefreshCwIcon className="size-4" />}
        {scanning ? "Scanning" : "Scan"}
      </Button>
    </>
  )

  return (
    <div className="w-full pb-8">
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

      <DashboardTable
        title="Unused Images"
        icon={<ImageOffIcon className="size-4 text-muted-foreground sm:size-[18px]" />}
        count={visibleItems.length}
        selectedCount={selectedIds.size}
        onClearSelection={() => setSelectedIds(new Set())}
        controls={controls}
        header={
          <TableHeader>
            <TableRow>
              <TableHead column="select">
                <Checkbox
                  checked={allVisibleSelected}
                  onCheckedChange={handleToggleVisible}
                  aria-label="Select visible unused images"
                />
              </TableHead>
              <TableHead column="main">Image</TableHead>
              <TableHead column="meta" className="hidden md:table-cell">Size</TableHead>
              <TableHead column="meta" className="hidden lg:table-cell">Added</TableHead>
              <TableHead column="meta">Actions</TableHead>
            </TableRow>
          </TableHeader>
        }
        isEmpty={!scanning && visibleItems.length === 0}
        emptyText={items === null ? "Run a scan to find unused images." : "No unused images found."}
        emptyColSpan={5}
        footer={{
          type: "summary",
          count: visibleItems.length,
          label: "unused images",
        }}
      >
        {scanning ? (
          <TableRow>
            <TableCell colSpan={5} className="h-24 text-center text-sm text-muted-foreground">
              <Loader2Icon className="mx-auto mb-2 size-5 animate-spin" />
              Scanning images...
            </TableCell>
          </TableRow>
        ) : (
          visibleItems.map((item) => (
            <UnusedImageRow
              key={item.id}
              item={item}
              selected={selectedIds.has(item.id)}
              onToggle={() => handleToggleOne(item.id)}
              onDelete={() => setDeleteIds([item.id])}
            />
          ))
        )}
      </DashboardTable>

      <Dialog open={!!deleteIds} onOpenChange={(open) => !open && setDeleteIds(null)}>
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>
              Delete {deleteIds?.length ?? 0} {(deleteIds?.length ?? 0) === 1 ? "image" : "images"}?
            </DialogTitle>
          </DialogHeader>
          <DialogBody>
            <p className="text-sm text-muted-foreground">
              This removes the selected unused images from the library. This action cannot be undone.
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

function UnusedImageRow({
  item,
  selected,
  onToggle,
  onDelete,
}: {
  item: MediaItem
  selected: boolean
  onToggle: () => void
  onDelete: () => void
}) {
  return (
    <TableRow className="group" data-state={selected ? "selected" : undefined}>
      <TableCell column="select">
        <Checkbox checked={selected} onCheckedChange={onToggle} aria-label={`Select ${item.original_name}`} />
      </TableCell>
      <TableCell column="main">
        <div className="flex min-w-0 items-center gap-3">
          <img
            src={item.url}
            alt={item.alt_text ?? item.original_name}
            className="size-12 shrink-0 rounded-md border bg-muted object-contain"
          />
          <div className="min-w-0">
            <div className="truncate font-medium">{item.original_name}</div>
            {item.alt_text ? (
              <div className="max-w-[280px] truncate text-xs text-muted-foreground">{item.alt_text}</div>
            ) : null}
          </div>
        </div>
      </TableCell>
      <TableCell column="mutedMeta" className="hidden md:table-cell">{formatFileSize(item.file_size)}</TableCell>
      <TableCell column="mutedMeta" className="hidden lg:table-cell">
        {dateFormatter.format(new Date(item.created_at))}
      </TableCell>
      <TableCell column="meta">
        <div className="flex justify-start gap-1">
          <Button type="button" variant="ghost" size="icon-sm" asChild>
            <a href={item.url} target="_blank" rel="noreferrer" aria-label="Open image">
              <ExternalLinkIcon className="size-4" />
            </a>
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" onClick={onDelete} aria-label="Delete image">
            <Trash2Icon className="size-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}

function formatFileSize(bytes: number) {
  if (bytes === 0) return "0 Bytes"
  const units = ["Bytes", "KB", "MB", "GB"]
  const index = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${parseFloat((bytes / 1024 ** index).toFixed(2))} ${units[index]}`
}
