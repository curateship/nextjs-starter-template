import * as React from "react"
import { getRouteApi, useNavigate, useRouter } from "@tanstack/react-router"
import { PlusIcon, SettingsIcon, Trash2Icon, UsersRoundIcon } from "lucide-react"
import { toast } from "sonner"

import { SegmentDialog } from "@/components/broadcasts/segment-dialog"
import { useShellRuntime } from "@/components/shell/shell-layout"
import { DashboardTable } from "@/components/shared/dashboard-table"
import {
  DashboardToolbarButton,
  DashboardToolbarSearch,
} from "@/components/shared/dashboard-toolbar"
import {
  SortableTableHeader,
  type SortableColumn,
} from "@/components/shared/sortable-table-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { TableCell, TableHead, TableRow } from "@/components/ui/table"
import {
  deleteSegments,
  getSegmentErrorMessage,
  type SegmentItem,
  type SegmentsPage as SegmentsPageData,
} from "@/lib/api/people/contact-segments"
import { describeSegmentRules } from "@/lib/contacts/contact-segments"
import { describeBulkResult } from "@/lib/format/bulk-result"
import { showErrorToast } from "@/lib/toast/error-toast"
import { formatDate } from "@/lib/format/format-time"
import {
  useListSearchNavigate,
  useListSort,
  useSearchBoxText,
} from "@/lib/nav/list-search"
import { plural } from "@/lib/format/plural"
import { quoteOneLine } from "@/lib/format/quote-text"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useClearSelectionOnListChange } from "@/lib/hooks/use-clear-selection"
import { useOpenFromLink } from "@/lib/hooks/use-open-from-link"
import { useSelection } from "@/lib/hooks/use-selection"

const segmentsRoute = getRouteApi("/_authenticated/admin/segments")

export type SegmentSortColumn = "name" | "kind" | "people" | "updated"

const SEGMENT_COLUMNS: SortableColumn<SegmentSortColumn>[] = [
  { key: "name", label: "Segment", column: "main" },
  { key: "kind", label: "How it is decided", column: "meta" },
  { key: "people", label: "People", column: "meta" },
  { key: "updated", label: "Changed", column: "meta" },
]

function compareSegments(
  a: SegmentItem,
  b: SegmentItem,
  column: SegmentSortColumn
) {
  switch (column) {
    case "kind":
      return a.kind.localeCompare(b.kind)
    case "people":
      return a.total - b.total
    case "updated":
      return Date.parse(a.updated_at) - Date.parse(b.updated_at)
    default:
      return a.name.localeCompare(b.name)
  }
}

/**
 * Groups of contacts named once, so a newsletter can say who it is for by
 * pointing at a name instead of describing the group again.
 *
 * The number in the People column is worked out fresh on every load — nobody is
 * saved into a rules segment — so somebody who unsubscribed this morning is out
 * of it this afternoon without anybody having to remember.
 */
export function SegmentsPage({
  initial,
  openId,
}: {
  initial: SegmentsPageData
  /** One segment named by the link that brought us here. */
  openId?: string
}) {
  const { config } = useShellRuntime()
  const router = useRouter()
  const navigate = useNavigate()
  // Search, sort and page live in the address, so Back returns this exact list.
  const listSearch = segmentsRoute.useSearch()
  const setListSearch = useListSearchNavigate()
  const searchQuery = listSearch.q ?? ""
  const currentPage = listSearch.page ?? 1
  const setCurrentPage = React.useCallback(
    (next: number) => setListSearch({ page: next > 1 ? next : undefined }),
    [setListSearch]
  )
  const [searchText, setSearchText] = useSearchBoxText(searchQuery, (text) =>
    setListSearch({ q: text.trim() ? text : undefined, page: undefined })
  )

  const [pageSize, setPageSize] = React.useState(config.dashboardRowsPerPage)
  const sort: SegmentSortColumn = listSearch.sort ?? "name"
  const direction = listSearch.direction ?? "asc"
  const toggleSort = useListSort<SegmentSortColumn>({ sort, direction })

  const [editing, setEditing] = React.useState<SegmentItem | null>(null)
  const [creating, setCreating] = React.useState(false)
  const [deleteTargets, setDeleteTargets] = React.useState<SegmentItem[]>([])
  const [runDelete, deleting] = useAsyncAction(getSegmentErrorMessage)
  const selection = useSelection()
  const [error, setError] = React.useState<string | null>(null)

  const setOpenSegment = React.useCallback(
    (id: string | undefined) => {
      void navigate({
        to: ".",
        search: (previous: Record<string, unknown>) => {
          const next = { ...previous }
          if (id) next.open = id
          else delete next.open
          return next
        },
      })
    },
    [navigate]
  )
  const openSegment = React.useCallback(
    (segment: SegmentItem) => {
      setEditing(segment)
      setOpenSegment(segment.id)
    },
    [setOpenSegment]
  )

  useOpenFromLink({ openId, records: initial.segments, onOpen: setEditing })
  React.useEffect(() => {
    if (!openId && !creating) setEditing(null)
  }, [creating, openId])

  /** Names to show wherever one segment leaves another out. */
  const segmentNames = React.useMemo(
    () =>
      Object.fromEntries(
        initial.segments.map((segment) => [segment.id, segment.name])
      ),
    [initial.segments]
  )

  const sortedSegments = React.useMemo(() => {
    const factor = direction === "asc" ? 1 : -1
    const query = searchQuery.trim().toLowerCase()
    return initial.segments
      .filter(
        (segment) =>
          !query ||
          segment.name.toLowerCase().includes(query) ||
          segment.description.toLowerCase().includes(query)
      )
      .sort((a, b) => factor * compareSegments(a, b, sort))
  }, [direction, initial.segments, searchQuery, sort])

  const totalPages = Math.ceil(sortedSegments.length / pageSize)
  const visibleSegments = React.useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return sortedSegments.slice(start, start + pageSize)
  }, [currentPage, pageSize, sortedSegments])

  React.useEffect(() => {
    setCurrentPage(1)
  }, [pageSize, setCurrentPage])

  useClearSelectionOnListChange(
    selection.setSelected,
    `${searchQuery}|${sort}|${direction}|${currentPage}|${pageSize}`
  )

  const visibleIds = visibleSegments.map((segment) => segment.id)
  const selectedCount = selection.selected.size

  // Re-running the route loader is the refresh: the counts are worked out on
  // the server, so a fetch of our own would have to ask for them all again
  // anyway.
  const refresh = React.useCallback(async () => {
    try {
      await router.invalidate()
      setError(null)
    } catch (loadError) {
      setError(getSegmentErrorMessage(loadError))
    }
  }, [router])

  const removeMany = async (targets: SegmentItem[]) => {
    if (deleting || targets.length === 0) return
    await runDelete(async () => {
      const { deleted, blocked } = await deleteSegments(
        targets.map((segment) => segment.id)
      )

      // Nothing went through, so this is a failure — say what is in the way and
      // leave the question open rather than closing on a green tick.
      if (deleted.length === 0) {
        showErrorToast(describeBlocked(blocked))
        return
      }

      // The ones that could not go stay ticked, so it is obvious which they are.
      selection.setSelected(new Set(blocked.map((entry) => entry.id)))
      setDeleteTargets([])
      toast.success(
        describeBulkResult({
          done: deleted.length,
          kept: blocked.length,
          one: "segment",
          many: "segments",
          verb: "deleted",
        })
      )
      if (blocked.length) showErrorToast(describeBlocked(blocked))
      await refresh()
    })
  }

  const selectedSegments = initial.segments.filter((segment) =>
    selection.selected.has(segment.id)
  )

  return (
    <>
      <DashboardTable
        title="Segments"
        icon={<UsersRoundIcon />}
        count={sortedSegments.length}
        error={error ? { message: error, onRetry: () => void refresh() } : null}
        selectedCount={selectedCount}
        onClearSelection={selection.clear}
        controls={
          <>
            {selectedCount ? (
              <DashboardToolbarButton
                type="button"
                variant="destructive"
                disabled={deleting}
                onClick={() => setDeleteTargets(selectedSegments)}
              >
                <Trash2Icon className="size-4" />
                Delete ({selectedCount})
              </DashboardToolbarButton>
            ) : null}
            <DashboardToolbarSearch
              name="segment-search"
              aria-label="Search segments"
              placeholder="Search segments…"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
            <DashboardToolbarButton
              type="button"
              onClick={() => setCreating(true)}
            >
              <PlusIcon className="size-4" />
              New segment
            </DashboardToolbarButton>
          </>
        }
        header={
          <SortableTableHeader
            columns={SEGMENT_COLUMNS}
            sort={sort}
            direction={direction}
            onSort={toggleSort}
            leading={
              <TableHead column="select">
                <Checkbox
                  checked={selection.selectAllState(visibleIds)}
                  onCheckedChange={() => selection.toggleVisible(visibleIds)}
                  aria-label="Select the segments on this page"
                />
              </TableHead>
            }
            trailing={<TableHead column="meta">Actions</TableHead>}
          />
        }
        isEmpty={sortedSegments.length === 0}
        emptyText={
          initial.segments.length === 0
            ? "No segments yet. Name a group of people once and point everything at it."
            : "No segments match that."
        }
        emptyColSpan={6}
        footer={{
          type: "pagination",
          page: currentPage,
          pageSize,
          total: sortedSegments.length,
          totalPages,
          onPageChange: (page) =>
            setCurrentPage(Math.max(1, Math.min(page, totalPages || 1))),
          onPageSizeChange: (next) => {
            setCurrentPage(1)
            setPageSize(next)
          },
        }}
      >
        {visibleSegments.map((segment) => (
          <TableRow
            key={segment.id}
            className="group"
            rowAction={() => openSegment(segment)}
          >
            <TableCell column="select">
              <Checkbox
                checked={selection.selected.has(segment.id)}
                onCheckedChange={() => selection.toggle(segment.id)}
                aria-label={`Select ${segment.name}`}
              />
            </TableCell>
            <TableCell column="main">
              <button
                type="button"
                className="block text-left text-sm font-medium group-hover:underline"
                onClick={() => openSegment(segment)}
              >
                {segment.name}
              </button>
              <span
                className="line-clamp-2 whitespace-normal text-xs text-muted-foreground"
                title={
                  segment.description ||
                  describeSegmentRules(segment.rules, segmentNames)
                }
              >
                {segment.description ||
                  (segment.kind === "static"
                    ? "Hand-picked people"
                    : describeSegmentRules(segment.rules, segmentNames))}
              </span>
            </TableCell>
            <TableCell column="meta">
              <Badge variant="outline">
                {segment.kind === "static" ? "Hand-picked" : "Rules"}
              </Badge>
            </TableCell>
            <TableCell column="meta">
              {segment.total === 0 ? (
                <span className="text-muted-foreground">Nobody yet</span>
              ) : (
                `${segment.total.toLocaleString()} ${plural(segment.total, "person", "people")}`
              )}
            </TableCell>
            <TableCell column="mutedMeta">
              {formatDate(segment.updated_at)}
            </TableCell>
            <TableCell column="actions">
              <div className="flex items-center">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => openSegment(segment)}
                  title="Segment settings"
                  aria-label={`Edit ${segment.name}`}
                >
                  <SettingsIcon className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setDeleteTargets([segment])}
                  title="Delete segment"
                  aria-label={`Delete ${segment.name}`}
                >
                  <Trash2Icon className="size-4" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </DashboardTable>

      <SegmentDialog
        key={editing?.id ?? (creating ? "new-segment" : "closed")}
        open={creating || Boolean(editing)}
        segment={editing}
        page={initial}
        onClose={() => {
          setCreating(false)
          setEditing(null)
          setOpenSegment(undefined)
        }}
        onSaved={async () => {
          setCreating(false)
          setEditing(null)
          setOpenSegment(undefined)
          await refresh()
        }}
      />

      <ConfirmDialog
        open={deleteTargets.length > 0}
        onOpenChange={(open) => {
          if (!open) setDeleteTargets([])
        }}
        title={
          deleteTargets.length === 1
            ? "Delete this segment?"
            : `Delete ${deleteTargets.length} segments?`
        }
        description={
          deleteTargets.length === 1 && deleteTargets[0]
            ? `${quoteOneLine(deleteTargets[0].name)} goes for good. Nobody is deleted — the contacts stay exactly as they are. A segment another one leaves out cannot be deleted until that one stops pointing at it.`
            : "They go for good. Nobody is deleted — the contacts stay exactly as they are. A segment another one leaves out cannot be deleted until that one stops pointing at it."
        }
        confirmLabel={
          deleteTargets.length === 1 ? "Delete segment" : "Delete segments"
        }
        loading={deleting}
        onConfirm={() => void removeMany(deleteTargets)}
      />
    </>
  )
}

/** Which segments refused to go, and what is still pointing at them. */
function describeBlocked(
  blocked: { name: string; usedBy: string[] }[]
): string {
  // Nothing went and nothing was in the way, so they were already gone —
  // somebody deleted them in another window while this list sat here.
  if (blocked.length === 0) {
    return "Those segments are not there any more. Refresh the list to see what is."
  }
  if (blocked.length === 1 && blocked[0]) {
    const entry = blocked[0]
    return `${quoteOneLine(entry.name)} is still being left out by ${entry.usedBy.join(", ")}, so it cannot be deleted yet.`
  }
  return `${blocked.length} segments are still being left out by others, so they cannot be deleted yet: ${blocked
    .map((entry) => `${entry.name} (used by ${entry.usedBy.join(", ")})`)
    .join("; ")}.`
}
