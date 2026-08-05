import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"
import {
  GridIcon,
  ImageIcon,
  ListIcon,
  Loader2Icon,
  RefreshCwIcon,
  SettingsIcon,
  Trash2Icon,
  UnlinkIcon,
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
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { FormDialog } from "@/components/ui/form-dialog"
import { DetailRow } from "@/components/media/media-detail-row"
import {
  OrphanDetailsDialog,
  OrphanGalleryItem,
  OrphanTableRow,
} from "@/components/media/media-orphan-rows"
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
  SortableTableHeader,
  type SortableColumn,
} from "@/components/shared/sortable-table-header"
import { TableCell, TableHead, TableRow } from "@/components/ui/table"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  cleanOrphanedMedia,
  getAdminMediaErrorMessage,
  loadAdminMediaItem,
  deleteMediaAsAdminAction,
  loadAdminMediaPage,
  loadOrphans,
  type AdminMediaItem,
  type AdminMediaListResponse,
  type AdminMediaSort,
  type AdminMediaTypeFilter,
  type MediaOrphan,
  type MediaOwner,
  type OrphanDashboard,
} from "@/lib/api/admin-media"
import { getMediaErrorMessage, updateMedia, uploadMedia } from "@/lib/api/media"
import { formatFileSize } from "@/lib/format-bytes"
import { formatDate } from "@/lib/format-time"
import {
  compareOrphans,
  orphanKey,
  type OrphanSort,
} from "@/lib/media-orphans"
import { getMediaUploadError, mediaAccept } from "@/lib/media-upload"
import { useLastValue } from "@/lib/use-last-value"
import {
  MEDIA_VIEW_STORAGE_KEY,
  useRememberedChoice,
} from "@/lib/remembered-choice"
import { useAsyncAction } from "@/lib/use-async-action"
import { useClearSelectionOnListChange } from "@/lib/use-clear-selection"
import { useClientPage } from "@/lib/use-client-page"
import { useSelection } from "@/lib/use-selection"
import { useTableSort } from "@/lib/use-table-sort"
import { cn } from "@/lib/utils"

type ViewMode = "list" | "gallery"

const viewModes: readonly ViewMode[] = ["list", "gallery"]

/**
 * The type filter doubles as the way into the orphans — the files and records
 * that have fallen out of step with each other. They are media on this page
 * too, just the broken kind, so they are one more choice in the same dropdown
 * rather than a page of their own.
 */
type MediaViewFilter =
  | AdminMediaTypeFilter
  | "orphaned"
  | "orphaned-unlinked"
  | "orphaned-missing"

/** Which orphans a filter asks for, or null when it is not asking for orphans. */
function orphanKindOf(filter: MediaViewFilter): "all" | MediaOrphan["kind"] | null {
  if (filter === "orphaned") return "all"
  if (filter === "orphaned-unlinked") return "unlinked_object"
  if (filter === "orphaned-missing") return "missing_file"
  return null
}

/** Matches the per-request cap on the clean-up server function. */
const CLEAN_BATCH_SIZE = 500

export type AdminMediaPageData = {
  media: AdminMediaListResponse
  owners: MediaOwner[]
  /** The configured rows-per-page the loader's first page was fetched at. */
  pageSize: number
}

const sortableColumns: SortableColumn<AdminMediaSort>[] = [
  { key: "file", label: "File", column: "main" },
  { key: "owner", label: "Owner", column: "meta" },
  { key: "type", label: "Type", column: "meta" },
  { key: "size", label: "Size", column: "meta", className: "hidden md:table-cell" },
  { key: "created", label: "Added", column: "meta", className: "hidden lg:table-cell" },
]

const orphanSortableColumns: SortableColumn<OrphanSort>[] = [
  { key: "file", label: "File", column: "main" },
  { key: "problem", label: "Problem", column: "meta" },
  { key: "owner", label: "Owner", column: "meta", className: "hidden md:table-cell" },
  { key: "size", label: "Size", column: "meta" },
  {
    key: "created",
    label: "Uploaded",
    column: "meta",
    className: "hidden lg:table-cell",
  },
]

/** Date and size read as numbers, so they start newest- and biggest-first. */
const mediaSortDirection = (column: AdminMediaSort) =>
  column === "created" || column === "size" ? "desc" : "asc"

/** Size and date read as numbers, so they start biggest- and newest-first. */
const orphanSortDirection = (column: OrphanSort) =>
  column === "size" || column === "created" ? "desc" : "asc"

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
 * Every account's media in one place, with an owner column and filter. Setting
 * the type filter to orphans swaps the same table over to the files and records
 * that have lost each other, keeping the search, the owner filter and both
 * views.
 *
 * Uploads still land in the signed-in admin's own library — the Upload button's
 * tooltip and the success toast say so, so nobody has to find that out by
 * uploading.
 */
export function MediaLibraryPage({
  initialData,
  initialOwnerId,
  currentUserId,
  openMediaId,
  openOrphanKey,
}: {
  initialData: AdminMediaPageData
  initialOwnerId: string
  currentUserId: string
  openMediaId?: string
  openOrphanKey?: string
}) {
  const navigate = useNavigate()
  const [data, setData] = React.useState(initialData)
  const [error, setError] = React.useState<string | null>(null)
  const [search, setSearch] = React.useState("")
  const [ownerId, setOwnerId] = React.useState(initialOwnerId)
  const [typeFilter, setTypeFilter] = React.useState<MediaViewFilter>("all")
  // The media list holds on to the last real file type while the orphans are on
  // screen, so coming back to it does not refetch a page that is already there.
  const [mediaType, setMediaType] = React.useState<AdminMediaTypeFilter>("all")
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(initialData.pageSize)
  // List or gallery is a habit, not a per-visit decision, so the page opens the
  // way it was last left.
  const [viewMode, setViewMode] = useRememberedChoice(
    MEDIA_VIEW_STORAGE_KEY,
    "gallery",
    viewModes
  )
  const {
    sort,
    direction,
    toggleSort: sortBy,
  } = useTableSort<AdminMediaSort>("created", "desc", mediaSortDirection)
  const [upload, setUpload] = React.useState<{ done: number; total: number } | null>(
    null
  )
  const selection = useSelection()
  const selectedIds = selection.selected
  const [openMedia, setOpenMedia] = React.useState<AdminMediaItem | null>(null)
  const [deleteIds, setDeleteIds] = React.useState<string[] | null>(null)
  // The confirmation is still on screen while it fades out, after the selection
  // has been cleared — so it keeps counting what it opened with, not "0 files".
  const closingDeleteCount = useLastValue(deleteIds)?.length ?? 0
  const [runDelete, deleting] = useAsyncAction(getAdminMediaErrorMessage)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  const problem = orphanKindOf(typeFilter)
  const showOrphans = problem !== null

  // Finding orphans means reading the whole bucket, so the scan runs the first
  // time the filter asks for it and the result is kept until it changes.
  const [orphanData, setOrphanData] = React.useState<OrphanDashboard | null>(null)
  const [scanning, setScanning] = React.useState(false)
  const [orphanError, setOrphanError] = React.useState<string | null>(null)
  const {
    sort: orphanSort,
    direction: orphanDirection,
    toggleSort: toggleOrphanSort,
  } = useTableSort<OrphanSort>("size", "desc", orphanSortDirection)
  const [openOrphan, setOpenOrphan] = React.useState<MediaOrphan | null>(null)
  const [confirmKeys, setConfirmKeys] = React.useState<string[] | null>(null)
  // Same as the media confirmation: the window is still fading out after the
  // keys have been cleared, so it keeps counting what it opened with.
  const closingCleanCount = useLastValue(confirmKeys)?.length ?? 0
  const [deletingAll, setDeletingAll] = React.useState(false)
  const [runClean, cleaning] = useAsyncAction(getAdminMediaErrorMessage)
  const setOpenRecord = React.useCallback(
    (key: "media" | "orphan", id: string | undefined) => {
      void navigate({
        to: ".",
        search: (previous: Record<string, unknown>) => {
          const next = { ...previous }
          delete next.media
          delete next.orphan
          if (id) next[key] = id
          return next
        },
      })
    },
    [navigate]
  )

  const query = React.useMemo(
    () => ({ search, ownerId, fileType: mediaType, page, pageSize, sort, direction }),
    [direction, mediaType, ownerId, page, pageSize, search, sort]
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

  const rescan = React.useCallback(async () => {
    setScanning(true)
    try {
      setOrphanData(await loadOrphans())
      setOrphanError(null)
    } catch (scanError) {
      setOrphanError(getAdminMediaErrorMessage(scanError))
    } finally {
      setScanning(false)
    }
  }, [])

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
    // Typing in the search box while the orphans are up filters those. The
    // media list catches up the moment the filter comes back to it.
    if (showOrphans) return
    if (JSON.stringify(query) === loadedQuery.current) return

    const timer = setTimeout(() => void refresh(), 250)
    return () => clearTimeout(timer)
  }, [query, refresh, showOrphans])

  // Media rows are held by id and orphans by a key of their own, so moving
  // between the two starts the selection over.
  useClearSelectionOnListChange(
    selection.setSelected,
    `${typeFilter}|${JSON.stringify(query)}`
  )

  const media = data.media.media
  React.useEffect(() => {
    if (!openMediaId) {
      setOpenMedia(null)
      return
    }

    const visibleItem = media.find((item) => item.id === openMediaId)
    if (visibleItem) {
      setOpenMedia(visibleItem)
      return
    }

    let active = true
    void loadAdminMediaItem(openMediaId)
      .then((item) => {
        if (active) setOpenMedia(item)
      })
      .catch(() => {
        if (active) setOpenMedia(null)
      })
    return () => {
      active = false
    }
  }, [media, openMediaId])
  React.useEffect(() => {
    if (openOrphanKey && !orphanData) void rescan()
    if (orphanData) {
      setOpenOrphan(
        orphanData.orphans.find((item) => orphanKey(item) === openOrphanKey) ?? null
      )
    }
  }, [openOrphanKey, orphanData, rescan])
  const visibleIds = media.map((item) => item.id)

  const matchingOrphans = React.useMemo(() => {
    if (!orphanData) return []

    const text = search.trim().toLowerCase()
    return orphanData.orphans.filter((row) => {
      if (problem !== "all" && row.kind !== problem) return false
      if (ownerId !== "all" && row.ownerId !== ownerId) return false
      if (!text) return true
      return `${row.name} ${row.storagePath} ${row.ownerName ?? ""}`
        .toLowerCase()
        .includes(text)
    })
  }, [orphanData, ownerId, problem, search])

  const sortedOrphans = React.useMemo(() => {
    const rows = [...matchingOrphans]
    const factor = orphanDirection === "asc" ? 1 : -1
    return rows.sort((a, b) => factor * compareOrphans(a, b, orphanSort))
  }, [matchingOrphans, orphanDirection, orphanSort])

  // The whole orphan list arrives in one go, so its pages are cut here rather
  // than asked for one at a time like the media list's.
  const orphanPage = useClientPage(
    sortedOrphans,
    initialData.pageSize,
    `${search}|${ownerId}|${problem}|${orphanSort}|${orphanDirection}`
  )
  const visibleOrphans = orphanPage.visible
  const visibleOrphanKeys = visibleOrphans.map(orphanKey)

  // The rows come from the server a page at a time, so a new order means a new
  // first page.
  function toggleSort(by: AdminMediaSort) {
    sortBy(by)
    setPage(1)
  }

  function handleTypeChange(value: MediaViewFilter) {
    setPage(1)
    setTypeFilter(value)
    if (orphanKindOf(value) === null) {
      setMediaType(value as AdminMediaTypeFilter)
      return
    }
    // The scan starts on the pick rather than on a render, so the very first
    // look at the orphans fires exactly one of them.
    if (!orphanData && !scanning) void rescan()
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
    await runDelete(async () => {
      const result = await deleteMediaAsAdminAction(ids)
      toast.success(
        `Deleted ${result.deletedCount} ${result.deletedCount === 1 ? "file" : "files"}.`
      )
      selection.setSelected((current) => {
        const next = new Set(current)
        ids.forEach((id) => next.delete(id))
        return next
      })
      setDeleteIds(null)
      setOpenMedia(null)
      await refresh()
    })
  }

  async function handleClean() {
    if (!confirmKeys?.length || !orphanData) return

    const keys = new Set(confirmKeys)
    const selected = orphanData.orphans.filter((row) => keys.has(orphanKey(row)))
    await runClean(async () => {
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
      selection.setSelected((current) => {
        const next = new Set(current)
        keys.forEach((key) => next.delete(key))
        return next
      })
      setConfirmKeys(null)
      setDeletingAll(false)
      setOpenOrphan(null)
      // A cleaned-up record was media a moment ago, so the library behind the
      // filter is stale too.
      await Promise.all([rescan(), refresh()])
    })
  }

  // Ticks are cleared whenever the query changes, so everything held is on the
  // current page: "Clear n selected" and "Delete (n)" always say the same thing.
  const selectedCount = selectedIds.size
  const isFiltered = showOrphans
    ? Boolean(search.trim()) || ownerId !== "all" || problem !== "all"
    : Boolean(search.trim()) || ownerId !== "all" || typeFilter !== "all"

  // Somebody can hold orphans without holding any live media, so while they are
  // showing the owner filter offers both lists rather than only today's owners.
  const owners = React.useMemo(() => {
    if (!showOrphans || !orphanData) return data.owners

    const merged = new Map(data.owners.map((owner) => [owner.userId, owner]))
    orphanData.owners.forEach((owner) => merged.set(owner.userId, owner))
    return Array.from(merged.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [data.owners, orphanData, showOrphans])

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
      {selectedCount > 0 ? (
        <DashboardToolbarButton
          type="button"
          variant="destructive"
          disabled={cleaning}
          onClick={() => {
            if (showOrphans) {
              setDeletingAll(false)
              setConfirmKeys(Array.from(selectedIds))
              return
            }
            setDeleteIds(Array.from(selectedIds))
          }}
        >
          <Trash2Icon className="size-4" />
          Delete ({selectedCount})
        </DashboardToolbarButton>
      ) : null}
      {showOrphans && sortedOrphans.length ? (
        <DashboardToolbarButton
          type="button"
          variant="destructive"
          disabled={cleaning}
          onClick={() => {
            setDeletingAll(true)
            setConfirmKeys(sortedOrphans.map(orphanKey))
          }}
        >
          <Trash2Icon className="size-4" />
          Delete all ({sortedOrphans.length})
        </DashboardToolbarButton>
      ) : null}
      {showOrphans ? (
        <>
          {/* Icon only: with its label spelled out the row runs long enough to
              wrap the title onto a second line, which moves every control down
              a few pixels the moment the orphans are picked. */}
          <Tooltip>
            <TooltipTrigger asChild>
              <DashboardToolbarButton
                type="button"
                variant="outline"
                className="px-2"
                disabled={scanning}
                onClick={() => void rescan()}
                aria-label="Scan storage again"
              >
                {scanning ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <RefreshCwIcon className="size-4" />
                )}
              </DashboardToolbarButton>
            </TooltipTrigger>
            <TooltipContent>Scan storage again</TooltipContent>
          </Tooltip>
        </>
      ) : null}
      <DashboardToolbarSearch
        name="media-search"
        aria-label="Search media"
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
          {owners.map((owner) => (
            <SelectItem key={owner.userId} value={owner.userId}>
              {owner.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={typeFilter}
        onValueChange={(value) => handleTypeChange(value as MediaViewFilter)}
      >
        {/* Wide enough for its longest choice, so picking one does not resize
            the trigger and slide the controls beside it. */}
        <DashboardToolbarSelectTrigger
          aria-label="Media type filter"
          className="min-w-40"
        >
          <SelectValue />
        </DashboardToolbarSelectTrigger>
        <SelectContent>
          <SelectItem value="all">All types</SelectItem>
          <SelectItem value="image">Images</SelectItem>
          <SelectItem value="video">Videos</SelectItem>
          <SelectItem value="svg">SVG</SelectItem>
          <SelectItem value="orphaned">Orphaned files</SelectItem>
          <SelectItem value="orphaned-unlinked">No record in DB</SelectItem>
          <SelectItem value="orphaned-missing">Missing in storage</SelectItem>
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
      {/* Stays put while the orphans are showing. The toolbar is anchored to
          the right, so taking a button out of it would slide everything left
          of it across; the orphan-only controls are added on the far left
          instead, where they push nothing. */}
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

  const mediaFooter = {
    type: "pagination",
    page,
    pageSize,
    total: data.media.total,
    totalPages: data.media.total_pages,
    onPageChange: setPage,
    onPageSizeChange: (size: number) => {
      setPageSize(size)
      setPage(1)
    },
  } as const

  const footer = showOrphans ? orphanPage.footer : mediaFooter

  // The scan's own numbers are real even when part of the bucket went unread,
  // so a partial scan is a warning above the rows rather than an empty table.
  const orphanTableError = orphanError
    ? { message: orphanError, onRetry: () => void rescan() }
    : orphanData?.scanError
      ? {
          message: getAdminMediaErrorMessage(orphanData.scanError),
          onRetry: () => void rescan(),
        }
      : orphanData?.truncated
        ? {
            message: `Storage holds more files than one scan reads, so only the first ${orphanData.scannedObjects.toLocaleString()} were checked. Records whose file is missing were skipped this time.`,
            onRetry: () => void rescan(),
          }
        : null

  const tableError = showOrphans
    ? orphanTableError
    : error
      ? { message: error, onRetry: () => void refresh() }
      : null

  const emptyText = showOrphans
    ? scanning
      ? "Checking every file in storage…"
      : orphanData?.scanError
        ? "Storage could not be read, so orphans are unknown."
        : isFiltered
          ? "No orphans match those filters."
          : "Nothing orphaned. Every file has a record and every record has a file."
    : isFiltered
      ? "No files match those filters."
      : "No media has been uploaded yet."

  const title = showOrphans ? "Orphaned files" : "All media"
  const icon = showOrphans ? (
    <UnlinkIcon className="text-muted-foreground" />
  ) : (
    <ImageIcon className="text-muted-foreground" />
  )
  const count = showOrphans ? sortedOrphans.length : data.media.total
  const rowsOnScreen = showOrphans ? visibleOrphans.length : media.length

  return (
    <>
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
          title={title}
          icon={icon}
          count={count}
          error={tableError}
          selectedCount={selectedCount}
          onClearSelection={selection.clear}
          controls={mediaControls}
          content={
            <div className="px-5 pb-5">
              {rowsOnScreen === 0 ? (
                <div className="grid h-72 place-items-center text-center text-sm text-muted-foreground">
                  <div>
                    {showOrphans ? (
                      <UnlinkIcon className="mx-auto mb-3 size-10" />
                    ) : (
                      <ImageIcon className="mx-auto mb-3 size-10" />
                    )}
                    <p>{emptyText}</p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8">
                  {showOrphans
                    ? visibleOrphans.map((row) => (
                        <OrphanGalleryItem
                          key={orphanKey(row)}
                          row={row}
                          selected={selectedIds.has(orphanKey(row))}
                          onToggle={() => selection.toggle(orphanKey(row))}
                          onOpen={() => setOpenRecord("orphan", orphanKey(row))}
                          onDelete={() => {
                            setDeletingAll(false)
                            setConfirmKeys([orphanKey(row)])
                          }}
                        />
                      ))
                    : media.map((item) => (
                        <GalleryItem
                          key={item.id}
                          item={item}
                          selected={selectedIds.has(item.id)}
                          onOpen={() => setOpenRecord("media", item.id)}
                          onDelete={() => setDeleteIds([item.id])}
                          onToggle={() => selection.toggle(item.id)}
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
          title={title}
          icon={icon}
          count={count}
          error={tableError}
          selectedCount={selectedCount}
          onClearSelection={selection.clear}
          controls={mediaControls}
          header={
            showOrphans ? (
              <SortableTableHeader
                columns={orphanSortableColumns}
                sort={orphanSort}
                direction={orphanDirection}
                onSort={toggleOrphanSort}
                withAriaSort
                leading={
                  <TableHead column="select">
                    <Checkbox
                      checked={selection.selectAllState(visibleOrphanKeys)}
                      onCheckedChange={() =>
                        selection.toggleVisible(visibleOrphanKeys)
                      }
                      disabled={visibleOrphans.length === 0}
                      aria-label="Select visible orphans"
                    />
                  </TableHead>
                }
                trailing={<TableHead column="meta">Actions</TableHead>}
              />
            ) : (
              <SortableTableHeader
                columns={sortableColumns}
                sort={sort}
                direction={direction}
                onSort={toggleSort}
                withAriaSort
                leading={
                  <TableHead column="select">
                    <Checkbox
                      checked={selection.selectAllState(visibleIds)}
                      onCheckedChange={() => selection.toggleVisible(visibleIds)}
                      disabled={media.length === 0}
                      aria-label="Select visible media"
                    />
                  </TableHead>
                }
                trailing={<TableHead column="meta">Actions</TableHead>}
              />
            )
          }
          isEmpty={rowsOnScreen === 0}
          emptyText={emptyText}
          emptyColSpan={7}
          footer={footer}
        >
          {showOrphans
            ? visibleOrphans.map((row) => (
                <OrphanTableRow
                  key={orphanKey(row)}
                  row={row}
                  selected={selectedIds.has(orphanKey(row))}
                  onToggle={() => selection.toggle(orphanKey(row))}
                  onOpen={() => setOpenRecord("orphan", orphanKey(row))}
                  onDelete={() => {
                    setDeletingAll(false)
                    setConfirmKeys([orphanKey(row)])
                  }}
                />
              ))
            : media.map((item) => (
                <MediaTableRow
                  key={item.id}
                  item={item}
                  selected={selectedIds.has(item.id)}
                  onToggle={() => selection.toggle(item.id)}
                  onOpen={() => setOpenRecord("media", item.id)}
                  onDelete={() => setDeleteIds([item.id])}
                />
              ))}
        </DashboardTable>
      )}

      {/* The details window steps aside while a confirmation is up — two
          windows on top of each other means two focus traps and an Escape that
          only closes the top one. It is hidden rather than thrown away, so
          cancelling brings it back exactly as it was, typed alt text and all. */}
      <MediaDetailsDialog
        key={openMedia?.id ?? "closed"}
        open={Boolean(openMedia) && !deleteIds}
        item={openMedia}
        editable={openMedia?.owner_id === currentUserId}
        onClose={() => setOpenRecord("media", undefined)}
        onDelete={() => {
          if (openMedia) setDeleteIds([openMedia.id])
        }}
        onSaved={async () => {
          setOpenRecord("media", undefined)
          await refresh()
        }}
      />

      <ConfirmDialog
        open={Boolean(deleteIds)}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteIds(null)
        }}
        title={`Delete ${closingDeleteCount} ${closingDeleteCount === 1 ? "file" : "files"}?`}
        description="The file is erased from storage and removed from its owner's library. This cannot be undone."
        confirmLabel={closingDeleteCount === 1 ? "Delete file" : "Delete files"}
        loading={deleting}
        onConfirm={() => void handleConfirmDelete()}
      />

      <OrphanDetailsDialog
        open={Boolean(openOrphan) && !confirmKeys}
        orphan={openOrphan}
        onClose={() => setOpenRecord("orphan", undefined)}
        onDelete={() => {
          setDeletingAll(false)
          if (openOrphan) setConfirmKeys([orphanKey(openOrphan)])
        }}
      />

      <ConfirmDialog
        open={Boolean(confirmKeys)}
        onOpenChange={(open) => {
          if (!open && !cleaning) {
            setConfirmKeys(null)
            setDeletingAll(false)
          }
        }}
        title={`${deletingAll ? "Delete all" : "Delete"} ${closingCleanCount} ${
          closingCleanCount === 1 ? "orphan" : "orphans"
        }?`}
        // "Delete all" clears what is on screen, so a filtered list says so
        // rather than letting the word "all" imply the whole bucket.
        description={`${
          deletingAll && isFiltered
            ? "This clears every orphan matching the current filters, not the whole list. "
            : ""
        }Files with no record in the database are erased from storage, and records whose file is missing are removed from the database. This cannot be undone.`}
        confirmLabel={
          deletingAll
            ? `Delete all ${closingCleanCount === 1 ? "orphan" : "orphans"}`
            : "Delete orphans"
        }
        loading={cleaning}
        onConfirm={() => void handleClean()}
      />
    </>
  )
}

/**
 * Alt text is saved through the owner-scoped endpoint, so it is editable only
 * on your own files. Someone else's file opens read-only, with delete.
 */
function MediaDetailsDialog({
  open,
  item,
  editable,
  onClose,
  onDelete,
  onSaved,
}: {
  open: boolean
  item: AdminMediaItem | null
  editable: boolean
  onClose: () => void
  onDelete: () => void
  onSaved: () => Promise<void>
}) {
  const [altText, setAltText] = React.useState(item?.alt_text ?? "")
  const [run, saving] = useAsyncAction(getMediaErrorMessage)
  // Somebody else's file has nothing to edit, so it always closes instantly.
  const dirty = editable && altText !== (item?.alt_text ?? "")

  async function handleSave() {
    if (!item) return

    await run(async () => {
      await updateMedia(item.id, altText)
      await onSaved()
    }, "Media updated.")
  }

  return (
    <FormDialog open={open} dirty={dirty} busy={saving} onClose={onClose}>
      {(requestClose) => (
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
          {/* Someone else's file opens read-only, so it ends with a single Done
              — there would be nothing for a Cancel to undo. */}
          <DialogFooter>
            <Button
              type="button"
              variant="destructive"
              className="mr-auto"
              disabled={saving}
              onClick={onDelete}
            >
              Delete
            </Button>
            {editable ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  disabled={saving}
                  onClick={requestClose}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleSave()}
                >
                  {saving ? <Loader2Icon className="size-4 animate-spin" /> : null}
                  Save changes
                </Button>
              </>
            ) : (
              <Button type="button" onClick={requestClose}>
                Done
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      )}
    </FormDialog>
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
    <TableRow
      className="group"
      data-state={selected ? "selected" : undefined}
      rowAction={onOpen}
    >
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
      <TableCell column="actions">
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
