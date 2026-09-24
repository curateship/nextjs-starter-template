import * as React from "react"
import { getRouteApi, useRouter } from "@tanstack/react-router"
import {
  DownloadIcon,
  FilmIcon,
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
  type ExportListResponse,
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
import { formatClock } from "@/lib/video/timeline-utils"
import { ExportCover } from "@/components/video-editor/export-cover"
import { ExportDetailsDialog } from "@/components/video-editor/export-details-dialog"
import { isExportActive } from "@/components/video-editor/use-project-exports"

const exportsRoute = getRouteApi("/_authenticated/admin/video-exports")

export type ExportSortColumn =
  | "title"
  | "project"
  | "shape"
  | "size"
  | "length"
  | "made"

// How often the list asks again while something on it is waiting or rendering.
const POLL_MS = 3000

const EXPORT_COLUMNS: SortableColumn<ExportSortColumn>[] = [
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

function compareExports(
  a: RenderJobSummary,
  b: RenderJobSummary,
  column: ExportSortColumn
) {
  switch (column) {
    case "project":
      return (a.project_name ?? "").localeCompare(b.project_name ?? "")
    case "shape":
      return a.aspect.localeCompare(b.aspect)
    case "size":
      return (a.file_size ?? 0) - (b.file_size ?? 0)
    case "length":
      return (a.duration_ms ?? 0) - (b.duration_ms ?? 0)
    case "made":
      return (
        Date.parse(a.finished_at ?? a.created_at) -
        Date.parse(b.finished_at ?? b.created_at)
      )
    default:
      return (a.title ?? "").localeCompare(b.title ?? "")
  }
}

/**
 * Every export, newest first. A finished row opens what it is called and which
 * moment stands in for it; the download hands over the file itself. A failed
 * row shows why and can be tried again. While anything is waiting or
 * rendering, the list refreshes itself until it lands.
 */
export function ExportsPage({ initial }: { initial: ExportListResponse }) {
  const { config } = useShellRuntime()
  const router = useRouter()
  const listSearch = exportsRoute.useSearch()
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
  const [deleteTargets, setDeleteTargets] = React.useState<RenderJobSummary[]>(
    []
  )
  const [run, busy] = useAsyncAction(getExportErrorMessage)
  const selection = useSelection()

  const items = initial.exports
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
      const { deleted_ids: deleted } = await deleteExports(
        deleteTargets.map((item) => item.id)
      )
      if (deleted.length === 0) {
        showErrorToast("Nothing was deleted — those may already be gone.")
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

  const selectedItems = items.filter((item) => selection.selected.has(item.id))
  const selectedCount = selection.selected.size

  return (
    <>
      <DashboardTable
        title="Exports"
        icon={<FilmIcon />}
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
          </>
        }
        header={
          <SortableTableHeader
            columns={EXPORT_COLUMNS}
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
                      fallback={
                        <FilmIcon className="size-4 text-muted-foreground" />
                      }
                    />
                  ) : (
                    <FilmIcon className="size-4 text-muted-foreground" />
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
                  <ExportRowStatus item={item} />
                </div>
              </div>
            </TableCell>
            <TableCell column="meta">
              <span className="block max-w-40 truncate" title={item.project_name ?? ""}>
                {item.project_name ?? "—"}
              </span>
            </TableCell>
            <TableCell column="meta">{item.aspect}</TableCell>
            <TableCell column="meta">
              {item.file_size ? formatFileSize(item.file_size) : "—"}
            </TableCell>
            <TableCell column="meta" className="hidden 2xl:table-cell">
              {item.duration_ms ? formatClock(item.duration_ms) : "—"}
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
        description="Any file already made goes for good, and one still waiting or being made is stopped. The project it was made from stays as it is."
        confirmLabel={
          deleteTargets.length > 1 ? "Delete exports" : "Delete export"
        }
        loading={busy}
        onConfirm={confirmDelete}
      />
    </>
  )
}

/** Under the name of a row that has no file yet: why, or how far it has got. */
function ExportRowStatus({ item }: { item: RenderJobSummary }) {
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
  return null
}
