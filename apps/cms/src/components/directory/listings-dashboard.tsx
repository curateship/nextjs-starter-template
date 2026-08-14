import * as React from "react"
import { useNavigate, useRouter } from "@tanstack/react-router"
import {
  CopyIcon,
  PlusIcon,
  SettingsIcon,
  StoreIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"

import { ListingDialog } from "@/components/directory/listing-dialog"
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
import type { Category } from "@/lib/api/directory/categories"
import {
  copyListing,
  getListingErrorMessage,
  loadListingDeleteImpact,
  removeListings,
  type ListingsPage,
  type ListingSummary,
} from "@/lib/api/directory/listings"
import {
  LISTING_STATUS_FILTERS,
  LISTING_STATUS_LABELS,
  LISTING_VIEW_RANGES,
  LISTING_VIEW_RANGE_LABELS,
  listingSortDirection,
  type ListingSortColumn,
  type ListingStatusFilter,
  type ListingViewRange,
} from "@/lib/directory/listing-sort"
import { forgetListings, prefetchListing } from "@/lib/directory/listing-cache"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useClearSelectionOnListChange } from "@/lib/hooks/use-clear-selection"
import { useSelection } from "@/lib/hooks/use-selection"
import { describeBulkResult } from "@/lib/format/bulk-result"
import { formatDate } from "@/lib/format/format-time"
import {
  useListSearchNavigate,
  useListSort,
  useSearchBoxText,
} from "@/lib/nav/list-search"

/**
 * The admin's Listings screen: every directory listing, searched, filtered by
 * status, sorted and paged on the server — the list can outgrow one fetch, so
 * the address drives the loader and the loader is the only thing that reads.
 * Opening a row goes to the listing's own edit page at /admin/listings/<id>.
 */

export function ListingsDashboard({
  data,
  categories,
  search,
}: {
  data: ListingsPage
  /** The category tree, loaded with the list so the edit window opens with it. */
  categories: Category[]
  search: {
    q?: string
    status?: ListingStatusFilter
    sort?: ListingSortColumn
    direction?: "asc" | "desc"
    days?: ListingViewRange
    /** Which listing's edit window is open — it lives in the address. */
    open?: string
  }
}) {
  const router = useRouter()
  const navigate = useNavigate()
  const setListSearch = useListSearchNavigate()
  const [searchText, setSearchText] = useSearchBoxText(search.q ?? "", (text) =>
    setListSearch({ q: text.trim() ? text : undefined, page: undefined })
  )

  const sort = search.sort ?? "created"
  const direction = search.direction ?? "desc"
  const viewDays = search.days ?? "all"
  const columns = React.useMemo<SortableColumn<ListingSortColumn>[]>(
    () => [
      { key: "title", label: "Listing", column: "main" },
      { key: "status", label: "Status", column: "meta" },
      {
        key: "views",
        label:
          viewDays === "all"
            ? "Views"
            : viewDays === 365
              ? "Year views"
              : `${viewDays}-day views`,
        column: "meta",
      },
      {
        key: "created",
        label: "Created",
        column: "meta",
        className: "hidden md:table-cell",
      },
      { key: "updated", label: "Updated", column: "meta" },
    ],
    [viewDays]
  )
  const toggleSort = useListSort<ListingSortColumn>(
    { sort, direction },
    listingSortDirection
  )

  const selection = useSelection()
  const selectedIds = selection.selected
  const [run, deleting] = useAsyncAction(getListingErrorMessage)
  const [creating, setCreating] = React.useState(false)

  /** What the open confirmation is about to delete, with its measured impact. */
  const [confirm, setConfirm] = React.useState<{
    ids: string[]
    title: string | null
    categoryLinks: number
    claims: number
    pendingRequests: number
    saves: number
    activeFeatured: number
    pendingFeatured: number
  } | null>(null)

  const listKey = `${search.q ?? ""}|${search.status ?? ""}|${sort}|${direction}|${data.page}|${data.pageSize}`
  useClearSelectionOnListChange(selection.setSelected, listKey)

  const visibleIds = React.useMemo(
    () => data.listings.map((listing) => listing.id),
    [data.listings]
  )

  /** The row the open window belongs to, when it is on this page of the list. */
  const openRow = search.open
    ? (data.listings.find((listing) => listing.id === search.open) ?? null)
    : null

  /**
   * Which record is open lives in the address as `?open=<id>`, and opening
   * navigates *without* `replace`, so Back closes the window while the list's
   * own search and filters keep replacing.
   */
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

  const openEditor = React.useCallback(
    (listing: ListingSummary) => setOpen(listing.id),
    [setOpen]
  )

  const [copy, copying] = useAsyncAction(getListingErrorMessage)
  /** A copy to start from: same content, a free address, always a draft. */
  const duplicate = React.useCallback(
    (listing: ListingSummary) => {
      void copy(async () => {
        const made = await copyListing(listing.id)
        await router.invalidate()
        toast.success(`${made.title} was created.`)
      })
    },
    [copy, router]
  )

  /**
   * The confirmation says what actually goes before anything does, so the
   * impact is fetched first — a listing's category tags go with it, and later
   * layers (saves, claims) will widen this without the dialog changing shape.
   */
  const askToDelete = React.useCallback(
    (ids: string[], title: string | null) => {
      void run(async () => {
        const impact = await loadListingDeleteImpact(ids)
        setConfirm({
          ids,
          title,
          categoryLinks: impact.categoryLinks,
          claims: impact.claims,
          pendingRequests: impact.pendingRequests,
          saves: impact.saves,
          activeFeatured: impact.activeFeatured,
          pendingFeatured: impact.pendingFeatured,
        })
      })
    },
    [run]
  )

  const confirmDelete = React.useCallback(async () => {
    if (!confirm) return
    await run(async () => {
      const { done, kept } = await removeListings(confirm.ids)
      forgetListings()
      await router.invalidate()
      // Anything that would not go stays ticked, so the rows still on screen
      // are the ones the count is talking about.
      selection.setSelected(new Set(kept))

      if (done.length === 0) {
        throw new Error(
          "No listings were deleted. They may already be gone — the list has been refreshed."
        )
      }
      toast.success(
        describeBulkResult({
          done: done.length,
          kept: kept.length,
          one: "listing",
          many: "listings",
          verb: "deleted",
        })
      )
      setConfirm(null)
    })
  }, [confirm, router, run, selection])

  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize))

  return (
    <>
      <DashboardTable
        title="Listings"
        icon={<StoreIcon className="text-muted-foreground" />}
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
                onClick={() => askToDelete([...selectedIds], null)}
              >
                <Trash2Icon className="size-4" />
                Delete ({selectedIds.size})
              </DashboardToolbarButton>
            ) : null}
            <DashboardToolbarSearch
              name="listing-search"
              aria-label="Search listings"
              placeholder="Search title or address…"
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
            <Select
              value={String(viewDays)}
              onValueChange={(value) =>
                setListSearch({
                  days: value === "all" ? undefined : Number(value),
                  page: undefined,
                })
              }
            >
              <SelectTrigger className="w-fit" aria-label="Choose view range">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LISTING_VIEW_RANGES.map((days) => (
                  <SelectItem key={days} value={String(days)}>
                    {LISTING_VIEW_RANGE_LABELS[days]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <DashboardToolbarButton
              type="button"
              onClick={() => setCreating(true)}
            >
              <PlusIcon className="size-4" />
              New listing
            </DashboardToolbarButton>
          </>
        }
        header={
          <SortableTableHeader
            columns={columns}
            sort={sort}
            direction={direction}
            onSort={toggleSort}
            withAriaSort
            leading={
              <TableHead column="select">
                <Checkbox
                  checked={selection.selectAllState(visibleIds)}
                  onCheckedChange={() => selection.toggleVisible(visibleIds)}
                  aria-label="Select all listings on this page"
                />
              </TableHead>
            }
            trailing={<TableHead column="meta">Actions</TableHead>}
          />
        }
        isEmpty={data.listings.length === 0}
        emptyText={
          search.q?.trim() || search.status
            ? "No listing matches that search."
            : "No listings yet. Create the first one."
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
        {data.listings.map((listing) => (
          <TableRow
            key={listing.id}
            className="group"
            rowAction={() => openEditor(listing)}
            // Fetch the record while the pointer is still on its way to the
            // click. By the time the window opens the answer is usually here,
            // so there is nothing to wait for and no spinner.
            onPointerEnter={() => prefetchListing(listing.id)}
            onPointerDown={() => prefetchListing(listing.id)}
            onFocus={() => prefetchListing(listing.id)}
          >
            <TableCell column="select">
              <Checkbox
                checked={selectedIds.has(listing.id)}
                onCheckedChange={() => selection.toggle(listing.id)}
                aria-label={`Select ${listing.title}`}
              />
            </TableCell>
            <TableCell column="main">
              <button
                type="button"
                className="block max-w-96 truncate text-left text-sm font-medium group-hover:underline"
                onClick={() => openEditor(listing)}
                title={listing.title}
              >
                {listing.title}
              </button>
              <span
                className="block max-w-96 truncate text-xs text-muted-foreground"
                title={
                  listing.categories.length
                    ? listing.categories.join(", ")
                    : `/${listing.slug}`
                }
              >
                {listing.categories.length
                  ? listing.categories.join(", ")
                  : `/${listing.slug}`}
              </span>
            </TableCell>
            <TableCell column="meta">
              {listing.status === "published" ? (
                <Badge variant="secondary">Published</Badge>
              ) : (
                <Badge variant="outline">Draft</Badge>
              )}
            </TableCell>
            <TableCell column="meta">
              {listing.views.toLocaleString()}
            </TableCell>
            <TableCell column="meta" className="hidden md:table-cell">
              {formatDate(listing.createdAt)}
            </TableCell>
            <TableCell column="meta">{formatDate(listing.updatedAt)}</TableCell>
            <TableCell column="actions">
              <div className="flex items-center">
                {/* Other row actions go before the cog and the bin, never
                    between them — those two end every row in the app. */}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={copying}
                  aria-label={`Duplicate ${listing.title}`}
                  onClick={() => duplicate(listing)}
                >
                  <CopyIcon className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Edit ${listing.title}`}
                  onClick={() => openEditor(listing)}
                >
                  <SettingsIcon className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${listing.title}`}
                  disabled={deleting}
                  onClick={() => askToDelete([listing.id], listing.title)}
                >
                  <Trash2Icon className="size-4" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </DashboardTable>

      {/* One window for editing and creating: `?open=<id>` opens a record,
          the New listing button opens the same window blank. */}
      <ListingDialog
        open={creating || Boolean(search.open)}
        listingId={creating ? null : (search.open ?? null)}
        categories={categories}
        preview={
          openRow ? { title: openRow.title, status: openRow.status } : null
        }
        onClose={() => {
          if (creating) setCreating(false)
          else setOpen(undefined)
        }}
        onSaved={() => {
          // What was fetched for the window is a full record, so a save makes
          // every copy of it here wrong.
          forgetListings()
          void router.invalidate()
        }}
      />

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) setConfirm(null)
        }}
        title={
          confirm && confirm.ids.length === 1
            ? "Delete this listing?"
            : `Delete ${confirm?.ids.length ?? 0} listings?`
        }
        description={
          confirm
            ? [
                confirm.ids.length === 1
                  ? `${confirm.title ?? "The listing"} goes for good, and its public page stops existing.`
                  : `${confirm.ids.length} listings go for good, and their public pages stop existing.`,
                confirm.categoryLinks
                  ? `${
                      confirm.categoryLinks === 1
                        ? "One category tag goes"
                        : `${confirm.categoryLinks} category tags go`
                    } too — the categories themselves stay.`
                  : null,
                // Said before the claims, and first among the consequences that
                // involve a person: somebody loses a page they were given.
                confirm.claims
                  ? `${
                      confirm.claims === 1
                        ? "A business owner looks after this listing and loses it"
                        : `${confirm.claims} business owners look after these listings and lose them`
                    }.`
                  : null,
                confirm.pendingRequests
                  ? `${
                      confirm.pendingRequests === 1
                        ? "One change waiting to be read goes"
                        : `${confirm.pendingRequests} changes waiting to be read go`
                    } with it.`
                  : null,
                confirm.saves
                  ? `${confirm.saves === 1 ? "One saved copy goes" : `${confirm.saves} saved copies go`} with it.`
                  : null,
                confirm.pendingFeatured
                  ? `${confirm.pendingFeatured === 1 ? "One featured checkout is still open" : `${confirm.pendingFeatured} featured checkouts are still open`} — deletion waits until ${confirm.pendingFeatured === 1 ? "it finishes or expires" : "they finish or expire"}.`
                  : null,
                confirm.activeFeatured
                  ? `${confirm.activeFeatured === 1 ? "One paid featured placement is still active" : `${confirm.activeFeatured} paid featured placements are still active`} — deleting now ends ${confirm.activeFeatured === 1 ? "it" : "them"} without a refund.`
                  : null,
              ]
                .filter(Boolean)
                .join(" ")
            : null
        }
        confirmLabel={
          confirm && confirm.ids.length > 1
            ? `Delete ${confirm.ids.length} listings`
            : "Delete listing"
        }
        loading={deleting}
        onConfirm={() => void confirmDelete()}
      />
    </>
  )
}
