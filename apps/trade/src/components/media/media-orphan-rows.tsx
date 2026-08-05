import { FileQuestionIcon, SettingsIcon, Trash2Icon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { DetailRow } from "@/components/media/media-detail-row"
import { MediaThumbnail } from "@/components/media/media-thumbnail"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { TableCell, TableRow } from "@/components/ui/table"
import { type MediaOrphan } from "@/lib/api/admin-media"
import { problemLabel } from "@/lib/media-orphans"
import { formatFileSize } from "@/lib/format-bytes"
import { formatDate } from "@/lib/format-time"
import { cn } from "@/lib/utils"

/**
 * The rows, tiles and details window for orphaned files. They live apart from
 * the media library page only because they are a second shape of row on it: the
 * page picks these when the type filter is set to orphans.
 */
export function OrphanTableRow({
  row,
  selected,
  onToggle,
  onOpen,
  onDelete,
}: {
  row: MediaOrphan
  selected: boolean
  onToggle: () => void
  onOpen: () => void
  onDelete: () => void
}) {
  return (
    <TableRow
      className="group"
      data-state={selected ? "selected" : undefined}
      rowAction={onOpen}
    >
      <TableCell column="select">
        <Checkbox
          checked={selected}
          onCheckedChange={onToggle}
          aria-label={`Select ${row.name}`}
        />
      </TableCell>
      {/* Storage keys are long and unbroken, so the cell is capped or it would
          stretch the whole table. */}
      <TableCell column="main" className="max-w-md">
        <div className="flex min-w-0 items-center gap-3">
          <OrphanPreview
            row={row}
            className="size-12 shrink-0 rounded-md border bg-muted"
            compact
          />
          <div className="min-w-0">
            <button
              type="button"
              className="block max-w-full truncate text-left text-sm font-medium group-hover:underline"
              title={row.name}
              onClick={onOpen}
            >
              {row.name}
            </button>
            <div
              className="truncate text-xs text-muted-foreground"
              title={row.storagePath}
            >
              {row.storagePath}
            </div>
          </div>
        </div>
      </TableCell>
      <TableCell column="meta">
        <Badge variant={row.kind === "unlinked_object" ? "destructive" : "outline"}>
          {problemLabel(row.kind)}
        </Badge>
      </TableCell>
      <TableCell column="mutedMeta" className="hidden max-w-56 md:table-cell">
        <span className="block truncate" title={row.ownerName ?? "Unknown"}>
          {row.ownerName ?? "Unknown"}
        </span>
      </TableCell>
      <TableCell column="mutedMeta">{formatFileSize(row.bytes)}</TableCell>
      <TableCell column="mutedMeta" className="hidden lg:table-cell">
        {row.createdAt ? formatDate(row.createdAt) : "—"}
      </TableCell>
      <TableCell column="actions">
        <div className="flex items-center">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onOpen}
            title="Orphan details"
            aria-label={`Details for ${row.name}`}
          >
            <SettingsIcon className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onDelete}
            title="Delete orphan"
            aria-label={`Delete ${row.name}`}
          >
            <Trash2Icon className="size-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}

export function OrphanGalleryItem({
  row,
  selected,
  onToggle,
  onOpen,
  onDelete,
}: {
  row: MediaOrphan
  selected: boolean
  onToggle: () => void
  onOpen: () => void
  onDelete: () => void
}) {
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-lg border bg-muted",
        selected && "border-destructive ring-2 ring-destructive/25"
      )}
    >
      <button
        type="button"
        className="relative block aspect-[3/4] w-full bg-muted"
        onClick={onOpen}
      >
        <OrphanPreview row={row} className="h-full w-full" />
        <span className="absolute top-2 left-2 rounded bg-background/90 px-1.5 py-0.5 text-[10px]">
          {problemLabel(row.kind)}
        </span>
        <span
          className="absolute right-2 bottom-2 left-2 truncate rounded bg-background/90 px-1.5 py-0.5 text-left text-[10px] group-hover:opacity-0"
          title={row.storagePath}
        >
          {row.ownerName ?? "Unknown"}
        </span>
      </button>
      <div className="absolute right-2 bottom-2 flex shrink-0 gap-1 rounded-md bg-background/90 p-1 shadow-sm md:opacity-0 md:transition-opacity md:group-hover:opacity-100 md:focus-within:opacity-100">
        <div className="flex h-8 w-8 items-center justify-center">
          <Checkbox
            checked={selected}
            onCheckedChange={onToggle}
            className="border-foreground"
            aria-label={`Select ${row.name}`}
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onOpen}
          aria-label={`Details for ${row.name}`}
        >
          <SettingsIcon className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onDelete}
          aria-label={`Delete ${row.name}`}
        >
          <Trash2Icon className="size-4" />
        </Button>
      </div>
    </div>
  )
}

/**
 * A stray file is still in storage, so it previews like any other upload. A
 * record whose file is gone has nothing to show, and says so.
 */
function OrphanPreview({
  row,
  className,
  compact = false,
}: {
  row: MediaOrphan
  className?: string
  compact?: boolean
}) {
  return (
    <div className={cn("relative grid place-items-center overflow-hidden", className)}>
      {!row.url ? (
        <div className="grid place-items-center gap-1 p-2 text-center text-muted-foreground">
          <FileQuestionIcon className="size-6" />
          <span className="text-[10px] leading-tight">No file</span>
        </div>
      ) : row.fileType === "video" || row.fileType === "image" ? (
        <MediaThumbnail
          url={row.url}
          fileType={row.fileType}
          alt={row.name}
          className="h-full w-full"
          compact={compact}
        />
      ) : (
        <div className="grid place-items-center gap-1 p-2 text-center text-muted-foreground">
          <FileQuestionIcon className="size-6" />
          <span className="text-[10px] leading-tight">No preview</span>
        </div>
      )}
    </div>
  )
}

/** There is nothing to edit on an orphan, so the modal explains and deletes. */
export function OrphanDetailsDialog({
  open,
  orphan,
  onClose,
  onDelete,
}: {
  open: boolean
  orphan: MediaOrphan | null
  onClose: () => void
  onDelete: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent variant="admin" className="sm:max-w-lg">
        <DialogHeader>
          {/* A file name is the whole point of this header, so it wraps rather
              than losing its end to the shared one-line truncation. */}
          <DialogTitle className="pr-8 break-all whitespace-normal">
            {orphan?.name ?? "Orphan"}
          </DialogTitle>
          <DialogDescription className="break-words">
            {orphan?.kind === "unlinked_object"
              ? "This file sits in storage but nothing in the database points at it, so it is costing money for nothing."
              : "The database still lists this file, but it is no longer in storage."}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {orphan ? (
            <Card size="sm">
              <CardContent className="grid gap-4">
                <OrphanPreview
                  row={orphan}
                  className="mx-auto h-56 w-full rounded-lg border bg-muted"
                />
                <dl className="grid gap-2 text-sm sm:grid-cols-2">
                  <DetailRow label="Problem" value={problemLabel(orphan.kind)} />
                  <DetailRow label="Size" value={formatFileSize(orphan.bytes)} />
                  <DetailRow
                    label="Uploaded by"
                    value={orphan.ownerName ?? "Unknown"}
                  />
                  <DetailRow
                    label="Uploaded"
                    value={orphan.createdAt ? formatDate(orphan.createdAt) : "—"}
                  />
                  <DetailRow label="Stored at" value={orphan.storagePath} />
                </dl>
              </CardContent>
            </Card>
          ) : null}
        </DialogBody>
        {/* Nothing to save here, so Delete sits hard left and a single Done
            closes the window. */}
        <DialogFooter>
          <Button
            type="button"
            variant="destructive"
            className="mr-auto"
            onClick={onDelete}
          >
            Delete
          </Button>
          <Button type="button" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
