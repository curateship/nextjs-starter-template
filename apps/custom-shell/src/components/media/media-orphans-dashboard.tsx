import * as React from "react"
import {
  FileQuestionIcon,
  GridIcon,
  ListIcon,
  Loader2Icon,
  RefreshCwIcon,
  SettingsIcon,
  Trash2Icon,
  UnlinkIcon,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DetailRow } from "@/components/media/media-detail-row"
import { MediaThumbnail } from "@/components/media/media-thumbnail"
import { DashboardTable } from "@/components/shared/dashboard-table"
import {
  DashboardToolbarButton,
  dashboardToolbarButtonActiveClassName,
  dashboardToolbarButtonGroupClassName,
  dashboardToolbarButtonGroupItemClassName,
  DashboardToolbarSearch,
  DashboardToolbarSelectTrigger,
} from "@/components/shared/dashboard-toolbar"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
  TableRow,
  TableSortButton,
} from "@/components/ui/table"
import {
  cleanOrphanedMedia,
  getAdminMediaErrorMessage,
  loadOrphans,
  type MediaOrphan,
  type OrphanDashboard,
} from "@/lib/api/admin-media"
import { dismissErrorToast, showErrorToast } from "@/lib/error-toast"
import { formatFileSize } from "@/lib/format-bytes"
import { formatDate } from "@/lib/format-time"
import { cn } from "@/lib/utils"

type OrphanSort = "file" | "problem" | "owner" | "size" | "created"
type ProblemFilter = "all" | MediaOrphan["kind"]
type ViewMode = "list" | "gallery"

/** Matches the per-request cap on the clean-up server function. */
const CLEAN_BATCH_SIZE = 500

const sortableColumns: {
  by: OrphanSort
  label: string
  column: "main" | "meta"
  className?: string
}[] = [
  { by: "file", label: "File", column: "main" },
  { by: "problem", label: "Problem", column: "meta" },
  { by: "owner", label: "Owner", column: "meta", className: "hidden md:table-cell" },
  { by: "size", label: "Size", column: "meta" },
  { by: "created", label: "Uploaded", column: "meta", className: "hidden lg:table-cell" },
]

/**
 * The two ways records and storage fall out of step: a record whose file is
 * gone, and a file no record points at. Only the second one is costing money,
 * but both are worth clearing out.
 */
export function MediaOrphansDashboard({
  initialData,
  defaultPageSize,
}: {
  initialData: OrphanDashboard
  defaultPageSize: number
}) {
  const [data, setData] = React.useState(initialData)
  const [scanning, setScanning] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [search, setSearch] = React.useState("")
  const [ownerId, setOwnerId] = React.useState("all")
  const [problem, setProblem] = React.useState<ProblemFilter>("all")
  const [sort, setSort] = React.useState<OrphanSort>("size")
  const [direction, setDirection] = React.useState<"asc" | "desc">("desc")
  const [viewMode, setViewMode] = React.useState<ViewMode>("gallery")
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(defaultPageSize)
  const [selectedKeys, setSelectedKeys] = React.useState<Set<string>>(new Set())
  const [openOrphan, setOpenOrphan] = React.useState<MediaOrphan | null>(null)
  const [confirmKeys, setConfirmKeys] = React.useState<string[] | null>(null)
  const [deletingAll, setDeletingAll] = React.useState(false)
  const [cleaning, setCleaning] = React.useState(false)

  const rescan = React.useCallback(async () => {
    setScanning(true)
    try {
      setData(await loadOrphans())
      setError(null)
    } catch (scanError) {
      setError(getAdminMediaErrorMessage(scanError))
    } finally {
      setScanning(false)
    }
  }, [])

  const matching = React.useMemo(() => {
    const query = search.trim().toLowerCase()
    return data.orphans.filter((row) => {
      if (problem !== "all" && row.kind !== problem) return false
      if (ownerId !== "all" && row.ownerId !== ownerId) return false
      if (!query) return true
      return `${row.name} ${row.storagePath} ${row.ownerName ?? ""}`
        .toLowerCase()
        .includes(query)
    })
  }, [data.orphans, ownerId, problem, search])

  const sorted = React.useMemo(() => {
    const rows = [...matching]
    const factor = direction === "asc" ? 1 : -1
    return rows.sort((a, b) => factor * compareOrphans(a, b, sort))
  }, [direction, matching, sort])

  const totalPages = sorted.length ? Math.ceil(sorted.length / pageSize) : 0
  const currentPage = Math.min(page, Math.max(1, totalPages))
  const visible = sorted.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  )

  const visibleKeys = visible.map(orphanKey)
  const allSelected =
    visibleKeys.length > 0 && visibleKeys.every((key) => selectedKeys.has(key))
  const someSelected = visibleKeys.some((key) => selectedKeys.has(key))

  function toggleSort(by: OrphanSort) {
    setDirection((current) =>
      sort === by
        ? current === "asc"
          ? "desc"
          : "asc"
        : by === "size" || by === "created"
          ? "desc"
          : "asc"
    )
    setSort(by)
    setPage(1)
  }

  function toggleOne(key: string) {
    setSelectedKeys((current) => {
      const next = new Set(current)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  function toggleVisible() {
    setSelectedKeys((current) => {
      const next = new Set(current)
      if (visibleKeys.every((key) => next.has(key))) {
        visibleKeys.forEach((key) => next.delete(key))
      } else {
        visibleKeys.forEach((key) => next.add(key))
      }
      return next
    })
  }

  async function handleClean() {
    if (!confirmKeys?.length) return

    const keys = new Set(confirmKeys)
    const selected = data.orphans.filter((row) => keys.has(orphanKey(row)))
    setCleaning(true)
    dismissErrorToast()
    try {
      // Each request re-verifies against a fresh scan, so a "delete all" over a
      // big bucket goes in batches rather than one oversized call.
      let deleted = 0
      for (let start = 0; start < selected.length; start += CLEAN_BATCH_SIZE) {
        const batch = selected.slice(start, start + CLEAN_BATCH_SIZE)
        const result = await cleanOrphanedMedia({
          mediaIds: batch
            .filter((row) => row.kind === "missing_file" && row.mediaId)
            .map((row) => row.mediaId as string),
          storagePaths: batch
            .filter((row) => row.kind === "unlinked_object")
            .map((row) => row.storagePath),
        })
        deleted += result.deletedCount
      }
      toast.success(
        `Cleaned up ${deleted} ${deleted === 1 ? "orphan" : "orphans"}.`
      )
      setSelectedKeys((current) => {
        const next = new Set(current)
        keys.forEach((key) => next.delete(key))
        return next
      })
      setConfirmKeys(null)
      setDeletingAll(false)
      setOpenOrphan(null)
      await rescan()
    } catch (cleanError) {
      showErrorToast(getAdminMediaErrorMessage(cleanError))
    } finally {
      setCleaning(false)
    }
  }

  const selectedCount = selectedKeys.size
  const isFiltered =
    Boolean(search.trim()) || ownerId !== "all" || problem !== "all"

  const tableError = error
    ? { message: error, onRetry: () => void rescan() }
    : data.scanError
      ? {
          message: getAdminMediaErrorMessage(data.scanError),
          onRetry: () => void rescan(),
        }
      : data.truncated
        ? {
            message: `Storage holds more files than one scan reads, so only the first ${data.scannedObjects.toLocaleString()} were checked. Records whose file is missing were skipped this time.`,
            onRetry: () => void rescan(),
          }
        : null

  const emptyText = scanning
    ? "Checking every file in storage…"
    : data.scanError
      ? "Storage could not be read, so orphans are unknown."
      : isFiltered
        ? "No orphans match those filters."
        : "Nothing orphaned. Every file has a record and every record has a file."

  const footer = {
    type: "pagination",
    page: currentPage,
    pageSize,
    total: sorted.length,
    totalPages,
    onPageChange: setPage,
    onPageSizeChange: (size: number) => {
      setPageSize(size)
      setPage(1)
    },
  } as const

  const controls = (
    <>
      {selectedCount ? (
              <DashboardToolbarButton
                type="button"
                variant="destructive"
                disabled={cleaning}
                onClick={() => {
                  setDeletingAll(false)
                  setConfirmKeys(Array.from(selectedKeys))
                }}
              >
                <Trash2Icon className="size-4" />
                Delete ({selectedCount})
              </DashboardToolbarButton>
            ) : null}
            {sorted.length ? (
              <DashboardToolbarButton
                type="button"
                variant="destructive"
                disabled={cleaning}
                onClick={() => {
                  setDeletingAll(true)
                  setConfirmKeys(sorted.map(orphanKey))
                }}
              >
                <Trash2Icon className="size-4" />
                Delete all ({sorted.length})
              </DashboardToolbarButton>
            ) : null}
            <DashboardToolbarSearch
              name="orphan-search"
              aria-label="Search orphans"
              placeholder="Search files or people…"
              value={search}
              onChange={(event) => {
                setPage(1)
                setSearch(event.target.value)
              }}
            />
            <Select
              value={ownerId}
              onValueChange={(value) => {
                setPage(1)
                setOwnerId(value)
              }}
            >
              <DashboardToolbarSelectTrigger aria-label="Filter by owner">
                <SelectValue placeholder="Owner" />
              </DashboardToolbarSelectTrigger>
              <SelectContent>
                <SelectItem value="all">All owners</SelectItem>
                {data.owners.map((owner) => (
                  <SelectItem key={owner.userId} value={owner.userId}>
                    {owner.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={problem}
              onValueChange={(value) => {
                setPage(1)
                setProblem(value as ProblemFilter)
              }}
            >
              <DashboardToolbarSelectTrigger aria-label="Filter by problem">
                <SelectValue />
              </DashboardToolbarSelectTrigger>
              <SelectContent>
                <SelectItem value="all">All problems</SelectItem>
                <SelectItem value="unlinked_object">No record in DB</SelectItem>
                <SelectItem value="missing_file">Missing in storage</SelectItem>
              </SelectContent>
            </Select>
            <div className={dashboardToolbarButtonGroupClassName}>
              <DashboardToolbarButton
                type="button"
                variant="ghost"
                className={cn(
                  dashboardToolbarButtonGroupItemClassName,
                  viewMode === "list" && dashboardToolbarButtonActiveClassName
                )}
                onClick={() => setViewMode("list")}
                aria-label="List view"
              >
                <ListIcon className="size-4" />
              </DashboardToolbarButton>
              <DashboardToolbarButton
                type="button"
                variant="ghost"
                className={cn(
                  dashboardToolbarButtonGroupItemClassName,
                  viewMode === "gallery" && dashboardToolbarButtonActiveClassName
                )}
                onClick={() => setViewMode("gallery")}
                aria-label="Gallery view"
              >
                <GridIcon className="size-4" />
              </DashboardToolbarButton>
            </div>
            <DashboardToolbarButton
              type="button"
              variant="outline"
              disabled={scanning}
              onClick={() => void rescan()}
            >
              {scanning ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <RefreshCwIcon className="size-4" />
              )}
              Scan again
            </DashboardToolbarButton>
    </>
  )

  if (viewMode === "gallery") {
    return (
      <>
        <DashboardTable
          title="Orphaned files"
          icon={<UnlinkIcon className="text-muted-foreground" />}
          count={sorted.length}
          selectedCount={selectedCount}
          onClearSelection={() => setSelectedKeys(new Set())}
          error={tableError}
          controls={controls}
          content={
            <div className="px-5 pb-5">
              {visible.length === 0 ? (
                <div className="grid h-72 place-items-center text-center text-sm text-muted-foreground">
                  <div>
                    <UnlinkIcon className="mx-auto mb-3 size-10" />
                    <p>{emptyText}</p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8">
                  {visible.map((row) => (
                    <OrphanGalleryItem
                      key={orphanKey(row)}
                      row={row}
                      selected={selectedKeys.has(orphanKey(row))}
                      onToggle={() => toggleOne(orphanKey(row))}
                      onOpen={() => setOpenOrphan(row)}
                      onDelete={() => {
                        setDeletingAll(false)
                        setConfirmKeys([orphanKey(row)])
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          }
          footer={footer}
        />

        <OrphanDialogs
          openOrphan={openOrphan}
          onCloseDetails={() => setOpenOrphan(null)}
          onDeleteFromDetails={() => {
            setDeletingAll(false)
            if (openOrphan) setConfirmKeys([orphanKey(openOrphan)])
          }}
          confirmKeys={confirmKeys}
          deletingAll={deletingAll}
          isFiltered={isFiltered}
          cleaning={cleaning}
          onCancelConfirm={() => {
            setConfirmKeys(null)
            setDeletingAll(false)
          }}
          onConfirm={() => void handleClean()}
        />
      </>
    )
  }

  return (
    <>
      <DashboardTable
        title="Orphaned files"
        icon={<UnlinkIcon className="text-muted-foreground" />}
        count={sorted.length}
        selectedCount={selectedCount}
        onClearSelection={() => setSelectedKeys(new Set())}
        error={tableError}
        controls={controls}
        header={
          <TableHeader>
            <TableRow>
              <TableHead column="select">
                <Checkbox
                  checked={
                    allSelected ? true : someSelected ? "indeterminate" : false
                  }
                  onCheckedChange={toggleVisible}
                  disabled={visible.length === 0}
                  aria-label="Select visible orphans"
                />
              </TableHead>
              {sortableColumns.map((column) => (
                <TableHead
                  key={column.by}
                  column={column.column}
                  className={column.className}
                  aria-sort={
                    sort === column.by
                      ? direction === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                >
                  <TableSortButton
                    active={sort === column.by}
                    direction={direction}
                    onClick={() => toggleSort(column.by)}
                  >
                    {column.label}
                  </TableSortButton>
                </TableHead>
              ))}
              <TableHead column="meta">Actions</TableHead>
            </TableRow>
          </TableHeader>
        }
        isEmpty={visible.length === 0}
        emptyText={emptyText}
        emptyColSpan={7}
        footer={footer}
      >
        {visible.map((row) => (
          <OrphanTableRow
            key={orphanKey(row)}
            row={row}
            selected={selectedKeys.has(orphanKey(row))}
            onToggle={() => toggleOne(orphanKey(row))}
            onOpen={() => setOpenOrphan(row)}
            onDelete={() => {
                        setDeletingAll(false)
                        setConfirmKeys([orphanKey(row)])
                      }}
          />
        ))}
      </DashboardTable>

      <OrphanDialogs
        openOrphan={openOrphan}
        onCloseDetails={() => setOpenOrphan(null)}
        onDeleteFromDetails={() => {
          setDeletingAll(false)
          if (openOrphan) setConfirmKeys([orphanKey(openOrphan)])
        }}
        confirmKeys={confirmKeys}
        deletingAll={deletingAll}
        isFiltered={isFiltered}
        cleaning={cleaning}
        onCancelConfirm={() => {
          setConfirmKeys(null)
          setDeletingAll(false)
        }}
        onConfirm={() => void handleClean()}
      />
    </>
  )
}

/** Both views open the same details modal and the same confirmation. */
function OrphanDialogs({
  openOrphan,
  onCloseDetails,
  onDeleteFromDetails,
  confirmKeys,
  deletingAll,
  isFiltered,
  cleaning,
  onCancelConfirm,
  onConfirm,
}: {
  openOrphan: MediaOrphan | null
  onCloseDetails: () => void
  onDeleteFromDetails: () => void
  confirmKeys: string[] | null
  deletingAll: boolean
  isFiltered: boolean
  cleaning: boolean
  onCancelConfirm: () => void
  onConfirm: () => void
}) {
  const count = confirmKeys?.length ?? 0
  const noun = count === 1 ? "orphan" : "orphans"

  return (
    <>
      {/* The details window steps aside while the confirmation is up rather than
          sitting under it — two windows means two focus traps and an Escape that
          only closes the top one. Cancelling brings the details back. */}
      <OrphanDetailsDialog
        open={Boolean(openOrphan) && !confirmKeys}
        orphan={openOrphan}
        onClose={onCloseDetails}
        onDelete={onDeleteFromDetails}
      />

      <ConfirmDialog
        open={Boolean(confirmKeys)}
        onOpenChange={(open) => {
          if (!open && !cleaning) onCancelConfirm()
        }}
        title={
          deletingAll
            ? `Delete all ${count} ${noun}?`
            : `Delete ${count} ${noun}?`
        }
        // "Delete all" clears what is on screen, so a filtered list says so
        // rather than letting the word "all" imply the whole bucket.
        description={`${
          deletingAll && isFiltered
            ? "This clears every orphan matching the current filters, not the whole list. "
            : ""
        }Files with no record in the database are erased from storage, and records whose file is missing are removed from the database. This cannot be undone.`}
        confirmLabel={deletingAll ? `Delete all ${noun}` : "Delete orphans"}
        loading={cleaning}
        onConfirm={onConfirm}
      />
    </>
  )
}

function OrphanTableRow({
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
    <TableRow className="group" data-state={selected ? "selected" : undefined}>
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
      <TableCell column="meta">
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

function OrphanGalleryItem({
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
function OrphanDetailsDialog({
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


function problemLabel(kind: MediaOrphan["kind"]) {
  return kind === "unlinked_object" ? "No record in DB" : "Missing in storage"
}

/** A record orphan is identified by its row, a storage orphan by its key. */
function orphanKey(row: MediaOrphan) {
  return row.kind === "missing_file" ? `db:${row.mediaId}` : `r2:${row.storagePath}`
}

function compareOrphans(a: MediaOrphan, b: MediaOrphan, sort: OrphanSort) {
  if (sort === "size") return a.bytes - b.bytes
  if (sort === "problem") return a.kind.localeCompare(b.kind)
  if (sort === "owner") {
    return (a.ownerName ?? "").localeCompare(b.ownerName ?? "")
  }
  if (sort === "created") {
    return (a.createdAt ?? "").localeCompare(b.createdAt ?? "")
  }
  return a.name.localeCompare(b.name)
}
