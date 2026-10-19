import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import {
  CalendarClockIcon,
  DownloadIcon,
  FilmIcon,
  GalleryHorizontalIcon,
  Link2Icon,
  Loader2Icon,
  RotateCwIcon,
  SettingsIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"

import { DashboardTable } from "@/components/shared/dashboard-table"
import { DashboardToolbarSearch } from "@/components/shared/dashboard-toolbar"
import {
  SortableTableHeader,
  type SortableColumn,
} from "@/components/shared/sortable-table-header"
import { useShellRuntime } from "@/components/shell/shell-layout"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { TableCell, TableHead, TableRow } from "@/components/ui/table"
import { DashboardToolbarButton } from "@/components/shared/dashboard-toolbar"
import {
  deleteExports,
  getExportErrorMessage,
  retryExport,
  stopExport,
  type ExportListWithShares,
  type RenderJobSummary,
} from "@/lib/api/video/exports"
import { describeBulkResult } from "@/lib/format/bulk-result"
import { formatDate } from "@/lib/format/format-time"
import { formatFileSize } from "@/lib/format/format-bytes"
import { plural } from "@/lib/format/plural"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useClearSelectionOnListChange } from "@/lib/hooks/use-clear-selection"
import { useSelection } from "@/lib/hooks/use-selection"
import {
  useListSearchNavigate,
  useListSort,
  useSearchBoxText,
} from "@/lib/nav/list-search"
import { showErrorToast } from "@/lib/toast/error-toast"
import type { ExportKind } from "@/lib/video/export-kinds"
import { formatClock } from "@/lib/video/timeline-utils"
import { ExportClearOutDialog } from "@/components/video-editor/export-clear-out-dialog"
import { ExportCover } from "@/components/video-editor/export-cover"
import { ExportDetailsDialog } from "@/components/video-editor/export-details-dialog"
import { ExportShareDialog } from "@/components/video-editor/export-share-dialog"
import { isExportActive } from "@/components/video-editor/use-project-exports"

export type ExportSortColumn =
  | "title"
  | "project"
  | "shape"
  | "size"
  | "length"
  | "made"

/** The list's own state, kept in the address so Back returns to it. */
export type ExportsListSearch = {
  q?: string
  sort?: ExportSortColumn
  direction?: "asc" | "desc"
  page?: number
}

// How often the list asks again while something on it is waiting or rendering.
const POLL_MS = 3000

const VIDEO_COLUMNS: SortableColumn<ExportSortColumn>[] = [
  { key: "title", label: "Export", column: "main" },
  { key: "project", label: "Project", column: "meta" },
  { key: "shape", label: "Shape", column: "meta" },
  { key: "size", label: "Size", column: "meta" },
  // The first to go on a smaller screen; the details window still shows it.
  {
    key: "length",
    label: "Length",
    column: "meta",
    className: "hidden 2xl:table-cell",
  },
  { key: "made", label: "Made", column: "meta" },
]

// The same columns under a carousel's own words: where it came from, and how
// many slides instead of how long.
const CAROUSEL_COLUMNS: SortableColumn<ExportSortColumn>[] = VIDEO_COLUMNS.map(
  (column) =>
    column.key === "project"
      ? { ...column, label: "Carousel" }
      : column.key === "length"
        ? { ...column, label: "Slides" }
        : column
)

function compareExports(
  a: RenderJobSummary,
  b: RenderJobSummary,
  column: ExportSortColumn
) {
  switch (column) {
    case "project":
      return sourceName(a).localeCompare(sourceName(b))
    case "shape":
      return a.aspect.localeCompare(b.aspect)
    case "size":
      return (a.file_size ?? 0) - (b.file_size ?? 0)
    case "length":
      return (
        (a.duration_ms ?? a.slide_count ?? 0) -
        (b.duration_ms ?? b.slide_count ?? 0)
      )
    case "made":
      return (
        Date.parse(a.finished_at ?? a.created_at) -
        Date.parse(b.finished_at ?? b.created_at)
      )
    default:
      return (a.title ?? "").localeCompare(b.title ?? "")
  }
}

/** What an export was made from: its project, or its carousel. */
function sourceName(item: RenderJobSummary) {
  if (item.kind === "carousel") return item.carousel_name ?? "Carousel deleted"
  return item.project_name ?? ""
}

/**
 * Every export of one kind, newest first: video exports on the Exports page,
 * kept carousel ZIPs on Carousel exports, each with its own search and its own
 * clear-out. A finished row opens what it is called and which moment stands
 * in for it; the download hands over the file itself. A carousel's cover is
 * its first slide and its file a ZIP. A failed
 * row shows why and can be tried again. While anything is waiting or
 * rendering, the list refreshes itself until it lands.
 */
export function ExportsPage({
  initial,
  kind,
  search: listSearch,
}: {
  initial: ExportListWithShares
  kind: ExportKind
  search: ExportsListSearch
}) {
  const { config } = useShellRuntime()
  const router = useRouter()
  const carousels = kind === "carousel"
  const setListSearch = useListSearchNavigate()
  const searchQuery = listSearch.q ?? ""
  const currentPage = listSearch.page ?? 1
  const [searchText, setSearchText] = useSearchBoxText(searchQuery, (text) =>
    setListSearch({ q: text.trim() ? text : undefined, page: undefined })
  )
  const sort: ExportSortColumn = listSearch.sort ?? "made"
  const direction = listSearch.direction ?? "desc"
  const toggleSort = useListSort<ExportSortColumn>({ sort, direction })

  const [pageSize, setPageSize] = React.useState(config.dashboardRowsPerPage)
  const [editing, setEditing] = React.useState<RenderJobSummary | null>(null)
  const [sharing, setSharing] = React.useState<RenderJobSummary | null>(null)
  const [deleteTargets, setDeleteTargets] = React.useState<RenderJobSummary[]>(
    []
  )
  const [clearingOut, setClearingOut] = React.useState(false)
  const [run, busy] = useAsyncAction(getExportErrorMessage)
  const selection = useSelection()

  const items = initial.exports
  const sharedIds = new Set(initial.shared_ids)
  const anyActive = items.some(isExportActive)
  React.useEffect(() => {
    if (!anyActive) return
    const timer = setInterval(() => void router.invalidate(), POLL_MS)
    return () => clearInterval(timer)
  }, [anyActive, router])
  const sortedItems = React.useMemo(() => {
    const factor = direction === "asc" ? 1 : -1
    return [...items].sort((a, b) => factor * compareExports(a, b, sort))
  }, [direction, items, sort])

  const totalPages = Math.ceil(sortedItems.length / pageSize)
  const visibleItems = React.useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return sortedItems.slice(start, start + pageSize)
  }, [currentPage, pageSize, sortedItems])
  const visibleIds = visibleItems.map((item) => item.id)

  useClearSelectionOnListChange(
    selection.setSelected,
    `${searchQuery}|${sort}|${direction}|${currentPage}|${pageSize}`
  )

  async function confirmDelete() {
    if (!deleteTargets.length) return
    await run(async () => {
      const { deleted_ids: deleted, failed_ids: failed } = await deleteExports(
        deleteTargets.map((item) => item.id),
        kind
      )
      if (failed.length) {
        showErrorToast(
          `${failed.length} ${plural(failed.length, "export was", "exports were")} kept because the file could not be removed from storage. Try again in a minute.`
        )
      }
      if (deleted.length === 0) {
        if (!failed.length) {
          showErrorToast("Nothing was deleted — those may already be gone.")
        }
        return
      }
      selection.clear()
      setDeleteTargets([])
      await router.invalidate()
      toast.success(
        describeBulkResult({
          done: deleted.length,
          kept: deleteTargets.length - deleted.length,
          one: "export",
          many: "exports",
          verb: "deleted",
        })
      )
    })
  }

  async function handleRetry(item: RenderJobSummary) {
    await run(async () => {
      await retryExport(item.id)
      await router.invalidate()
    }, `Trying ${item.title ?? "this export"} again.`)
  }

  async function handleStop(item: RenderJobSummary) {
    await run(async () => {
      try {
        await stopExport(item.id)
      } finally {
        await router.invalidate()
      }
    }, "Export stopped. No file was made.")
  }

  const selectedItems = items.filter((item) => selection.selected.has(item.id))
  const selectedCount = selection.selected.size

  return (
    <>
      <DashboardTable
        title={carousels ? "Carousel exports" : "Exports"}
        icon={carousels ? <GalleryHorizontalIcon /> : <FilmIcon />}
        count={initial.total}
        selectedCount={selectedCount}
        onClearSelection={selection.clear}
        controls={
          <>
            {selectedCount ? (
              <DashboardToolbarButton
                type="button"
                variant="destructive"
                disabled={busy}
                onClick={() => setDeleteTargets(selectedItems)}
              >
                <Trash2Icon className="size-4" />
                Delete ({selectedCount})
              </DashboardToolbarButton>
            ) : null}
            <DashboardToolbarSearch
              name="export-search"
              aria-label="Search exports"
              placeholder="Search exports…"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
            <DashboardToolbarButton
              type="button"
              variant="outline"
              onClick={() => setClearingOut(true)}
            >
              <CalendarClockIcon className="size-4" />
              Clear out old
            </DashboardToolbarButton>
          </>
        }
        header={
          <SortableTableHeader
            columns={carousels ? CAROUSEL_COLUMNS : VIDEO_COLUMNS}
            sort={sort}
            direction={direction}
            onSort={toggleSort}
            leading={
              <TableHead column="select">
                <Checkbox
                  checked={selection.selectAllState(visibleIds)}
                  onCheckedChange={() => selection.toggleVisible(visibleIds)}
                  aria-label="Select visible exports"
                />
              </TableHead>
            }
            trailing={<TableHead column="meta">Actions</TableHead>}
          />
        }
        isEmpty={sortedItems.length === 0}
        emptyText={
          searchQuery
            ? "No exports match that search."
            : carousels
              ? "No carousel exports yet. Open a carousel and press Export."
              : "Nothing exported yet. Open a project and press Export."
        }
        emptyColSpan={8}
        footer={{
          type: "pagination",
          page: currentPage,
          pageSize,
          total: sortedItems.length,
          totalPages,
          onPageChange: (next) =>
            setListSearch({ page: next > 1 ? next : undefined }),
          onPageSizeChange: (size) => {
            setPageSize(size)
            setListSearch({ page: undefined })
          },
        }}
      >
        {visibleItems.map((item) => (
          <TableRow
            key={item.id}
            className="group"
            rowAction={
              item.status === "ready" ? () => setEditing(item) : undefined
            }
          >
            <TableCell column="select">
              <Checkbox
                checked={selection.selected.has(item.id)}
                onCheckedChange={() => selection.toggle(item.id)}
                aria-label={`Select ${item.title ?? "this export"}`}
              />
            </TableCell>
            <TableCell column="main">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                  {item.has_thumbnail ? (
                    <ExportCover
                      exportId={item.id}
                      className="size-full object-contain"
                      fallback={<ExportKindIcon item={item} />}
                    />
                  ) : (
                    <ExportKindIcon item={item} />
                  )}
                </span>
                <div className="grid min-w-0 gap-0.5">
                  {item.status === "ready" ? (
                    <button
                      type="button"
                      className="block max-w-full truncate text-left font-medium group-hover:underline"
                      onClick={() => setEditing(item)}
                      title={item.title ?? "Untitled export"}
                    >
                      {item.title ?? "Untitled export"}
                    </button>
                  ) : (
                    <span
                      className="block max-w-full truncate font-medium"
                      title={item.title ?? "Untitled export"}
                    >
                      {item.title ?? "Untitled export"}
                    </span>
                  )}
                  {item.kind === "carousel" ? (
                    <span className="text-sm text-muted-foreground">
                      {describeSlides(item)}
                    </span>
                  ) : null}
                  <ExportRowStatus
                    item={item}
                    shared={sharedIds.has(item.id)}
                  />
                </div>
              </div>
            </TableCell>
            <TableCell column="meta">
              <span className="block max-w-40 truncate" title={sourceName(item)}>
                {sourceName(item) || "—"}
              </span>
            </TableCell>
            <TableCell column="meta">{item.aspect}</TableCell>
            <TableCell column="meta">
              {item.file_size ? formatFileSize(item.file_size) : "—"}
            </TableCell>
            <TableCell column="meta" className="hidden 2xl:table-cell">
              {item.kind === "carousel"
                ? describeSlides(item)
                : item.duration_ms
                  ? formatClock(item.duration_ms)
                  : "—"}
            </TableCell>
            <TableCell column="meta">
              {item.finished_at ? formatDate(item.finished_at) : "—"}
            </TableCell>
            <TableCell column="actions">
              <div className="flex items-center gap-1">
                {item.status === "ready" ? (
                  <>
                    <Button asChild variant="ghost" size="icon">
                      <a
                        href={`/api/v1/video/exports/${item.id}/file?filename=${encodeURIComponent(item.title ?? "export")}`}
                        download
                        aria-label={`Download ${item.title ?? "this export"}`}
                        title={`Download ${item.title ?? "this export"}`}
                      >
                        <DownloadIcon className="size-4" />
                      </a>
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setSharing(item)}
                      aria-label={`Share ${item.title ?? "this export"}`}
                      title="Share link"
                    >
                      <Link2Icon className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setEditing(item)}
                      aria-label={`Edit ${item.title ?? "this export"}`}
                      title={`Edit ${item.title ?? "this export"}`}
                    >
                      <SettingsIcon className="size-4" />
                    </Button>
                  </>
                ) : null}
                {item.status === "error" ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={busy}
                    onClick={() => void handleRetry(item)}
                    aria-label={`Try ${item.title ?? "this export"} again`}
                    title="Try again"
                  >
                    <RotateCwIcon className="size-4" />
                  </Button>
                ) : null}
                {isExportActive(item) ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void handleStop(item)}
                    aria-label={`Stop export ${item.title ?? "this export"}`}
                  >
                    Stop export
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeleteTargets([item])}
                    aria-label={`Delete ${item.title ?? "this export"}`}
                    title={`Delete ${item.title ?? "this export"}`}
                  >
                    <Trash2Icon className="size-4" />
                  </Button>
                )}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </DashboardTable>

      <ExportDetailsDialog
        open={!!editing}
        item={editing}
        onClose={() => setEditing(null)}
        onSaved={() => void router.invalidate()}
      />

      {clearingOut ? (
        <ExportClearOutDialog
          kind={kind}
          onClose={() => setClearingOut(false)}
          onCleared={async () => {
            selection.clear()
            await router.invalidate()
          }}
        />
      ) : null}

      {sharing ? (
        <ExportShareDialog
          key={sharing.id}
          item={sharing}
          onClose={() => setSharing(null)}
          onChanged={() => void router.invalidate()}
        />
      ) : null}

      <ConfirmDialog
        open={deleteTargets.length > 0}
        onOpenChange={(open) => {
          if (!open) setDeleteTargets([])
        }}
        title={
          deleteTargets.length > 1
            ? `Delete ${deleteTargets.length} ${plural(deleteTargets.length, "export", "exports")}?`
            : "Delete this export?"
        }
        description={describeDelete(deleteTargets, sharedIds, kind)}
        confirmLabel={
          deleteTargets.length > 1 ? "Delete exports" : "Delete export"
        }
        loading={busy}
        onConfirm={confirmDelete}
      />
    </>
  )
}

function describeSlides(item: RenderJobSummary) {
  const count = item.slide_count ?? 0
  return `${count} ${plural(count, "slide", "slides")}`
}

function ExportKindIcon({ item }: { item: RenderJobSummary }) {
  const Icon = item.kind === "carousel" ? GalleryHorizontalIcon : FilmIcon
  return <Icon className="size-4 text-muted-foreground" />
}

/**
 * What deleting these takes: the space it frees and how many share links it
 * breaks, counted from the rows being deleted.
 */
function describeDelete(
  targets: RenderJobSummary[],
  sharedIds: Set<string>,
  kind: ExportKind
) {
  const bytes = targets.reduce((total, item) => total + (item.file_size ?? 0), 0)
  const shared = targets.filter((item) => sharedIds.has(item.id)).length
  const frees = bytes ? ` This frees ${formatFileSize(bytes)}.` : ""
  const links = !shared
    ? ""
    : targets.length === 1
      ? " Its share link stops working too."
      : ` ${shared} of them ${plural(shared, "has", "have")} a live share link, which stops working.`
  // A page lists one kind, so everything being deleted is of that kind.
  const source =
    kind === "carousel"
      ? "The carousel it was made from stays as it is."
      : "The project it was made from stays as it is."
  return `Any file already made goes for good, and one still waiting or being made is stopped.${frees}${links} ${source}`
}

/**
 * Under the name of a row: why it has no file, how far it has got, or that a
 * share link opens it for anybody right now.
 */
export function ExportRowStatus({
  item,
  shared,
}: {
  item: RenderJobSummary
  shared: boolean
}) {
  if (item.status === "error") {
    return (
      <span className="text-sm whitespace-normal text-destructive">
        Failed · {item.error_message ?? "The export could not be made"}
      </span>
    )
  }
  if (isExportActive(item)) {
    return (
      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Loader2Icon className="size-3.5 animate-spin" />
        {item.status === "running" ? "Making it now…" : "Waiting to start…"}
      </span>
    )
  }
  if (shared) {
    return (
      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link2Icon className="size-3.5" />
        Shared by link
      </span>
    )
  }
  return null
}
