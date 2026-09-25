import * as React from "react"
import { useNavigate, useRouter } from "@tanstack/react-router"
import { PlusIcon, SettingsIcon, TagIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { PromotionDialog } from "@/components/promotions/promotion-dialog"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { TableCell, TableHead, TableRow } from "@/components/ui/table"
import {
  getPromotionErrorMessage,
  removePromotions,
  type PromotionsPage,
  type PromotionSummary,
} from "@/lib/api/promotions/promotions"
import {
  LISTING_STATUS_FILTERS,
  LISTING_STATUS_LABELS,
  type ListingStatusFilter,
} from "@/lib/directory/listing-sort"
import { describeBulkResult } from "@/lib/format/bulk-result"
import { formatDate } from "@/lib/format/format-time"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useClearSelectionOnListChange } from "@/lib/hooks/use-clear-selection"
import { useSelection } from "@/lib/hooks/use-selection"
import {
  useListSearchNavigate,
  useListSort,
  useSearchBoxText,
} from "@/lib/nav/list-search"
import { dealAdminDaysText, dealStage } from "@/lib/promotions/deal-days"
import {
  DEFAULT_PROMOTION_SORT,
  promotionSortDirection,
  type PromotionSortColumn,
} from "@/lib/promotions/promotion-sort"

const COLUMNS: SortableColumn<PromotionSortColumn>[] = [
  { key: "title", label: "Deal", column: "main" },
  {
    key: "listing",
    label: "Listing",
    column: "meta",
    className: "hidden md:table-cell",
  },
  { key: "status", label: "Status", column: "meta" },
  { key: "start", label: "Days", column: "meta" },
  {
    key: "updated",
    label: "Updated",
    column: "meta",
    className: "hidden lg:table-cell",
  },
]

/**
 * Admin → Promotions: this site's deals, searched, filtered by status, sorted
 * and paged on the server, in the same table as Events. The list opens on the
 * latest start day first. A row opens the deal's window over the list, and
 * `?open=<id>` in the address says which.
 */
export function PromotionsDashboard({
  data,
  search,
}: {
  data: PromotionsPage
  search: {
    q?: string
    status?: ListingStatusFilter
    sort?: PromotionSortColumn
    direction?: "asc" | "desc"
    open?: string
  }
}) {
  const router = useRouter()
  const navigate = useNavigate()
  const setListSearch = useListSearchNavigate()
  const [searchText, setSearchText] = useSearchBoxText(search.q ?? "", (text) =>
    setListSearch({ q: text.trim() ? text : undefined, page: undefined })
  )

  const sort = search.sort ?? DEFAULT_PROMOTION_SORT
  const direction = search.direction ?? promotionSortDirection(sort)
  const toggleSort = useListSort<PromotionSortColumn>(
    { sort, direction },
    promotionSortDirection
  )

  const selection = useSelection()
  const selectedIds = selection.selected
  const [run, deleting] = useAsyncAction(getPromotionErrorMessage)
  const [creating, setCreating] = React.useState(false)
  const [confirm, setConfirm] = React.useState<{
    ids: string[]
    title: string | null
  } | null>(null)

  const listKey = `${search.q ?? ""}|${search.status ?? ""}|${sort}|${direction}|${data.page}|${data.pageSize}`
  useClearSelectionOnListChange(selection.setSelected, listKey)

  const visibleIds = React.useMemo(
    () => data.promotions.map((promotion) => promotion.id),
    [data.promotions]
  )
  const openRow = search.open
    ? (data.promotions.find((promotion) => promotion.id === search.open) ??
      null)
    : null

  /** Opening pushes a history entry, so Back closes the window. */
  const setOpen = React.useCallback(
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
  const openEditor = (promotion: PromotionSummary) => setOpen(promotion.id)

  const confirmDelete = async () => {
    if (!confirm) return
    await run(async () => {
      const { done, kept } = await removePromotions(confirm.ids)
      await router.invalidate()
      selection.setSelected(new Set(kept))
      if (done.length === 0) {
        throw new Error(
          "No deals were deleted. They may already be gone. The list has been refreshed."
        )
      }
      toast.success(
        describeBulkResult({
          done: done.length,
          kept: kept.length,
          one: "deal",
          many: "deals",
          verb: "deleted",
        })
      )
      setConfirm(null)
    })
  }

  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize))

  return (
    <>
      <DashboardTable
        title="Promotions"
        icon={<TagIcon className="text-muted-foreground" />}
        count={data.total}
        fillHeight
        className="h-auto max-h-full"
        selectedCount={selectedIds.size}
        onClearSelection={selection.clear}
        controls={
          <>
            {selectedIds.size ? (
              <DashboardToolbarButton
                type="button"
                variant="destructive"
                disabled={deleting}
                onClick={() => setConfirm({ ids: [...selectedIds], title: null })}
              >
                <Trash2Icon className="size-4" />
                Delete ({selectedIds.size})
              </DashboardToolbarButton>
            ) : null}
            <DashboardToolbarSearch
              name="promotion-search"
              aria-label="Search deals"
              placeholder="Search title, listing or code…"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
            <Select
              value={search.status ?? "all"}
              onValueChange={(value) =>
                setListSearch({
                  status: value === "all" ? undefined : value,
                  page: undefined,
                })
              }
            >
              <SelectTrigger className="w-fit" aria-label="Filter by status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {LISTING_STATUS_FILTERS.map((status) => (
                  <SelectItem key={status} value={status}>
                    {LISTING_STATUS_LABELS[status]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <DashboardToolbarButton
              type="button"
              onClick={() => setCreating(true)}
            >
              <PlusIcon className="size-4" />
              New deal
            </DashboardToolbarButton>
          </>
        }
        header={
          <SortableTableHeader
            columns={COLUMNS}
            sort={sort}
            direction={direction}
            onSort={toggleSort}
            leading={
              <TableHead column="select">
                <Checkbox
                  checked={selection.selectAllState(visibleIds)}
                  onCheckedChange={() => selection.toggleVisible(visibleIds)}
                  aria-label="Select all deals on this page"
                />
              </TableHead>
            }
            trailing={<TableHead column="meta">Actions</TableHead>}
          />
        }
        isEmpty={data.promotions.length === 0}
        emptyText={
          search.q?.trim() || search.status
            ? "No deal matches that search."
            : "No deals yet. Add the first one."
        }
        emptyColSpan={7}
        footer={{
          type: "pagination",
          page: data.page,
          pageSize: data.pageSize,
          total: data.total,
          totalPages,
          onPageChange: (page) =>
            setListSearch({ page: page > 1 ? page : undefined }),
          onPageSizeChange: (size) => setListSearch({ size, page: undefined }),
        }}
      >
        {data.promotions.map((promotion) => (
          <TableRow
            key={promotion.id}
            className="group"
            rowAction={() => openEditor(promotion)}
          >
            <TableCell column="select">
              <Checkbox
                checked={selectedIds.has(promotion.id)}
                onCheckedChange={() => selection.toggle(promotion.id)}
                aria-label={`Select ${promotion.title}`}
              />
            </TableCell>
            <TableCell column="main">
              <button
                type="button"
                className="block max-w-96 truncate text-left text-sm font-medium group-hover:underline"
                onClick={() => openEditor(promotion)}
                title={promotion.title}
              >
                {promotion.title}
              </button>
              {/* The listing's own column is hidden on narrow screens. */}
              <span className="block max-w-96 truncate text-xs text-muted-foreground md:hidden">
                {promotion.listingTitle}
              </span>
              <span className="hidden max-w-96 truncate text-xs text-muted-foreground md:block">
                /deals/{promotion.slug}
              </span>
            </TableCell>
            <TableCell column="meta" className="hidden md:table-cell">
              <span className="block max-w-60 truncate">
                {promotion.listingTitle}
              </span>
            </TableCell>
            <TableCell column="meta">
              <StatusBadges promotion={promotion} today={data.today} />
            </TableCell>
            <TableCell column="meta">{dealAdminDaysText(promotion)}</TableCell>
            <TableCell column="meta" className="hidden lg:table-cell">
              {formatDate(promotion.updatedAt)}
            </TableCell>
            <TableCell column="actions">
              <div className="flex items-center">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Edit ${promotion.title}`}
                  onClick={() => openEditor(promotion)}
                >
                  <SettingsIcon className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${promotion.title}`}
                  disabled={deleting}
                  onClick={() =>
                    setConfirm({ ids: [promotion.id], title: promotion.title })
                  }
                >
                  <Trash2Icon className="size-4" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </DashboardTable>

      {/* One window for editing and creating. */}
      <PromotionDialog
        open={creating || Boolean(search.open)}
        promotionId={creating ? null : (search.open ?? null)}
        preview={
          openRow ? { title: openRow.title, status: openRow.status } : null
        }
        onClose={() => {
          if (creating) setCreating(false)
          else setOpen(undefined)
        }}
        onSaved={() => void router.invalidate()}
      />

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) setConfirm(null)
        }}
        title={
          confirm && confirm.ids.length === 1
            ? "Delete this deal?"
            : `Delete ${confirm?.ids.length ?? 0} deals?`
        }
        description={
          confirm && confirm.ids.length > 1
            ? `${confirm.ids.length} deals go for good, and their pages stop existing. The listings they are at stay.`
            : `${confirm?.title ?? "The deal"} goes for good, and its page stops existing. The listing it is at stays.`
        }
        confirmLabel={
          confirm && confirm.ids.length > 1
            ? `Delete ${confirm.ids.length} deals`
            : "Delete deal"
        }
        loading={deleting}
        onConfirm={() => void confirmDelete()}
      />
    </>
  )
}

/**
 * Published or Draft, plus why a published deal is not on the Deals page:
 * it has ended, or its listing is still a draft.
 */
function StatusBadges({
  promotion,
  today,
}: {
  promotion: PromotionSummary
  today: string
}) {
  const ended = dealStage(promotion, today) === "ended"
  return (
    <div className="flex items-center gap-1">
      {promotion.status === "published" ? (
        <Badge variant="secondary">Published</Badge>
      ) : (
        <Badge variant="outline">Draft</Badge>
      )}
      {ended ? <Badge variant="outline">Ended</Badge> : null}
      {promotion.listingStatus === "draft" ? (
        <Badge variant="outline">Listing is a draft</Badge>
      ) : null}
    </div>
  )
}
