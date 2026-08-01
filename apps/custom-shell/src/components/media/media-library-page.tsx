import * as React from "react"
import { toast } from "sonner"
import {
  GridIcon,
  ImageIcon,
  ListIcon,
  Loader2Icon,
  SettingsIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { dismissErrorToast, showErrorToast } from "@/lib/error-toast"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
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
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DetailRow } from "@/components/media/media-detail-row"
import { MediaThumbnail } from "@/components/media/media-thumbnail"
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
} from "@/components/ui/table"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  getAdminMediaErrorMessage,
  deleteMediaAsAdminAction,
  loadAdminMediaPage,
  type AdminMediaItem,
  type AdminMediaListResponse,
  type AdminMediaSort,
  type AdminMediaTypeFilter,
  type MediaOwner,
} from "@/lib/api/admin-media"
import { getMediaErrorMessage, updateMedia, uploadMedia } from "@/lib/api/media"
import { DASHBOARD_ROWS_PER_PAGE_OPTIONS } from "@/lib/custom-shell"
import { formatFileSize } from "@/lib/format-bytes"
import { getMediaUploadError, mediaAccept } from "@/lib/media-upload"
import { formatDate } from "@/lib/money"
import { useClearSelectionOnListChange } from "@/lib/use-clear-selection"
import { cn } from "@/lib/utils"

const pageSizeOptions = [...DASHBOARD_ROWS_PER_PAGE_OPTIONS]

type ViewMode = "list" | "gallery"

export type AdminMediaPageData = {
  media: AdminMediaListResponse
  owners: MediaOwner[]
  /** The configured rows-per-page the loader's first page was fetched at. */
  pageSize: number
}

const sortableColumns: {
  by: AdminMediaSort
  label: string
  column: "main" | "meta"
  className?: string
}[] = [
  { by: "file", label: "File", column: "main" },
  { by: "owner", label: "Owner", column: "meta" },
  { by: "type", label: "Type", column: "meta" },
  { by: "size", label: "Size", column: "meta", className: "hidden md:table-cell" },
  { by: "created", label: "Added", column: "meta", className: "hidden lg:table-cell" },
]

/**
 * One toast for the whole pick, whatever happened: a plain success, or the red
 * one naming the files that did not make it. The success wording names where
 * the files went, because this page lists everyone's files but uploads only
 * ever land in the signed-in admin's own library.
 */
function showUploadSummary(
  done: number,
  picked: number,
  failures: { name: string; reason: string }[]
) {
  if (!failures.length) {
    toast.success(
      done === 1
        ? "Uploaded to your library."
        : `${done} files uploaded to your library.`
    )
    return
  }

  if (picked === 1) {
    showErrorToast(failures[0].reason)
    return
  }

  // A folder's worth of rejected files would otherwise fill the screen with
  // names, so only the first few are read out.
  const shown = failures.slice(0, 5).map((failure) => failure.name)
  const names =
    failures.length > shown.length
      ? `${shown.join(", ")} and ${failures.length - shown.length} more`
      : shown.join(", ")
  // The same reason usually explains every skipped file, so say it once.
  const reasons = Array.from(new Set(failures.map((failure) => failure.reason)))
  showErrorToast(
    `${done} uploaded, ${failures.length} failed: ${names} — ${reasons.join(" ")}`
  )
}

/**
 * Every account's media in one place, with an owner column and filter. Storage
 * accounting and orphan cleanup live on their own page. Uploads still land in
 * the signed-in admin's own library — the Upload button's tooltip and the
 * success toast say so, so nobody has to find that out by uploading.
 */
export function MediaLibraryPage({
  initialData,
  initialOwnerId,
  currentUserId,
}: {
  initialData: AdminMediaPageData
  initialOwnerId: string
  currentUserId: string
}) {
  const [data, setData] = React.useState(initialData)
  const [error, setError] = React.useState<string | null>(null)
  const [search, setSearch] = React.useState("")
  const [ownerId, setOwnerId] = React.useState(initialOwnerId)
  const [typeFilter, setTypeFilter] = React.useState<AdminMediaTypeFilter>("all")
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(initialData.pageSize)
  const [viewMode, setViewMode] = React.useState<ViewMode>("gallery")
  const [sort, setSort] = React.useState<AdminMediaSort>("created")
  const [direction, setDirection] = React.useState<"asc" | "desc">("desc")
  const [upload, setUpload] = React.useState<{ done: number; total: number } | null>(
    null
  )
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const [openMedia, setOpenMedia] = React.useState<AdminMediaItem | null>(null)
  const [deleteIds, setDeleteIds] = React.useState<string[] | null>(null)
  const [deleting, setDeleting] = React.useState(false)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  const query = React.useMemo(
    () => ({ search, ownerId, fileType: typeFilter, page, pageSize, sort, direction }),
    [direction, ownerId, page, pageSize, search, sort, typeFilter]
  )

  const refresh = React.useCallback(async () => {
    try {
      const next = await loadAdminMediaPage(query)
      setData(next)
      setError(null)
      // Deleting someone's last file drops them from the owner list. Left
      // alone, the filter would sit on a name that no longer has a label.
      if (
        query.ownerId !== "all" &&
        !next.owners.some((owner) => owner.userId === query.ownerId)
      ) {
        setOwnerId("all")
        setPage(1)
      }
    } catch (loadError) {
      setError(getAdminMediaErrorMessage(loadError))
    }
  }, [query])

  // A queue of uploads runs for minutes, and the filters stay live the whole
  // time. Reloading through a ref means the reload at the end asks for whatever
  // is on screen now, not the filters that were set when the pick started.
  const refreshRef = React.useRef(refresh)
  React.useEffect(() => {
    refreshRef.current = refresh
  }, [refresh])

  // The route already loaded the first page at the configured rows-per-page.
  // Anything else — a filter, a page, a different size — refetches.
  const loadedQuery = React.useRef(
    JSON.stringify({
      search: "",
      ownerId: initialOwnerId,
      fileType: "all",
      page: 1,
      pageSize: initialData.pageSize,
      sort: "created",
      direction: "desc",
    })
  )
  React.useEffect(() => {
    if (JSON.stringify(query) === loadedQuery.current) return

    const timer = setTimeout(() => void refresh(), 250)
    return () => clearTimeout(timer)
  }, [query, refresh])

  useClearSelectionOnListChange(setSelectedIds, JSON.stringify(query))

  const media = data.media.media
  const visibleIds = media.map((item) => item.id)
  const allSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id))
  const someSelected = visibleIds.some((id) => selectedIds.has(id))

  function toggleOne(mediaId: string) {
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

  function toggleVisible() {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (visibleIds.every((id) => next.has(id))) {
        visibleIds.forEach((id) => next.delete(id))
      } else {
        visibleIds.forEach((id) => next.add(id))
      }
      return next
    })
  }

  function toggleSort(by: AdminMediaSort) {
    setDirection((current) =>
      sort === by
        ? current === "asc"
          ? "desc"
          : "asc"
        : by === "created" || by === "size"
          ? "desc"
          : "asc"
    )
    setSort(by)
    setPage(1)
  }

  /**
   * One pick can be many files. They go up one at a time — the same single-file
   * upload, repeated — so a failure part way through leaves the files before it
   * saved and keeps going with the ones after it.
   */
  async function handleUploadSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.target
    const files = Array.from(input.files ?? [])
    // Cleared straight away so picking the same files again still fires a change.
    input.value = ""
    if (!files.length) return

    dismissErrorToast()
    setUpload({ done: 0, total: files.length })

    let done = 0
    const failures: { name: string; reason: string }[] = []
    for (const file of files) {
      const invalid = getMediaUploadError(file, true)
      if (invalid) {
        failures.push({ name: file.name, reason: invalid })
        continue
      }

      try {
        await uploadMedia(file)
        done += 1
        setUpload({ done, total: files.length })
      } catch (uploadError) {
        failures.push({ name: file.name, reason: getMediaErrorMessage(uploadError) })
      }
    }

    setUpload(null)
    if (done) await refreshRef.current()
    showUploadSummary(done, files.length, failures)
  }

  async function handleConfirmDelete() {
    if (!deleteIds?.length) return

    const ids = deleteIds
    dismissErrorToast()
    setDeleting(true)
    try {
      const result = await deleteMediaAsAdminAction(ids)
      toast.success(
        `Deleted ${result.deletedCount} ${result.deletedCount === 1 ? "file" : "files"}.`
      )
      setSelectedIds((current) => {
        const next = new Set(current)
        ids.forEach((id) => next.delete(id))
        return next
      })
      setDeleteIds(null)
      setOpenMedia(null)
      await refresh()
    } catch (deleteError) {
      showErrorToast(getAdminMediaErrorMessage(deleteError))
    } finally {
      setDeleting(false)
    }
  }

  // Ticks are cleared whenever the query changes, so everything held is on the
  // current page: "Clear n selected" and "Delete (n)" always say the same thing.
  const selectedCount = selectedIds.size
  const isFiltered = Boolean(search.trim()) || ownerId !== "all" || typeFilter !== "all"

  // Filtering to someone else's files is the moment an upload is most likely to
  // surprise, so the button says so there instead of only in general terms.
  const filteredOwnerName =
    ownerId !== "all" && ownerId !== currentUserId
      ? data.owners.find((owner) => owner.userId === ownerId)?.name
      : undefined
  const uploadHint = filteredOwnerName
    ? `New files are added to your own library. Filtering by ${filteredOwnerName} does not change that.`
    : "New files are added to your own library."

  const mediaControls = (
    <>
      {selectedIds.size > 0 ? (
        <DashboardToolbarButton
          type="button"
          variant="destructive"
          onClick={() => setDeleteIds(Array.from(selectedIds))}
        >
          <Trash2Icon className="size-4" />
          Delete ({selectedIds.size})
        </DashboardToolbarButton>
      ) : null}
      <DashboardToolbarSearch
        name="media-search"
        aria-label="Search media"
        placeholder="Search files or people..."
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
        value={typeFilter}
        onValueChange={(value) => {
          setPage(1)
          setTypeFilter(value as AdminMediaTypeFilter)
        }}
      >
        <DashboardToolbarSelectTrigger aria-label="Media type filter">
          <SelectValue />
        </DashboardToolbarSelectTrigger>
        <SelectContent>
          <SelectItem value="all">All types</SelectItem>
          <SelectItem value="image">Images</SelectItem>
          <SelectItem value="video">Videos</SelectItem>
          <SelectItem value="svg">SVG</SelectItem>
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
      {upload ? (
        <span className="text-sm text-muted-foreground" role="status">
          {upload.done} of {upload.total} uploaded…
        </span>
      ) : null}
      <Tooltip>
        <TooltipTrigger asChild>
          <DashboardToolbarButton
            type="button"
            disabled={Boolean(upload)}
            onClick={() => fileInputRef.current?.click()}
          >
            {upload ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <UploadIcon className="size-4" />
            )}
            Upload Media
          </DashboardToolbarButton>
        </TooltipTrigger>
        <TooltipContent>{uploadHint}</TooltipContent>
      </Tooltip>
    </>
  )

  const footer = {
    type: "pagination",
    page,
    pageSize,
    total: data.media.total,
    totalPages: data.media.total_pages,
    pageSizeOptions,
    onPageChange: setPage,
    onPageSizeChange: (size: number) => {
      setPageSize(size)
      setPage(1)
    },
  } as const

  const emptyText = isFiltered
    ? "No files match those filters."
    : "No media has been uploaded yet."

  return (
    <div
      className="flex w-full flex-col"
      style={{ gap: "var(--shell-gutter, 1.5rem)" }}
    >
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        multiple
        accept={mediaAccept(true)}
        onChange={handleUploadSelect}
      />

      {viewMode === "gallery" ? (
        <DashboardTable
          title="All media"
          icon={<ImageIcon className="text-muted-foreground" />}
          count={data.media.total}
          error={error ? { message: error, onRetry: () => void refresh() } : null}
          selectedCount={selectedCount}
          onClearSelection={() => setSelectedIds(new Set())}
          controls={mediaControls}
          content={
            <div className="px-5 pb-5">
              {media.length === 0 ? (
                <div className="grid h-72 place-items-center text-center text-sm text-muted-foreground">
                  <div>
                    <ImageIcon className="mx-auto mb-3 size-10" />
                    <p>{emptyText}</p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8">
                  {media.map((item) => (
                    <GalleryItem
                      key={item.id}
                      item={item}
                      selected={selectedIds.has(item.id)}
                      onOpen={() => setOpenMedia(item)}
                      onDelete={() => setDeleteIds([item.id])}
                      onToggle={() => toggleOne(item.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          }
          footer={footer}
        />
      ) : (
        <DashboardTable
          title="All media"
          icon={<ImageIcon className="text-muted-foreground" />}
          count={data.media.total}
          error={error ? { message: error, onRetry: () => void refresh() } : null}
          selectedCount={selectedCount}
          onClearSelection={() => setSelectedIds(new Set())}
          controls={mediaControls}
          header={
            <TableHeader>
              <TableRow>
                <TableHead column="select">
                  <Checkbox
                    checked={
                      allSelected ? true : someSelected ? "indeterminate" : false
                    }
                    onCheckedChange={toggleVisible}
                    disabled={media.length === 0}
                    aria-label="Select visible media"
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
          isEmpty={media.length === 0}
          emptyText={emptyText}
          emptyColSpan={7}
          footer={footer}
        >
          {media.map((item) => (
            <MediaTableRow
              key={item.id}
              item={item}
              selected={selectedIds.has(item.id)}
              onToggle={() => toggleOne(item.id)}
              onOpen={() => setOpenMedia(item)}
              onDelete={() => setDeleteIds([item.id])}
            />
          ))}
        </DashboardTable>
      )}

      <MediaDetailsDialog
        key={openMedia?.id ?? "closed"}
        item={openMedia}
        editable={openMedia?.owner_id === currentUserId}
        onClose={() => setOpenMedia(null)}
        onDelete={() => {
          if (openMedia) setDeleteIds([openMedia.id])
        }}
        onSaved={async () => {
          setOpenMedia(null)
          await refresh()
        }}
      />

      <ConfirmDialog
        open={Boolean(deleteIds)}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteIds(null)
        }}
        title={`Delete ${deleteIds?.length ?? 0} ${(deleteIds?.length ?? 0) === 1 ? "file" : "files"}?`}
        description="The file is erased from storage and removed from its owner's library. This cannot be undone."
        confirmLabel="Delete"
        loading={deleting}
        onConfirm={() => void handleConfirmDelete()}
      />
    </div>
  )
}

/**
 * Alt text is saved through the owner-scoped endpoint, so it is editable only
 * on your own files. Someone else's file opens read-only, with delete.
 */
function MediaDetailsDialog({
  item,
  editable,
  onClose,
  onDelete,
  onSaved,
}: {
  item: AdminMediaItem | null
  editable: boolean
  onClose: () => void
  onDelete: () => void
  onSaved: () => Promise<void>
}) {
  const [altText, setAltText] = React.useState(item?.alt_text ?? "")
  const [saving, setSaving] = React.useState(false)

  async function handleSave() {
    if (!item) return

    setSaving(true)
    dismissErrorToast()
    try {
      await updateMedia(item.id, altText)
      toast.success("Media updated.")
      await onSaved()
    } catch (saveError) {
      showErrorToast(getMediaErrorMessage(saveError))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={Boolean(item)}
      onOpenChange={(open) => {
        if (!open && !saving) onClose()
      }}
    >
      <DialogContent variant="admin">
        <DialogHeader>
          {/* A file name is the whole point of this header, so it wraps rather
              than losing its end to the shared one-line truncation. */}
          <DialogTitle className="pr-8 break-all whitespace-normal">
            {item?.original_name ?? "File"}
          </DialogTitle>
          <DialogDescription className="break-words">
            {item ? `Uploaded by ${item.owner_name} (${item.owner_email})` : null}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {item ? (
            <>
              <Card size="sm">
                <CardContent className="grid gap-4">
                  {item.file_type === "video" ? (
                    // Opened deliberately, so it plays with sound and seeks
                    // over range requests rather than downloading in full.
                    <video
                      src={item.url}
                      className="mx-auto max-h-[50vh] w-full rounded-lg bg-muted object-contain"
                      controls
                      playsInline
                      preload="metadata"
                    />
                  ) : (
                    <img
                      src={item.url}
                      alt={item.alt_text ?? item.original_name}
                      className="mx-auto max-h-[50vh] w-full rounded-lg object-contain"
                    />
                  )}
                  <dl className="grid gap-2 text-sm sm:grid-cols-2">
                    <DetailRow label="Type" value={item.mime_type} />
                    <DetailRow label="Size" value={formatFileSize(item.file_size)} />
                    <DetailRow label="Added" value={formatDate(item.created_at)} />
                    <DetailRow label="Stored at" value={item.storage_path} />
                  </dl>
                </CardContent>
              </Card>

              {editable ? (
                <Card size="sm">
                  <CardContent className="grid gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="media-alt-text">
                        {item.file_type === "video" ? "Description" : "Alt text"}
                      </Label>
                      <Input
                        id="media-alt-text"
                        value={altText}
                        onChange={(event) => setAltText(event.target.value)}
                        placeholder="Optional"
                      />
                    </div>
                  </CardContent>
                </Card>
              ) : item.alt_text ? (
                <Card size="sm">
                  <CardContent className="grid gap-4">
                    <dl className="grid gap-2 text-sm">
                      <DetailRow
                        label={item.file_type === "video" ? "Description" : "Alt text"}
                        value={item.alt_text}
                      />
                    </dl>
                  </CardContent>
                </Card>
              ) : null}
            </>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            variant="destructive"
            disabled={saving}
            onClick={onDelete}
          >
            Delete
          </Button>
          <Button type="button" variant="outline" disabled={saving} onClick={onClose}>
            {editable ? "Cancel" : "Close"}
          </Button>
          {editable ? (
            <Button type="button" disabled={saving} onClick={() => void handleSave()}>
              Save
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}


function MediaTableRow({
  item,
  selected,
  onToggle,
  onOpen,
  onDelete,
}: {
  item: AdminMediaItem
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
          aria-label={`Select ${item.original_name}`}
        />
      </TableCell>
      <TableCell column="main">
        <div className="flex min-w-0 items-center gap-3">
          <MediaThumbnail
            url={item.url}
            fileType={item.file_type}
            alt={item.alt_text ?? item.original_name}
            className="size-12 shrink-0 rounded-md border bg-muted"
            compact
          />
          <div className="min-w-0">
            <button
              type="button"
              className="block max-w-full truncate text-left text-sm font-medium group-hover:underline"
              title={item.original_name}
              onClick={onOpen}
            >
              {item.original_name}
            </button>
            {item.alt_text ? (
              <div
                className="max-w-[280px] truncate text-xs text-muted-foreground"
                title={item.alt_text}
              >
                {item.alt_text}
              </div>
            ) : null}
          </div>
        </div>
      </TableCell>
      <TableCell column="meta" className="max-w-56">
        <span className="block truncate" title={item.owner_email}>
          {item.owner_name}
        </span>
      </TableCell>
      <TableCell column="mutedMeta" className="capitalize">
        {item.file_type}
      </TableCell>
      <TableCell column="mutedMeta" className="hidden md:table-cell">
        {formatFileSize(item.file_size)}
      </TableCell>
      <TableCell column="mutedMeta" className="hidden lg:table-cell">
        {formatDate(item.created_at)}
      </TableCell>
      <TableCell column="meta">
        <div className="flex items-center">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onOpen}
            title="File settings"
            aria-label={`File settings for ${item.original_name}`}
          >
            <SettingsIcon className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onDelete}
            title="Delete file"
            aria-label={`Delete ${item.original_name}`}
          >
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
  onOpen,
  onDelete,
}: {
  item: AdminMediaItem
  selected: boolean
  onToggle: () => void
  onOpen: () => void
  onDelete: () => void
}) {
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-lg border bg-muted",
        selected && "border-primary ring-3 ring-primary/15"
      )}
    >
      <button
        type="button"
        className="relative block aspect-[3/4] w-full bg-muted"
        onClick={onOpen}
      >
        <MediaThumbnail
          url={item.url}
          fileType={item.file_type}
          alt={item.alt_text ?? item.original_name}
          className="h-full w-full"
        />
        <span className="absolute top-2 left-2 rounded bg-background/90 px-1.5 py-0.5 text-[10px] capitalize">
          {item.file_type}
        </span>
        <span
          className="absolute right-2 bottom-2 left-2 truncate rounded bg-background/90 px-1.5 py-0.5 text-left text-[10px] group-hover:opacity-0"
          title={item.owner_email}
        >
          {item.owner_name}
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
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onOpen}
          aria-label={`File settings for ${item.original_name}`}
        >
          <SettingsIcon className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onDelete}
          aria-label={`Delete ${item.original_name}`}
        >
          <Trash2Icon className="size-4" />
        </Button>
      </div>
    </div>
  )
}
