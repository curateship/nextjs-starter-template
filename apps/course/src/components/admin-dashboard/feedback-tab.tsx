import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { GitMergeIcon, MessageSquareIcon, PlusIcon, SettingsIcon, ThumbsUpIcon, Trash2Icon } from "lucide-react"

import type { AdminFrame } from "@/components/admin-dashboard/admin-dashboard"
import { FeedbackThreadPanel } from "@/components/admin-dashboard/feedback-thread-panel"
import { EditFeedbackModal, MergeFeedbackDialog } from "@/components/admin-dashboard/feedback-windows"
import { FilterRow } from "@/components/admin-dashboard/list-parts"
import { CrmListHeader, CrmRowMenu, type RowMenuItem } from "@/components/crm/crm-row"
import { Chip, CrmTable, CrmTableRow, Dot, OpenBar } from "@/components/crm/crm-table"
import { useShellRuntime } from "@/components/shell/shell-layout"
import { DashboardTablePagination } from "@/components/shared/dashboard-table"
import { DashboardToolbarButton } from "@/components/shared/dashboard-toolbar"
import { FilterPopover } from "@/components/shared/filter-popover"
import { SelectedMenu, SelectedMenuRow } from "@/components/shared/mass-select"
import type { TableHeaderColumn } from "@/components/shared/sortable-table-header"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TableCell } from "@/components/ui/table"
import type { AdminFeedbackSearch, AdminSearch, FeedbackSortColumn } from "@/lib/admin-dashboard/admin-search"
import {
  deleteFeedback,
  deleteFeedbackMany,
  getFeedbackErrorMessage,
  type FeedbackItem,
  type listFeedback,
} from "@/lib/api/feedback"
import { FEEDBACK_STATUSES, feedbackStatusLabels, type FeedbackStatus } from "@/lib/feedback/feedback-status"
import { feedbackTagLabels } from "@/lib/feedback/feedback-tags"
import { feedbackTypeLabels } from "@/lib/feedback/feedback-type"
import { formatRelativeTime } from "@/lib/format/format-time"
import { plural } from "@/lib/format/plural"
import { quoteOneLine } from "@/lib/format/quote-text"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useClearSelectionOnListChange } from "@/lib/hooks/use-clear-selection"
import { useLastValue } from "@/lib/hooks/use-last-value"
import { useSelection } from "@/lib/hooks/use-selection"
import { useListSearchNavigate, useListSort, useOpenRecord } from "@/lib/nav/list-search"

/** What the route's loader read for the Feedback tab: every item on the board. */
export type FeedbackLoaded = Awaited<ReturnType<typeof listFeedback>>

/** A row's dot, in Project's palette: amber waiting, violet planned, blue under way, green done. */
const STATUS_DOT: Record<FeedbackStatus, string> = {
  open: "bg-amber-500",
  planned: "bg-violet-500",
  in_progress: "bg-blue-500",
  done: "bg-green-600",
}

/**
 * The Admin dashboard's Feedback tab (Tyler, 8 Nov 2026,
 * `workspace/tasks/features/admin/admin.md` B3 and B4).
 *
 * - **Middle:** every piece of feedback in the CRM's one header and table
 *   shape. The header has "N selected" while rows are ticked (Delete), Filter
 *   (Type), New feedback (the shell's floating feedback window) and the ⋮
 *   with Search and Mass select.
 * - **Right:** the thread open (`FeedbackThreadPanel`), with its replies and
 *   a reply box. With no `?open=` it is the first row.
 *
 * The route's loader reads the whole board once. Search, Type, sort and the
 * page work on that copy here, so they never ask the server again. Feedback
 * sent from the floating window reads the board again
 * (`feedbackRefreshToken`).
 */
export function FeedbackTab({
  loaded,
  search,
  heading,
  headingEnd,
  frame,
}: {
  loaded: FeedbackLoaded
  search: AdminSearch
  heading: React.ReactNode
  /** Last in the header: the button that reopens the right panel. */
  headingEnd: React.ReactNode
  frame: AdminFrame
}) {
  const router = useRouter()
  const { config, feedbackRefreshToken, onOpenFeedback } = useShellRuntime()
  // The reader left only this tab's keys in the address (`readAdminSearch`).
  const listSearch = search as AdminFeedbackSearch
  const setListSearch = useListSearchNavigate()
  const setOpen = useOpenRecord()
  const q = listSearch.q ?? ""
  const typeFilter = listSearch.type ?? "all"
  const sort: FeedbackSortColumn = listSearch.sort ?? "created"
  const direction = listSearch.direction ?? "desc"
  const page = listSearch.page ?? 1
  const [pageSize, setPageSize] = React.useState(config.dashboardRowsPerPage)

  // The board as the loader read it, then as changed here. A new read from
  // the loader replaces it.
  const [items, setItems] = React.useState(loaded.feedback)
  const [readFrom, setReadFrom] = React.useState(loaded)
  if (readFrom !== loaded) {
    setReadFrom(loaded)
    setItems(loaded.feedback)
  }

  // Feedback sent from the floating window: the loader reads the board again.
  const seenToken = React.useRef(feedbackRefreshToken)
  React.useEffect(() => {
    if (seenToken.current === feedbackRefreshToken) return
    seenToken.current = feedbackRefreshToken
    void router.invalidate()
  }, [feedbackRefreshToken, router])

  const matching = React.useMemo(() => {
    const query = q.trim().toLowerCase()
    const found = items.filter(
      (item) =>
        (typeFilter === "all" || item.type === typeFilter) &&
        (!query || item.message.toLowerCase().includes(query) || item.author_name.toLowerCase().includes(query))
    )
    const sign = direction === "asc" ? 1 : -1
    return found.sort((a, b) => sign * compareFeedback(a, b, sort))
  }, [items, q, typeFilter, sort, direction])
  const totalPages = Math.max(1, Math.ceil(matching.length / pageSize))
  const shown = matching.slice((page - 1) * pageSize, page * pageSize)
  const shownIds = shown.map((item) => item.id)
  const openId = listSearch.open ?? shownIds[0]
  const openFeedback = items.find((item) => item.id === openId) ?? null

  const [massSelect, setMassSelect] = React.useState(false)
  const selection = useSelection()
  const listKey = `${q}|${typeFilter}|${sort}|${direction}|${page}|${pageSize}`
  useClearSelectionOnListChange(selection.setSelected, listKey)
  const toggleMassSelect = (tickId?: string) => {
    if (massSelect) {
      selection.clear()
      setMassSelect(false)
      return
    }
    setMassSelect(true)
    if (tickId) selection.setSelected(new Set([tickId]))
  }
  const tickedCount = selection.selected.size
  const pageFullyTicked = shownIds.length > 0 && shownIds.every((id) => selection.selected.has(id))

  const [editing, setEditing] = React.useState<FeedbackItem | null>(null)
  const [merging, setMerging] = React.useState<FeedbackItem | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<FeedbackItem | null>(null)
  const closingDeleteTarget = useLastValue(deleteTarget)
  const [massDeleteOpen, setMassDeleteOpen] = React.useState(false)
  const [rightClick, setRightClick] = React.useState<{ id: string; x: number; y: number } | null>(null)
  const [runDelete, deleting] = useAsyncAction(getFeedbackErrorMessage)
  const [runMassDelete, massDeleting] = useAsyncAction(getFeedbackErrorMessage)

  const replace = (updated: FeedbackItem) =>
    setItems((current) => current.map((item) => (item.id === updated.id ? updated : item)))
  /** Takes them off the board; an open one leaves the panel for the first row. */
  const removed = (ids: string[]) => {
    const gone = new Set(ids)
    setItems((current) => current.filter((item) => !gone.has(item.id)))
    selection.setSelected((current) => new Set([...current].filter((id) => !gone.has(id))))
    if (listSearch.open && gone.has(listSearch.open)) setListSearch({ open: undefined })
  }

  const removeOne = () => {
    if (!deleteTarget) return
    const target = deleteTarget
    void runDelete(async () => {
      await deleteFeedback(target.id)
      removed([target.id])
      setDeleteTarget(null)
    }, "Feedback deleted.")
  }

  const removeTicked = () =>
    void runMassDelete(async () => {
      const result = await deleteFeedbackMany([...selection.selected])
      removed(result.feedbackIds)
      selection.clear()
      setMassDeleteOpen(false)
    }, "Feedback deleted.")

  const toggleSort = useListSort<FeedbackSortColumn>({ sort, direction }, (column) =>
    column === "created" || column === "votes" || column === "comments" ? "desc" : "asc"
  )
  const columns: TableHeaderColumn<FeedbackSortColumn>[] = [
    { key: "message", label: "Feedback", column: "main", className: "min-w-40" },
    { key: "type", label: "Type", column: "preview" },
    { key: "status", label: "Status", column: "preview", className: "hidden md:hidden @2xl:table-cell" },
    { key: "author", label: "Author", column: "preview", className: "hidden md:hidden @5xl:table-cell" },
    { key: "created", label: "Created", column: "meta", className: "hidden md:hidden @3xl:table-cell" },
    { key: "comments", label: "Replies", column: "meta" },
    { key: "votes", label: "Votes", column: "meta", className: "hidden md:hidden @4xl:table-cell" },
  ]

  const rowMenuItems = (item: FeedbackItem): RowMenuItem[] => [
    { label: "Feedback settings", icon: <SettingsIcon className="size-4" />, onSelect: () => setEditing(item) },
    { label: "Merge into another item", icon: <GitMergeIcon className="size-4" />, onSelect: () => setMerging(item) },
    {
      label: "Delete feedback",
      icon: <Trash2Icon className="size-4" />,
      destructive: true,
      onSelect: () => setDeleteTarget(item),
    },
  ]
  const rightClicked = rightClick ? items.find((item) => item.id === rightClick.id) : undefined

  return frame({
    header: (
      <CrmListHeader
        tabs={heading}
        end={headingEnd}
        selected={
          massSelect && tickedCount ? (
            <SelectedMenu
              count={tickedCount}
              busy={massDeleting}
              onClear={selection.clear}
              pages={{}}
              main={(menu) => (
                <>
                  {pageFullyTicked && matching.length > tickedCount ? (
                    <SelectedMenuRow
                      onClick={() => selection.setSelected(new Set(matching.map((item) => item.id)))}
                    >
                      Tick all {matching.length} that match
                    </SelectedMenuRow>
                  ) : null}
                  <SelectedMenuRow
                    className="text-destructive"
                    onClick={() => {
                      menu.close()
                      setMassDeleteOpen(true)
                    }}
                  >
                    <Trash2Icon className="size-4" />
                    Delete
                  </SelectedMenuRow>
                </>
              )}
            />
          ) : null
        }
        filter={
          <FilterPopover
            // Narrow: a label and a select a row (Tyler, 8 Nov 2026: "filter dropdown is too wide").
            contentClassName="w-60"
            count={typeFilter === "all" ? 0 : 1}
            onClear={() => setListSearch({ type: undefined, page: undefined })}
            save={null}
          >
            <FilterRow id="admin-feedback-type" label="Type">
              <Select
                value={typeFilter}
                onValueChange={(value) => setListSearch({ type: value === "all" ? undefined : value, page: undefined })}
              >
                <SelectTrigger id="admin-feedback-type" className="h-8 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {Object.entries(feedbackTypeLabels).map(([type, label]) => (
                    <SelectItem key={type} value={type}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterRow>
          </FilterPopover>
        }
        primary={
          <DashboardToolbarButton type="button" aria-label="New feedback" onClick={onOpenFeedback}>
            <PlusIcon className="size-4" />
            <span className="@max-3xl:sr-only">New feedback</span>
          </DashboardToolbarButton>
        }
        menuLabel="More for feedback"
        search={{
          name: "feedback-search",
          label: "Search feedback",
          placeholder: "Search feedback",
          value: q,
          onChange: (text) => setListSearch({ q: text.trim() ? text : undefined, page: undefined }),
        }}
        massSelect={{ on: massSelect, onToggle: () => toggleMassSelect() }}
      />
    ),
    middle: (
      <div className="@container flex min-h-0 flex-1 flex-col">
        <CrmTable<FeedbackSortColumn>
          columns={columns}
          sort={sort}
          direction={direction}
          onSort={toggleSort}
          select={
            massSelect
              ? {
                  noun: "feedback",
                  disabled: shownIds.length === 0,
                  checked: selection.selectAllState(shownIds),
                  onToggle: () => selection.toggleVisible(shownIds),
                }
              : null
          }
          empty={
            shown.length > 0 ? null : q.trim() || typeFilter !== "all" ? (
              <span className="grid justify-items-center gap-2">
                {q.trim() ? `No feedback matches "${q.trim()}".` : "No feedback matches."}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setListSearch({ q: undefined, type: undefined, page: undefined })}
                >
                  Clear filters
                </Button>
              </span>
            ) : (
              "No feedback yet. What members send from the feedback window lands here."
            )
          }
        >
          {shown.map((item) => (
            <CrmTableRow
              key={item.id}
              open={item.id === openId}
              label={quoteOneLine(item.message)}
              tick={
                massSelect
                  ? { shown: true, ticked: selection.selected.has(item.id), onToggle: () => selection.toggle(item.id) }
                  : null
              }
              onOpen={() => setOpen(item.id)}
              onDelete={() => setDeleteTarget(item)}
              onRightClick={(x, y) => setRightClick({ id: item.id, x, y })}
            >
              {/* The message is one long line, so its cell takes only the room
                  the other columns leave (`max-w-0` with `w-full`) and cuts it
                  short there, rather than pushing the table past the panel. */}
              <TableCell column="main" className="w-full max-w-0 min-w-40">
                <span className="flex min-w-0 items-center gap-2">
                  <OpenBar />
                  <Dot className={STATUS_DOT[item.status]} label={feedbackStatusLabels[item.status]} />
                  <span data-row-name="" className="truncate font-medium">
                    {item.message.replace(/\s+/g, " ").trim()}
                  </span>
                </span>
              </TableCell>
              <TableCell column="preview">
                <span className="flex items-center gap-1 whitespace-nowrap">
                  <Chip>{feedbackTypeLabels[item.type]}</Chip>
                  {item.tags.map((tag) => (
                    <Chip key={tag} muted className="hidden @2xl:inline-flex">
                      {feedbackTagLabels[tag]}
                    </Chip>
                  ))}
                </span>
              </TableCell>
              <TableCell column="preview" className="hidden md:hidden @2xl:table-cell">
                <Chip muted>{feedbackStatusLabels[item.status]}</Chip>
              </TableCell>
              <TableCell column="preview" className="hidden md:hidden @5xl:table-cell">
                <span className="block max-w-48 truncate text-muted-foreground">{item.author_name}</span>
              </TableCell>
              <TableCell column="mutedMeta" className="hidden md:hidden @3xl:table-cell">
                {formatRelativeTime(item.created_at)}
              </TableCell>
              <TableCell column="mutedMeta">
                <Count icon={<MessageSquareIcon />} value={item.comment_count} noun={["reply", "replies"]} />
              </TableCell>
              <TableCell column="mutedMeta" className="hidden md:hidden @4xl:table-cell">
                <Count icon={<ThumbsUpIcon />} value={item.vote_count} noun={["vote", "votes"]} />
              </TableCell>
            </CrmTableRow>
          ))}
        </CrmTable>

        {totalPages > 1 || page > 1 ? (
          <div className="border-t">
            <DashboardTablePagination
              page={page}
              pageSize={pageSize}
              total={matching.length}
              totalPages={totalPages}
              onPageChange={(next) => {
                const clamped = Math.max(1, Math.min(next, totalPages))
                setListSearch({ page: clamped > 1 ? clamped : undefined })
              }}
              onPageSizeChange={(next) => {
                // Here rather than in an effect, so a pasted link's page survives arrival.
                setListSearch({ page: undefined })
                setPageSize(next)
              }}
            />
          </div>
        ) : null}

        {rightClick && rightClicked ? (
          <CrmRowMenu
            key={`${rightClick.id}-${rightClick.x}-${rightClick.y}`}
            at={rightClick}
            massSelect={{ on: massSelect, onToggle: () => toggleMassSelect(massSelect ? undefined : rightClick.id) }}
            items={rowMenuItems(rightClicked)}
            onClose={() => setRightClick(null)}
          />
        ) : null}
      </div>
    ),
    right: {
      label: "Thread",
      content: (
        <FeedbackThreadPanel
          key={openId ?? "none"}
          feedback={openFeedback}
          openId={openId}
          onSettings={setEditing}
          onMerge={setMerging}
          onDelete={setDeleteTarget}
          onRepliesChange={(feedbackId, change) =>
            setItems((current) =>
              current.map((item) =>
                item.id === feedbackId ? { ...item, comment_count: Math.max(0, item.comment_count + change) } : item
              )
            )
          }
        />
      ),
    },
    ids: shownIds,
    openId,
    windows: (
      <>
        <EditFeedbackModal
          key={editing?.id ?? "closed-feedback"}
          feedback={editing}
          open={editing !== null}
          onOpenChange={(open) => {
            if (!open) setEditing(null)
          }}
          onUpdated={replace}
          onDeleted={(feedbackId) => removed([feedbackId])}
        />
        <MergeFeedbackDialog
          feedback={merging}
          candidates={items}
          open={merging !== null}
          onOpenChange={(open) => {
            if (!open) setMerging(null)
          }}
          onMerged={(sourceId, target) => {
            const wasOpen = listSearch.open === sourceId
            setItems((current) =>
              current.filter((item) => item.id !== sourceId).map((item) => (item.id === target.id ? target : item))
            )
            // The duplicate is gone; the thread that kept everything opens in its place.
            if (wasOpen) setListSearch({ open: target.id })
          }}
        />
        <ConfirmDialog
          open={deleteTarget !== null}
          onOpenChange={(open) => {
            if (!open) setDeleteTarget(null)
          }}
          title="Delete this feedback item?"
          description={
            closingDeleteTarget
              ? `${quoteOneLine(closingDeleteTarget.message)} goes, along with its replies and votes. ${closingDeleteTarget.author_name} is not told. This cannot be undone.`
              : null
          }
          confirmLabel="Delete item"
          loading={deleting}
          onConfirm={removeOne}
        />
        <ConfirmDialog
          open={massDeleteOpen}
          onOpenChange={setMassDeleteOpen}
          title={`Delete ${tickedCount} feedback ${plural(tickedCount, "item", "items")}?`}
          description="Their replies and votes go with them, and the people who wrote them are not told. This cannot be undone."
          confirmLabel={`Delete ${plural(tickedCount, "item", "items")}`}
          loading={massDeleting}
          onConfirm={removeTicked}
        />
      </>
    ),
  })
}

/** A count with its icon, as the old table's badges read, named for a screen reader. */
function Count({ icon, value, noun }: { icon: React.ReactNode; value: number; noun: [string, string] }) {
  return (
    <span className="inline-flex items-center gap-1 tabular-nums [&_svg]:size-3.5">
      <span aria-hidden className="flex">
        {icon}
      </span>
      {value}
      <span className="sr-only"> {plural(value, noun[0], noun[1])}</span>
    </span>
  )
}

/** The order of two items by one column, before the direction is applied. */
function compareFeedback(a: FeedbackItem, b: FeedbackItem, sort: FeedbackSortColumn) {
  if (sort === "message") return a.message.localeCompare(b.message)
  if (sort === "type") return feedbackTypeLabels[a.type].localeCompare(feedbackTypeLabels[b.type])
  // Roadmap order, not the alphabet: Open, Planned, In progress, Done reads as a life.
  if (sort === "status") return FEEDBACK_STATUSES.indexOf(a.status) - FEEDBACK_STATUSES.indexOf(b.status)
  if (sort === "author") return a.author_name.localeCompare(b.author_name)
  if (sort === "comments") return a.comment_count - b.comment_count
  if (sort === "votes") return a.vote_count - b.vote_count
  return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
}
