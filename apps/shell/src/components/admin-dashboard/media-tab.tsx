import * as React from "react"
import { toast } from "sonner"
import { GridIcon, ListIcon, Loader2Icon, RefreshCwIcon, Trash2Icon, UploadIcon } from "lucide-react"

import type { AdminFrame } from "@/components/admin-dashboard/admin-dashboard"
import { FilterRow } from "@/components/admin-dashboard/list-parts"
import { MediaFilePanel, OrphanPanel } from "@/components/admin-dashboard/media-file-panel"
import { CrmListHeader } from "@/components/crm/crm-row"
import { Chip, CrmTable, CrmTableRow, OpenBar } from "@/components/crm/crm-table"
import { OrphanPreview } from "@/components/media/media-orphan-rows"
import { MediaThumbnail } from "@/components/media/media-thumbnail"
import { DashboardTablePagination } from "@/components/shared/dashboard-table"
import {
  DashboardToolbarButton,
  dashboardToolbarButtonActiveClassName,
  dashboardToolbarButtonGroupClassName,
  dashboardToolbarButtonGroupItemClassName,
} from "@/components/shared/dashboard-toolbar"
import { FilterPopover } from "@/components/shared/filter-popover"
import { SelectedMenu, SelectedMenuRow } from "@/components/shared/mass-select"
import type { TableHeaderColumn } from "@/components/shared/sortable-table-header"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TableCell } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { AdminMediaSearch, AdminSearch } from "@/lib/admin-dashboard/admin-search"
import {
  cleanOrphanedMedia,
  deleteMediaAsAdminAction,
  getAdminMediaErrorMessage,
  loadAdminMediaItem,
  loadAdminMediaPage,
  loadOrphans,
  type AdminMediaItem,
  type AdminMediaListResponse,
  type AdminMediaSort,
  type AdminMediaTypeFilter,
  type MediaOrphan,
  type MediaOwner,
  type MediaStorageUsed,
  type OrphanDashboard,
} from "@/lib/api/media/admin-media"
import { getMediaErrorMessage } from "@/lib/api/media/media"
import { describeBulkResult } from "@/lib/format/bulk-result"
import { formatFileSize } from "@/lib/format/format-bytes"
import { formatDate } from "@/lib/format/format-time"
import { plural } from "@/lib/format/plural"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useClearSelectionOnListChange } from "@/lib/hooks/use-clear-selection"
import { useClientPage } from "@/lib/hooks/use-client-page"
import { useLastValue } from "@/lib/hooks/use-last-value"
import { useSelection } from "@/lib/hooks/use-selection"
import { useTableSort } from "@/lib/hooks/use-table-sort"
import { compareOrphans, orphanKey, problemLabel, type OrphanSort } from "@/lib/media/media-orphans"
import { getMediaUploadError, mediaAccept } from "@/lib/media/media-upload"
import { isUploadCancelled } from "@/lib/media/upload-in-parts"
import { queueUpload } from "@/lib/media/upload-queue"
import { useListSearchNavigate, useOpenRecord } from "@/lib/nav/list-search"
import { MEDIA_VIEW_STORAGE_KEY, useRememberedChoice } from "@/lib/remembered-choice"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

type ViewMode = "list" | "gallery"

const viewModes: readonly ViewMode[] = ["list", "gallery"]

/**
 * The type filter doubles as the way into the orphans: the files and records
 * that have fallen out of step with each other. They are media here too, just
 * the broken kind, so they are more choices in the same filter rather than a
 * list of their own.
 */
type MediaViewFilter = AdminMediaTypeFilter | "orphaned" | "orphaned-unlinked" | "orphaned-missing"

const TYPE_LABELS: Record<MediaViewFilter, string> = {
  all: "All types",
  image: "Images",
  video: "Videos",
  audio: "Audio",
  svg: "SVG",
  orphaned: "Orphaned files",
  "orphaned-unlinked": "No record in DB",
  "orphaned-missing": "Missing in storage",
}

const TYPE_CHOICES: MediaViewFilter[] = ["all", "image", "video", "svg", "orphaned", "orphaned-unlinked", "orphaned-missing"]

/** Which orphans a filter asks for, or null when it is not asking for orphans. */
function orphanKindOf(filter: MediaViewFilter): "all" | MediaOrphan["kind"] | null {
  if (filter === "orphaned") return "all"
  if (filter === "orphaned-unlinked") return "unlinked_object"
  if (filter === "orphaned-missing") return "missing_file"
  return null
}

/** Matches the per-request cap on the clean-up server function. */
const CLEAN_BATCH_SIZE = 500

/** How long the list waits after a change before it asks again. */
const REFETCH_DELAY_MS = 250

/** What the route's loader read for the Media library: the first page. */
export type MediaLoaded = {
  media: AdminMediaListResponse
  owners: MediaOwner[]
  /** What the files take up in the bucket, for the owner picked. */
  storage: MediaStorageUsed
  /** The configured rows-per-page the loader's first page was fetched at. */
  pageSize: number
}

// Columns drop out as the middle narrows, measured on the middle panel, as
// Users' do.
const mediaColumns: TableHeaderColumn<AdminMediaSort>[] = [
  { key: "file", label: "File", column: "main", className: "min-w-40" },
  { key: "owner", label: "Owner", column: "preview", className: "hidden md:hidden @2xl:table-cell" },
  { key: "type", label: "Type", column: "preview" },
  { key: "size", label: "Size", column: "meta", className: "hidden md:hidden @3xl:table-cell" },
  { key: "created", label: "Added", column: "meta" },
]

const orphanColumns: TableHeaderColumn<OrphanSort>[] = [
  { key: "file", label: "File", column: "main", className: "min-w-40" },
  { key: "problem", label: "Problem", column: "preview" },
  { key: "owner", label: "Owner", column: "preview", className: "hidden md:hidden @3xl:table-cell" },
  { key: "size", label: "Size", column: "meta" },
  { key: "created", label: "Uploaded", column: "meta", className: "hidden md:hidden @2xl:table-cell" },
]

/** Date and size read as numbers, so they start newest- and biggest-first. */
const mediaSortDirection = (column: AdminMediaSort) => (column === "created" || column === "size" ? "desc" : "asc")
const orphanSortDirection = (column: OrphanSort) => (column === "size" || column === "created" ? "desc" : "asc")

type UploadState = { done: number; total: number }

/**
 * One toast for the whole pick, whatever happened: a plain success, a plain
 * note after Cancel, or the red one naming the files that did not make it.
 * The success wording names where the files went, because this lists
 * everyone's files but uploads only ever land in the signed-in admin's own
 * library.
 */
function showUploadSummary(
  done: number,
  picked: number,
  failures: { name: string; reason: string }[],
  cancelled: boolean
) {
  if (cancelled) {
    toast(
      done
        ? `Upload cancelled. ${done} ${plural(done, "file was", "files were")} uploaded before it stopped.`
        : "Upload cancelled. Nothing was added to your library."
    )
    return
  }
  if (!failures.length) {
    toast.success(done === 1 ? "Uploaded to your library." : `${done} files uploaded to your library.`)
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
    failures.length > shown.length ? `${shown.join(", ")} and ${failures.length - shown.length} more` : shown.join(", ")
  // The same reason usually explains every skipped file, so say it once.
  const reasons = Array.from(new Set(failures.map((failure) => failure.reason)))
  showErrorToast(`${done} uploaded, ${failures.length} failed: ${names}. ${reasons.join(" ")}`)
}

/**
 * The Admin dashboard's Media library (Tyler, 8 Nov 2026: "we add media
 * library to it too", and a file opens "on the right, like a person in
 * Users"). It is every account's files in the same one header, table and
 * right-panel shape as Users:
 *
 * - **Header:** "N selected" while files are ticked (Delete), Filter (Type,
 *   including the orphans, and Owner), List or Gallery, Upload, and the ⋮
 *   with Search and Mass select. While the orphans show, the ⋮ also has Scan
 *   storage again and Delete all.
 * - **Middle:** the files as a table or a gallery, edge to edge.
 * - **Right:** the file open (`MediaFilePanel`), or the orphan open. With
 *   nothing open, the first row shows.
 *
 * Whose files show (`?owner=`) and the file open (`?open=`, or `?orphan=`)
 * are in the address, so the person panel's "Open their files" and older
 * links land on the same list. Search, type, sort and page stay here.
 * Uploads land in the signed-in admin's own library, and Upload's tooltip
 * and the toast say so.
 */
export function MediaTab({
  loaded,
  search,
  currentUserId,
  heading,
  headingEnd,
  frame,
}: {
  loaded: MediaLoaded
  search: AdminSearch
  currentUserId: string
  heading: React.ReactNode
  /** Last in the header: the button that reopens the right panel. */
  headingEnd: React.ReactNode
  frame: AdminFrame
}) {
  const address = search as AdminMediaSearch
  const setListSearch = useListSearchNavigate()
  const setOpen = useOpenRecord()
  const ownerId = address.owner ?? "all"

  const [data, setData] = React.useState(loaded)
  const [error, setError] = React.useState<string | null>(null)
  const [refreshCount, setRefreshCount] = React.useState(0)
  const [text, setText] = React.useState("")
  // An orphan in the address shows with the orphans listed.
  const [typeFilter, setTypeFilter] = React.useState<MediaViewFilter>(address.orphan ? "orphaned" : "all")
  // The media list holds on to the last real file type while the orphans are
  // showing, so coming back to it does not read a page that is already there.
  const [mediaType, setMediaType] = React.useState<AdminMediaTypeFilter>("all")
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(loaded.pageSize)
  // List or gallery is a habit, not a per-visit decision.
  const [viewMode, setViewMode] = useRememberedChoice(MEDIA_VIEW_STORAGE_KEY, "gallery", viewModes)
  const { sort, direction, toggleSort: sortBy } = useTableSort<AdminMediaSort>("created", "desc", mediaSortDirection)
  const [upload, setUpload] = React.useState<UploadState | null>(null)
  const uploadStopRef = React.useRef<AbortController | null>(null)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  const [massSelect, setMassSelect] = React.useState(false)
  const selection = useSelection()
  const selectedIds = selection.selected
  const [deleteIds, setDeleteIds] = React.useState<string[] | null>(null)
  // Still on screen while it fades out, after the ticks were cleared, so it
  // keeps counting what it opened with.
  const closingDeleteCount = useLastValue(deleteIds)?.length ?? 0
  const [runDelete, deleting] = useAsyncAction(getAdminMediaErrorMessage)
  // Goes up after every change, so the file open is read again too.
  const [refreshes, setRefreshes] = React.useState(0)

  const problem = orphanKindOf(typeFilter)
  const showOrphans = problem !== null

  // Finding orphans means reading the whole bucket, so the scan runs the first
  // time the filter asks for it and the result is kept until it is run again.
  const [orphanData, setOrphanData] = React.useState<OrphanDashboard | null>(null)
  const [rescanning, setRescanning] = React.useState(false)
  const [orphanError, setOrphanError] = React.useState<string | null>(null)
  const scanning = rescanning || (showOrphans && !orphanData && !orphanError)
  const { sort: orphanSort, direction: orphanDirection, toggleSort: toggleOrphanSort } = useTableSort<OrphanSort>(
    "size",
    "desc",
    orphanSortDirection
  )
  const [confirmKeys, setConfirmKeys] = React.useState<string[] | null>(null)
  const closingCleanCount = useLastValue(confirmKeys)?.length ?? 0
  const [deletingAll, setDeletingAll] = React.useState(false)
  const [runClean, cleaning] = useAsyncAction(getAdminMediaErrorMessage)

  const query = React.useMemo(
    () => ({ search: text, ownerId, fileType: mediaType, page, pageSize, sort, direction }),
    [direction, mediaType, ownerId, page, pageSize, text, sort]
  )
  const listKey = JSON.stringify(query)
  // Which list the rows shown were read for. While it differs, the first row
  // is not yet the list's first row.
  const [shownKey, setShownKey] = React.useState(listKey)
  const latestRequest = React.useRef(0)

  const refresh = React.useCallback(async () => {
    const request = ++latestRequest.current
    setRefreshCount((count) => count + 1)
    try {
      const next = await loadAdminMediaPage(query)
      if (request !== latestRequest.current) return
      setData(next)
      setError(null)
      // Deleting someone's last file drops them from the owner list. Left
      // alone, the filter would sit on a name that no longer has a label.
      if (query.ownerId !== "all" && !next.owners.some((owner) => owner.userId === query.ownerId)) {
        setListSearch({ owner: undefined })
        setPage(1)
      }
    } catch (loadError) {
      if (request === latestRequest.current) setError(getAdminMediaErrorMessage(loadError))
    } finally {
      setRefreshCount((count) => Math.max(0, count - 1))
      if (request === latestRequest.current) setShownKey(JSON.stringify(query))
    }
  }, [query, setListSearch])

  // One scan at a time: a second press while one runs does nothing, so an
  // older scan never lands over a newer one.
  const scanRunning = React.useRef(false)
  const rescan = React.useCallback(async () => {
    if (scanRunning.current) return
    scanRunning.current = true
    setRescanning(true)
    try {
      setOrphanData(await loadOrphans())
      setOrphanError(null)
    } catch (scanError) {
      setOrphanError(getAdminMediaErrorMessage(scanError))
    } finally {
      scanRunning.current = false
      setRescanning(false)
    }
  }, [])

  // An orphan in the address lists the orphans, so they are read straight
  // away. Otherwise the scan starts from the Type pick (`pickType`).
  const orphanInAddress = address.orphan
  React.useEffect(() => {
    if (!orphanInAddress || orphanData) return
    let active = true
    void loadOrphans()
      .then((next) => {
        if (!active) return
        setOrphanData(next)
        setOrphanError(null)
      })
      .catch((scanError) => {
        if (active) setOrphanError(getAdminMediaErrorMessage(scanError))
      })
    return () => {
      active = false
    }
  }, [orphanInAddress, orphanData])

  // A queue of uploads runs for minutes, and the filters stay live the whole
  // time. Reading through a ref means the read at the end asks for whatever
  // is on screen then, not the filters set when the pick started.
  const refreshRef = React.useRef(refresh)
  React.useEffect(() => {
    refreshRef.current = refresh
  }, [refresh])

  // The route already read the first page. Anything else reads again.
  const loadedKey = React.useRef(
    JSON.stringify({
      search: "",
      ownerId,
      fileType: "all",
      page: 1,
      pageSize: loaded.pageSize,
      sort: "created",
      direction: "desc",
    })
  )
  React.useEffect(() => {
    // Typing while the orphans show filters those; the media list catches up
    // when the filter comes back to it.
    if (showOrphans) return
    if (listKey === loadedKey.current) return
    loadedKey.current = ""
    const timer = setTimeout(() => void refresh(), REFETCH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [listKey, refresh, showOrphans])

  // Files are ticked by id and orphans by a key of their own, so moving
  // between the two starts the ticks over.
  useClearSelectionOnListChange(selection.setSelected, `${typeFilter}|${listKey}`)

  const media = data.media.media

  const matchingOrphans = React.useMemo(() => {
    if (!orphanData) return []
    const words = text.trim().toLowerCase()
    return orphanData.orphans.filter((row) => {
      if (problem !== "all" && row.kind !== problem) return false
      if (ownerId !== "all" && row.ownerId !== ownerId) return false
      if (!words) return true
      return `${row.name} ${row.storagePath} ${row.ownerName ?? ""}`.toLowerCase().includes(words)
    })
  }, [orphanData, ownerId, problem, text])

  const sortedOrphans = React.useMemo(() => {
    const factor = orphanDirection === "asc" ? 1 : -1
    return [...matchingOrphans].sort((a, b) => factor * compareOrphans(a, b, orphanSort))
  }, [matchingOrphans, orphanDirection, orphanSort])

  // The whole orphan list arrives in one go, so its pages are cut here.
  const orphanPage = useClientPage(
    sortedOrphans,
    loaded.pageSize,
    `${text}|${ownerId}|${problem}|${orphanSort}|${orphanDirection}`
  )
  const visibleOrphans = orphanPage.visible

  // The file open: on this page, or read on its own when a link opened one
  // that is not.
  const openMediaId = showOrphans ? undefined : (address.open ?? media[0]?.id)
  const openOnPage = media.find((item) => item.id === openMediaId) ?? null
  const [readMedia, setReadMedia] = React.useState<{ id: string; item: AdminMediaItem | null } | null>(null)
  React.useEffect(() => {
    if (!openMediaId || openOnPage || readMedia?.id === openMediaId) return
    let active = true
    void loadAdminMediaItem(openMediaId)
      .then((item) => active && setReadMedia({ id: openMediaId, item }))
      .catch(() => active && setReadMedia({ id: openMediaId, item: null }))
    return () => {
      active = false
    }
  }, [openMediaId, openOnPage, readMedia?.id])
  const openMedia = openOnPage ?? (readMedia && readMedia.id === openMediaId ? readMedia.item : null)

  // The orphan open, if the filters still list it, or the first one listed,
  // so the panel never shows one the list does not.
  const openOrphan = showOrphans
    ? (sortedOrphans.find((row) => orphanKey(row) === address.orphan) ?? visibleOrphans[0] ?? null)
    : null

  const toggleMassSelect = () => {
    if (massSelect) selection.clear()
    setMassSelect(!massSelect)
  }

  function pickType(value: MediaViewFilter) {
    setPage(1)
    setTypeFilter(value)
    if (orphanKindOf(value) === null) {
      setMediaType(value as AdminMediaTypeFilter)
      setListSearch({ orphan: undefined })
      return
    }
    // A file open is not an orphan: the orphans open their own, the first.
    setListSearch({ open: undefined })
    // Reading the whole bucket happens once, the first time orphans are
    // asked for, and again only from Scan storage again.
    if (!orphanData && !scanning) void rescan()
  }

  function toggleSort(by: AdminMediaSort) {
    sortBy(by)
    setPage(1)
  }

  /**
   * One pick can be many files. They go up one at a time, so a failure part
   * way through leaves the files before it saved and keeps going. Cancel
   * stops the video going up now and skips the rest. The files go through
   * the app-wide upload list, so the batch carries on after somebody leaves.
   */
  async function handleUploadSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.target
    const files = Array.from(input.files ?? [])
    // Cleared straight away so picking the same files again still fires a change.
    input.value = ""
    if (!files.length) return

    dismissErrorToast()
    const stop = new AbortController()
    uploadStopRef.current = stop
    setUpload({ done: 0, total: files.length })

    let done = 0
    let cancelledMidway = false
    const failures: { name: string; reason: string }[] = []
    for (const file of files) {
      if (stop.signal.aborted) break
      const invalid = getMediaUploadError(file, true)
      if (invalid) {
        failures.push({ name: file.name, reason: invalid })
        continue
      }
      try {
        await queueUpload(file, { signal: stop.signal })
        done += 1
        setUpload({ done, total: files.length })
      } catch (uploadError) {
        if (isUploadCancelled(uploadError)) {
          cancelledMidway = true
          break
        }
        failures.push({ name: file.name, reason: getMediaErrorMessage(uploadError) })
        setUpload({ done, total: files.length })
      }
    }

    uploadStopRef.current = null
    setUpload(null)
    if (done) await refreshRef.current()
    // A cancel pressed on the upload line, not here, still ends the batch.
    showUploadSummary(done, files.length, failures, stop.signal.aborted || cancelledMidway)
  }

  async function handleConfirmDelete() {
    if (!deleteIds?.length) return
    const ids = deleteIds
    await runDelete(async () => {
      const result = await deleteMediaAsAdminAction(ids)
      const summary = describeBulkResult({
        done: result.deletedCount,
        kept: ids.length - result.deletedCount,
        one: "file",
        many: "files",
        verb: "deleted",
      })
      if (result.protectedCount) {
        toast.warning(
          `${summary} ${result.protectedCount} ${plural(result.protectedCount, "file was", "files were")} kept because ${plural(result.protectedCount, "it appears", "they appear")} in email already sent.`
        )
      } else {
        toast.success(summary)
      }
      selection.setSelected((current) => {
        const next = new Set(current)
        ids.forEach((id) => next.delete(id))
        return next
      })
      setDeleteIds(null)
      // The panel falls back to the first row when the file open went.
      if (address.open && ids.includes(address.open)) setListSearch({ open: undefined })
      await refresh()
      setRefreshes((count) => count + 1)
    })
  }

  async function handleClean() {
    if (!confirmKeys?.length || !orphanData) return
    const keys = new Set(confirmKeys)
    const picked = orphanData.orphans.filter((row) => keys.has(orphanKey(row)))
    await runClean(async () => {
      // Each request checks again against a fresh scan, so a "delete all" over
      // a big bucket goes in batches rather than one oversized call.
      let deleted = 0
      for (let start = 0; start < picked.length; start += CLEAN_BATCH_SIZE) {
        const batch = picked.slice(start, start + CLEAN_BATCH_SIZE)
        const result = await cleanOrphanedMedia({
          mediaIds: batch
            .filter((row) => row.kind === "missing_file" && row.mediaId)
            .map((row) => row.mediaId as string),
          storagePaths: batch.filter((row) => row.kind === "unlinked_object").map((row) => row.storagePath),
        })
        deleted += result.deletedCount
      }
      toast.success(
        describeBulkResult({ done: deleted, kept: picked.length - deleted, one: "orphan", many: "orphans", verb: "deleted" })
      )
      selection.setSelected((current) => {
        const next = new Set(current)
        keys.forEach((key) => next.delete(key))
        return next
      })
      setConfirmKeys(null)
      setDeletingAll(false)
      setListSearch({ orphan: undefined })
      // A cleaned-up record was media a moment ago, so the list behind the
      // filter is stale too.
      await Promise.all([rescan(), refresh()])
    })
  }

  const isFiltered = Boolean(text.trim()) || ownerId !== "all" || (showOrphans ? problem !== "all" : typeFilter !== "all")
  const filterCount = (ownerId === "all" ? 0 : 1) + (typeFilter === "all" ? 0 : 1)

  // Somebody can hold orphans without any live media, so while the orphans
  // show, the owner filter offers both lists.
  const owners = React.useMemo(() => {
    if (!showOrphans || !orphanData) return data.owners
    const merged = new Map(data.owners.map((owner) => [owner.userId, owner]))
    orphanData.owners.forEach((owner) => merged.set(owner.userId, owner))
    return Array.from(merged.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [data.owners, orphanData, showOrphans])

  // Filtering to someone else's files is when an upload is most likely to
  // surprise, so the button says so there.
  const filteredOwnerName =
    ownerId !== "all" && ownerId !== currentUserId
      ? data.owners.find((owner) => owner.userId === ownerId)?.name
      : undefined
  const uploadHint = filteredOwnerName
    ? `New files are added to your own library. Filtering by ${filteredOwnerName} does not change that.`
    : "New files are added to your own library."

  const clearFilters = () => {
    setText("")
    pickType("all")
    setListSearch({ owner: undefined, orphan: undefined })
  }

  // The scan's numbers are real even when part of the bucket went unread, so
  // a partial scan is a warning above the rows rather than an empty list.
  const orphanProblem = orphanError
    ? orphanError
    : orphanData?.scanError
      ? getAdminMediaErrorMessage(orphanData.scanError)
      : orphanData?.truncated
        ? `Storage holds more files than one scan reads, so only the first ${orphanData.scannedObjects.toLocaleString()} were checked. Records whose file is missing were skipped this time.`
        : null
  const listProblem = showOrphans ? orphanProblem : error

  const rowsOnScreen = showOrphans ? visibleOrphans.length : media.length
  const empty =
    rowsOnScreen > 0 ? null : showOrphans && scanning ? (
      "Checking every file in storage…"
    ) : isFiltered ? (
      <span className="grid justify-items-center gap-2">
        {showOrphans ? "No orphans match those filters." : "No files match those filters."}
        <Button type="button" variant="outline" size="sm" onClick={clearFilters}>
          Clear filters
        </Button>
      </span>
    ) : showOrphans ? (
      "Nothing orphaned. Every file has a record and every record has a file."
    ) : (
      "No media has been uploaded yet."
    )

  const tickedCount = selectedIds.size
  const askDeleteTicked = () => {
    if (showOrphans) {
      setDeletingAll(false)
      setConfirmKeys(Array.from(selectedIds))
    } else {
      setDeleteIds(Array.from(selectedIds))
    }
  }

  const header = (
    <CrmListHeader
      tabs={heading}
      end={headingEnd}
      selected={
        massSelect && tickedCount ? (
          <SelectedMenu
            count={tickedCount}
            busy={deleting || cleaning}
            onClear={selection.clear}
            pages={{}}
            main={(menu) => (
              <SelectedMenuRow
                className="text-destructive"
                onClick={() => {
                  menu.close()
                  askDeleteTicked()
                }}
              >
                <Trash2Icon className="size-4" />
                Delete
              </SelectedMenuRow>
            )}
          />
        ) : null
      }
      filter={
        <>
          <FilterPopover
            // Narrow: a label and a select a row (Tyler, 8 Nov 2026: "filter dropdown is too wide").
            contentClassName="w-60" count={filterCount} onClear={clearFilters} save={null}>
            <FilterRow id="admin-media-type" label="Type">
              <Select value={typeFilter} onValueChange={(value) => pickType(value as MediaViewFilter)}>
                <SelectTrigger id="admin-media-type" className="h-8 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPE_CHOICES.map((choice) => (
                    <SelectItem key={choice} value={choice}>
                      {TYPE_LABELS[choice]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterRow>
            <FilterRow id="admin-media-owner" label="Owner">
              <Select
                value={ownerId}
                onValueChange={(value) => {
                  setPage(1)
                  setListSearch({ owner: value === "all" ? undefined : value, open: undefined, orphan: undefined })
                }}
              >
                <SelectTrigger id="admin-media-owner" className="h-8 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All owners</SelectItem>
                  {owners.map((owner) => (
                    <SelectItem key={owner.userId} value={owner.userId}>
                      {owner.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterRow>
          </FilterPopover>
        </>
      }
      view={
        // One control with the header's own light grey line round it, the
        // one showing solid (Tyler, 9 Nov 2026: "fix this ui", after the
        // header's buttons took the outline look and lost the picked one).
        <div className={cn(dashboardToolbarButtonGroupClassName, "border-zinc-200/60 bg-background dark:border-zinc-700/60")}>
          {viewModes.map((mode) => (
            <DashboardToolbarButton
              key={mode}
              type="button"
              variant={viewMode === mode ? "default" : "ghost"}
              className={cn(
                dashboardToolbarButtonGroupItemClassName,
                viewMode === mode && dashboardToolbarButtonActiveClassName
              )}
              onClick={() => setViewMode(mode)}
              aria-label={mode === "list" ? "List view" : "Gallery view"}
              aria-pressed={viewMode === mode}
            >
              {mode === "list" ? <ListIcon className="size-4" /> : <GridIcon className="size-4" />}
            </DashboardToolbarButton>
          ))}
        </div>
      }
      primary={
        <>
          {/* A batch's count and its Cancel. One file has only its upload line. */}
          {upload && upload.total > 1 ? (
            <>
              <span className="max-w-40 truncate text-sm text-muted-foreground tabular-nums" role="status">
                {upload.done} of {upload.total} uploaded
              </span>
              <DashboardToolbarButton type="button" variant="ghost" onClick={() => uploadStopRef.current?.abort()}>
                Cancel
              </DashboardToolbarButton>
            </>
          ) : null}
          <Tooltip>
            <TooltipTrigger asChild>
              <DashboardToolbarButton
                type="button"
                aria-label="Upload media"
                disabled={Boolean(upload)}
                onClick={() => fileInputRef.current?.click()}
              >
                {upload ? <Loader2Icon className="size-4 animate-spin" /> : <UploadIcon className="size-4" />}
                <span className="@max-3xl:sr-only">Upload</span>
              </DashboardToolbarButton>
            </TooltipTrigger>
            <TooltipContent>{uploadHint}</TooltipContent>
          </Tooltip>
        </>
      }
      menuLabel="More for media"
      search={{
        name: "media-search",
        label: "Search media",
        placeholder: "Search files or people",
        value: text,
        onChange: (next) => {
          setPage(1)
          setText(next)
        },
      }}
      massSelect={{ on: massSelect, onToggle: toggleMassSelect }}
      menuItems={
        showOrphans
          ? [
              {
                label: "Scan storage again",
                icon: scanning ? <Loader2Icon className="size-4 animate-spin" /> : <RefreshCwIcon className="size-4" />,
                onClick: () => void rescan(),
              },
              ...(sortedOrphans.length
                ? [
                    {
                      label: `Delete all (${sortedOrphans.length})`,
                      icon: <Trash2Icon className="size-4" />,
                      onClick: () => {
                        setDeletingAll(true)
                        setConfirmKeys(sortedOrphans.map(orphanKey))
                      },
                    },
                  ]
                : []),
            ]
          : undefined
      }
    />
  )

  const tick = (id: string) =>
    massSelect ? { shown: true, ticked: selectedIds.has(id), onToggle: () => selection.toggle(id) } : null

  const list =
    viewMode === "gallery" ? (
      <ScrollArea className="min-h-0 flex-1">
        {empty ? (
          <p className="grid h-72 place-items-center px-4 text-center text-sm text-muted-foreground">{empty}</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 px-6 py-4 @lg:grid-cols-3 @3xl:grid-cols-4 @5xl:grid-cols-6 @7xl:grid-cols-8">
            {showOrphans
              ? visibleOrphans.map((row) => (
                  <Tile
                    key={orphanKey(row)}
                    label={row.name}
                    badge={problemLabel(row.kind)}
                    open={openOrphan ? orphanKey(openOrphan) === orphanKey(row) : false}
                    tick={tick(orphanKey(row))}
                    onOpen={() => setListSearch({ orphan: orphanKey(row), open: undefined })}
                    onDelete={() => {
                      setDeletingAll(false)
                      setConfirmKeys([orphanKey(row)])
                    }}
                  >
                    <OrphanPreview row={row} className="h-full w-full" />
                  </Tile>
                ))
              : media.map((item) => (
                  <Tile
                    key={item.id}
                    label={item.original_name}
                    badge={item.file_type}
                    open={item.id === openMediaId}
                    tick={tick(item.id)}
                    onOpen={() => setOpen(item.id)}
                    onDelete={() => setDeleteIds([item.id])}
                  >
                    <MediaThumbnail
                      url={item.url}
                      fileType={item.file_type}
                      // Empty: the tile's own button names the file, and a
                      // picture that fails to load would print the name here
                      // ("remove the file name on image").
                      alt=""
                      className="h-full w-full"
                      // Two tiles to a row at the narrowest, eight at the widest middle.
                      sizes="(min-width: 1536px) 12vw, (min-width: 1280px) 15vw, 50vw"
                    />
                  </Tile>
                ))}
          </div>
        )}
      </ScrollArea>
    ) : showOrphans ? (
      <CrmTable<OrphanSort>
        columns={orphanColumns}
        sort={orphanSort}
        direction={orphanDirection}
        onSort={toggleOrphanSort}
        select={
          massSelect
            ? {
                noun: "orphans",
                disabled: visibleOrphans.length === 0,
                checked: selection.selectAllState(visibleOrphans.map(orphanKey)),
                onToggle: () => selection.toggleVisible(visibleOrphans.map(orphanKey)),
              }
            : null
        }
        empty={empty}
      >
        {visibleOrphans.map((row) => (
          <CrmTableRow
            key={orphanKey(row)}
            open={openOrphan ? orphanKey(openOrphan) === orphanKey(row) : false}
            label={row.name}
            tick={tick(orphanKey(row))}
            onOpen={() => setListSearch({ orphan: orphanKey(row), open: undefined })}
            onDelete={() => {
              setDeletingAll(false)
              setConfirmKeys([orphanKey(row)])
            }}
          >
            <FileCell name={row.name} line={row.storagePath}>
              <OrphanPreview row={row} className="size-8 shrink-0 rounded-md border bg-muted" compact />
            </FileCell>
            <TableCell column="preview">
              <Chip muted={row.kind !== "unlinked_object"}>{problemLabel(row.kind)}</Chip>
            </TableCell>
            <TableCell column="preview" className="hidden md:hidden @3xl:table-cell">
              <span className="block max-w-48 truncate text-muted-foreground">{row.ownerName ?? "Unknown"}</span>
            </TableCell>
            <TableCell column="mutedMeta">{formatFileSize(row.bytes)}</TableCell>
            <TableCell column="mutedMeta" className="hidden md:hidden @2xl:table-cell">
              {row.createdAt ? formatDate(row.createdAt) : "Not known"}
            </TableCell>
          </CrmTableRow>
        ))}
      </CrmTable>
    ) : (
      <CrmTable<AdminMediaSort>
        columns={mediaColumns}
        sort={sort}
        direction={direction}
        onSort={toggleSort}
        select={
          massSelect
            ? {
                noun: "files",
                disabled: media.length === 0,
                checked: selection.selectAllState(media.map((item) => item.id)),
                onToggle: () => selection.toggleVisible(media.map((item) => item.id)),
              }
            : null
        }
        empty={empty}
      >
        {media.map((item) => (
          <CrmTableRow
            key={item.id}
            open={item.id === openMediaId}
            label={item.original_name}
            tick={tick(item.id)}
            onOpen={() => setOpen(item.id)}
            onDelete={() => setDeleteIds([item.id])}
          >
            <FileCell name={item.original_name} line={item.alt_text ?? undefined}>
              <MediaThumbnail
                url={item.url}
                fileType={item.file_type}
                alt={item.alt_text ?? item.original_name}
                className="size-8 shrink-0 rounded-md border bg-muted"
                sizes="32px"
                compact
              />
            </FileCell>
            <TableCell column="preview" className="hidden md:hidden @2xl:table-cell">
              <span className="block max-w-48 truncate text-muted-foreground">{item.owner_name}</span>
            </TableCell>
            <TableCell column="preview">
              <Chip muted>{TYPE_LABELS[item.file_type as AdminMediaTypeFilter] ?? item.file_type}</Chip>
            </TableCell>
            <TableCell column="mutedMeta" className="hidden md:hidden @3xl:table-cell">
              {formatFileSize(item.file_size)}
            </TableCell>
            <TableCell column="mutedMeta">{formatDate(item.created_at)}</TableCell>
          </CrmTableRow>
        ))}
      </CrmTable>
    )

  const totalPages = Math.max(1, data.media.total_pages)

  return frame({
    header,
    middle: (
      <div className="@container flex min-h-0 flex-1 flex-col">
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          multiple
          accept={mediaAccept(true)}
          onChange={handleUploadSelect}
        />
        {listProblem ? (
          <div className="flex items-center gap-3 border-b px-6 py-2 text-sm text-muted-foreground">
            <span className="min-w-0 flex-1">{listProblem}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void (showOrphans ? rescan() : refresh())}
            >
              Try again
            </Button>
          </div>
        ) : null}
        <div className={cn("flex min-h-0 flex-1 flex-col transition-opacity", refreshCount > 0 && "opacity-50")}>
          {list}
        </div>
        {showOrphans ? (
          orphanPage.footer.type === "pagination" && orphanPage.footer.totalPages > 1 ? (
            <div className="border-t">
              <DashboardTablePagination {...orphanPage.footer} />
            </div>
          ) : null
        ) : totalPages > 1 || page > 1 ? (
          <div className="border-t">
            <DashboardTablePagination
              page={page}
              pageSize={pageSize}
              total={data.media.total}
              totalPages={totalPages}
              onPageChange={(next) => setPage(Math.max(1, Math.min(next, totalPages)))}
              onPageSizeChange={(size) => {
                setPageSize(size)
                setPage(1)
              }}
            />
          </div>
        ) : null}
      </div>
    ),
    right: {
      label: showOrphans ? "Orphan" : "File",
      content: showOrphans ? (
        <OrphanPanel
          key={openOrphan ? orphanKey(openOrphan) : "none"}
          orphan={openOrphan}
          scanning={scanning}
          onDelete={(row) => {
            setDeletingAll(false)
            setConfirmKeys([orphanKey(row)])
          }}
        />
      ) : (
        <MediaFilePanel
          key={`${openMediaId ?? "none"}-${refreshes}`}
          item={openMedia}
          reading={Boolean(openMediaId) && !openMedia && readMedia?.id !== openMediaId}
          editable={openMedia?.owner_id === currentUserId}
          onDelete={(item) => setDeleteIds([item.id])}
          onSaved={async () => {
            // A file opened by a link, not on this page, is read again too,
            // so the panel shows what was just saved.
            setReadMedia(null)
            await refresh()
            setRefreshes((count) => count + 1)
          }}
        />
      ),
    },
    // Only files remember a place and open the first row by address; an
    // orphan is known by its storage key and opens the first one here.
    ids: showOrphans ? [] : media.map((item) => item.id),
    openId: openMediaId,
    ready: showOrphans || shownKey === listKey,
    windows: (
      <>
        <ConfirmDialog
          open={Boolean(deleteIds)}
          onOpenChange={(open) => {
            if (!open && !deleting) setDeleteIds(null)
          }}
          title={`Delete ${closingDeleteCount} ${plural(closingDeleteCount, "file", "files")}?`}
          description="Unused files are erased from storage and removed from their owner's library. A logo already used in email is kept so old inbox copies do not break."
          confirmLabel={`Delete ${plural(closingDeleteCount, "file", "files")}`}
          loading={deleting}
          onConfirm={() => void handleConfirmDelete()}
        />
        <ConfirmDialog
          open={Boolean(confirmKeys)}
          onOpenChange={(open) => {
            if (!open && !cleaning) {
              setConfirmKeys(null)
              setDeletingAll(false)
            }
          }}
          title={`${deletingAll ? "Delete all" : "Delete"} ${closingCleanCount} ${plural(closingCleanCount, "orphan", "orphans")}?`}
          // "Delete all" clears what is listed, so a filtered list says so
          // rather than letting the word "all" mean the whole bucket.
          description={`${
            deletingAll && isFiltered
              ? "This clears every orphan matching the current filters, not the whole list. "
              : ""
          }Files with no record in the database are erased from storage, and records whose file is missing are removed from the database. This cannot be undone.`}
          confirmLabel={deletingAll ? `Delete all ${plural(closingCleanCount, "orphan", "orphans")}` : "Delete orphans"}
          loading={cleaning}
          onConfirm={() => void handleClean()}
        />
      </>
    ),
  })
}

/** The file's cell: its small picture, its name, and one muted line under it. */
function FileCell({ name, line, children }: { name: string; line?: string; children: React.ReactNode }) {
  return (
    <TableCell column="main" className="min-w-40">
      <span className="flex min-w-0 items-center gap-2">
        <OpenBar />
        {children}
        <span className="grid min-w-0">
          <span data-row-name="" className="truncate font-medium">
            {name}
          </span>
          {line ? <span className="truncate text-xs text-muted-foreground">{line}</span> : null}
        </span>
      </span>
    </TableCell>
  )
}

/**
 * One file in the gallery. Pressing it opens it on the right; the one open
 * has a ring. Its bin shows while it is pointed at, and its tick box while
 * Mass select is on.
 */
function Tile({
  label,
  badge,
  open,
  tick,
  onOpen,
  onDelete,
  children,
}: {
  label: string
  badge: string
  open: boolean
  tick: { ticked: boolean; onToggle: () => void } | null
  onOpen: () => void
  onDelete: () => void
  children: React.ReactNode
}) {
  return (
    <div
      aria-current={open ? "true" : undefined}
      className={cn(
        "group relative overflow-hidden rounded-lg border bg-muted",
        open && "ring-2 ring-foreground",
        tick?.ticked && "border-primary ring-3 ring-primary/15"
      )}
    >
      <button
        type="button"
        className="relative block aspect-[3/4] w-full bg-muted"
        aria-label={`Open ${label}`}
        onClick={tick ? tick.onToggle : onOpen}
      >
        {children}
        <span className="absolute top-2 left-2 rounded bg-background/90 px-1.5 py-0.5 text-[10px] capitalize">
          {badge}
        </span>
        {/* No file name on the tile (Tyler, 9 Nov 2026: "in media library,
            remove the file name on image"); it is the tile's name to a screen
            reader and shows on the right once the file is open. */}
      </button>
      <div className="absolute top-2 right-2 flex gap-1">
        {tick ? (
          <span className="flex size-7 items-center justify-center rounded-md bg-background/90">
            <Checkbox checked={tick.ticked} onCheckedChange={tick.onToggle} aria-label={`Tick ${label}`} />
          </span>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Delete ${label}`}
          className="bg-background/90 opacity-0 group-hover:opacity-100 hover:text-destructive focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
          onClick={onDelete}
        >
          <Trash2Icon className="size-4" />
        </Button>
      </div>
    </div>
  )
}
