import * as React from "react"
import { CopyIcon, StoreIcon, TagIcon, Trash2Icon } from "lucide-react"

import { CrmListHeader, CrmRowMenu } from "@/components/crm/crm-row"
import { Chip, CrmGroupRow, CrmTable, CrmTableRow, MainCell } from "@/components/crm/crm-table"
import { EmptyRecord } from "@/components/crm/record-frame"
import type { ListingsLoaded } from "@/components/directory/listings-dashboard/load-section"
import { NewListingDropdown } from "@/components/directory/listings-dashboard/new-listing-dropdown"
import { ListingRecord } from "@/components/directory/listings-dashboard/records/listing-record"
import {
  ListPager,
  NoMatches,
  PrefetchMark,
  prefetchHandlers,
  useOpenFirstRow,
  type SectionProps,
} from "@/components/directory/listings-dashboard/section-parts"
import { useBulkChangeAsk } from "@/components/shared/bulk-change-menu"
import { FilterPopover } from "@/components/shared/filter-popover"
import { SelectedMenu, SelectedMenuRow, SelectedMenuSeparator } from "@/components/shared/mass-select"
import { MiddleHeading, PanelReopenButton } from "@/components/shared/three-panels"
import { FilterRow } from "@/components/admin-dashboard/list-parts"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TableCell } from "@/components/ui/table"
import {
  changeListings,
  copyListing,
  getListingErrorMessage,
  loadListingDeleteImpact,
  removeListings,
  type ListingSummary,
} from "@/lib/api/directory/listings"
import { forgetListings, prefetchListing } from "@/lib/directory/listing-cache"
import {
  LISTING_VIEW_RANGES,
  LISTING_VIEW_RANGE_LABELS,
  listingSortDirection,
  type ListingSortColumn,
} from "@/lib/directory/listing-sort"
import {
  DIRECTORY_LISTING_STATUSES,
  DIRECTORY_LISTING_STATUS_LABELS,
  type ListingStatus,
} from "@/lib/directory/listing-status"
import { statusIn } from "@/lib/directory/listings-dashboard-search"
import { formatDate } from "@/lib/format/format-time"
import { plural } from "@/lib/format/plural"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useBulkChange } from "@/lib/hooks/use-bulk-change"
import { useClearSelectionOnListChange } from "@/lib/hooks/use-clear-selection"
import { useSelection } from "@/lib/hooks/use-selection"
import { useListSearchNavigate, useListSort, useOpenRecord } from "@/lib/nav/list-search"

type Data = Extract<ListingsLoaded, { section: "listings" }>

type DeleteImpact = Awaited<ReturnType<typeof loadListingDeleteImpact>> & { ids: string[]; title: string | null }

/** Published first, then Draft, then Closed: the headings the rows fall under (Tyler's polish pick, 18 Nov 2026). */
const GROUPS: ListingStatus[] = ["published", "draft", "closed"]

/**
 * The Listings row: every listing on the site, searched, filtered, sorted and
 * paged on the server, under folding Published, Draft and Closed headings
 * with every listing counted, Closed folded at first. It was the Listings
 * page, a table whose rows opened a window.
 *
 * - **Header:** the "N selected" menu (Set a category, Publish, Unpublish,
 *   Delete), the search box (names, address parts, street addresses and
 *   category names), Select, Filter (Status and the range the Views column
 *   counts), and New listing.
 * - **Rows:** Duplicate, the cog and the bin; a right-click menu of Mass
 *   select, Duplicate and Delete (Tyler, 18 Nov 2026: "Make sure right click
 *   is enabled for mass select, duplicates and delete").
 * - **Right:** the open listing, which saves itself (`listing-record.tsx`).
 */
export function ListingsSection({ data, search, frame, onChanged }: SectionProps<Data>) {
  const setListSearch = useListSearchNavigate()
  const setOpen = useOpenRecord()
  const page = data.page
  const q = search.q ?? ""
  const status = statusIn(search.status, DIRECTORY_LISTING_STATUSES)
  const viewDays = search.days ?? "all"
  const sort = statusIn(search.sort, ["title", "status", "views", "created", "updated"] as const) ?? "created"
  const direction = search.direction ?? "desc"
  const toggleSort = useListSort<ListingSortColumn>({ sort, direction }, listingSortDirection)
  const categoryName = search.category ? data.categories.find((category) => category.id === search.category)?.name : undefined

  const [folded, setFolded] = React.useState<Set<ListingStatus>>(() => new Set(["closed"]))
  const [massSelect, setMassSelect] = React.useState(false)
  const selection = useSelection()
  const [rightClick, setRightClick] = React.useState<{ id: string; x: number; y: number } | null>(null)
  const [confirm, setConfirm] = React.useState<DeleteImpact | null>(null)
  const [run, busy] = useAsyncAction(getListingErrorMessage)
  const [pressedId, setPressedId] = React.useState<string>()
  /** Bumped when a bulk change reaches the open listing, so its record is read again. */
  const [recordRead, setRecordRead] = React.useState(0)

  const refresh = React.useCallback(async () => {
    forgetListings()
    await onChanged()
  }, [onChanged])

  const listKey = `${q}|${status ?? ""}|${search.category ?? ""}|${sort}|${direction}|${page.page}|${page.pageSize}`
  useClearSelectionOnListChange(selection.setSelected, listKey)

  const grouped = GROUPS.map((group) => ({
    status: group,
    rows: page.listings.filter((listing) => listing.status === group),
  })).filter((group) => (status ? group.status === status : page.statusCounts[group.status] > 0 || group.rows.length > 0))
  const shownRows = grouped.flatMap((group) => (folded.has(group.status) ? [] : group.rows))
  const ids = shownRows.map((listing) => listing.id)
  const openId = search.open
  useOpenFirstRow(ids, openId, listKey)
  const openRow = page.listings.find((listing) => listing.id === openId) ?? null

  const bulk = useBulkChange({
    one: "listing",
    rows: page.listings,
    send: changeListings,
    describeError: getListingErrorMessage,
    onChanged: refresh,
    setSelected: selection.setSelected,
  })
  const ticked = [...selection.selected]
  const change = useBulkChangeAsk({
    count: ticked.length,
    one: "listing",
    many: "listings",
    busy: bulk.busy,
    categories: data.categories,
    onRun: async (next) => {
      const went = await bulk.run(ticked, next)
      // The open listing's form holds its fields as it opened, and its next
      // save sends all of them, so a bulk Publish or category change to it
      // would be undone by the next keystroke. It is read again instead.
      if (openId && ticked.includes(openId)) setRecordRead((count) => count + 1)
      return went
    },
  })

  /** A copy to start from: the same words, a free address, always a draft. It opens on the right, ready to rename. */
  const duplicate = (listing: ListingSummary) =>
    void run(async () => {
      const copy = await copyListing(listing.id)
      await refresh()
      setOpen(copy.id)
    })

  /** The question says what goes before anything does, so the impact is read first. */
  const askToDelete = (list: string[], title: string | null) =>
    void run(async () => {
      const impact = await loadListingDeleteImpact(list)
      setConfirm({ ...impact, ids: list, title })
    })

  const toggleMassSelect = (tickId?: string) => {
    if (massSelect) {
      selection.clear()
      setMassSelect(false)
      return
    }
    setMassSelect(true)
    if (tickId) selection.setSelected(new Set([tickId]))
  }

  const filterCount = (status ? 1 : 0) + (viewDays !== "all" ? 1 : 0) + (search.category ? 1 : 0)
  const viewsLabel = viewDays === "all" ? "Views" : viewDays === 365 ? "Year views" : `${viewDays}-day views`

  const rightClicked = rightClick ? page.listings.find((listing) => listing.id === rightClick.id) : undefined

  const middle = (
    <div className="@container flex h-full min-h-0 flex-col overflow-hidden bg-card" {...prefetchHandlers(prefetchListing)}>
      <CrmListHeader
        tabs={<MiddleHeading icon={StoreIcon} label="Listings" />}
        end={<PanelReopenButton side="right" label="Show the listing" />}
        selected={
          massSelect && ticked.length ? (
            <SelectedMenu
              count={ticked.length}
              busy={busy || bulk.busy}
              onClear={selection.clear}
              pages={{}}
              main={(menu) => (
                <>
                  <SelectedMenuRow
                    onClick={() => {
                      menu.close()
                      change.ask.category()
                    }}
                  >
                    <TagIcon className="size-4" />
                    Set a category
                  </SelectedMenuRow>
                  <SelectedMenuRow
                    onClick={() => {
                      menu.close()
                      change.ask.status("published")
                    }}
                  >
                    Publish
                  </SelectedMenuRow>
                  <SelectedMenuRow
                    onClick={() => {
                      menu.close()
                      change.ask.status("draft")
                    }}
                  >
                    Unpublish
                  </SelectedMenuRow>
                  <SelectedMenuSeparator />
                  <SelectedMenuRow
                    className="text-destructive"
                    onClick={() => {
                      menu.close()
                      askToDelete(ticked, null)
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
        menuLabel="More for listings"
        search={{
          name: "listing-search",
          label: "Search listings by name, address or category",
          placeholder: "Search listings",
          value: q,
          onChange: (text) => setListSearch({ q: text.trim() ? text : undefined, page: undefined }),
        }}
        massSelect={{ on: massSelect, onToggle: () => toggleMassSelect() }}
        filter={
          <FilterPopover
            contentClassName="w-60"
            count={filterCount}
            onClear={() => setListSearch({ status: undefined, days: undefined, category: undefined, page: undefined })}
            save={null}
          >
            <FilterRow id="listings-status" label="Status">
              <Select
                value={status ?? "all"}
                onValueChange={(value) => setListSearch({ status: value === "all" ? undefined : value, page: undefined })}
              >
                <SelectTrigger id="listings-status" className="h-8 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {DIRECTORY_LISTING_STATUSES.map((each) => (
                    <SelectItem key={each} value={each}>
                      {DIRECTORY_LISTING_STATUS_LABELS[each]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterRow>
            <FilterRow id="listings-views" label="Views counted over">
              <Select
                value={String(viewDays)}
                onValueChange={(value) => setListSearch({ days: value === "all" ? undefined : Number(value), page: undefined })}
              >
                <SelectTrigger id="listings-views" className="h-8 w-full">
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
            </FilterRow>
            {categoryName ? (
              <p className="text-sm text-muted-foreground">Only listings in {categoryName}, picked in the Categories block.</p>
            ) : null}
          </FilterPopover>
        }
        primary={<NewListingDropdown />}
      />
      <CrmTable<ListingSortColumn>
        columns={[
          { key: "title", label: "Listing", column: "main", className: "min-w-40" },
          { key: "status", label: "Status", column: "meta", className: "hidden md:hidden @lg:table-cell" },
          { key: "views", label: viewsLabel, column: "meta", className: "hidden md:hidden @xl:table-cell" },
          { key: "created", label: "Created", column: "meta", className: "hidden md:hidden @4xl:table-cell" },
          { key: "updated", label: "Updated", column: "meta", className: "hidden md:hidden @2xl:table-cell" },
        ]}
        sort={sort}
        direction={direction}
        onSort={toggleSort}
        select={
          massSelect
            ? {
                noun: "listings",
                disabled: ids.length === 0,
                checked: selection.selectAllState(ids),
                onToggle: () => selection.toggleVisible(ids),
              }
            : null
        }
        empty={
          page.listings.length > 0 ? null : q.trim() || filterCount ? (
            <NoMatches
              words={q}
              noun="listings"
              onClear={() => setListSearch({ q: undefined, status: undefined, days: undefined, category: undefined, page: undefined })}
            />
          ) : (
            "No listings yet. Make the first one with New listing."
          )
        }
      >
        {grouped.map((group) => (
          <React.Fragment key={group.status}>
            <CrmGroupRow
              label={DIRECTORY_LISTING_STATUS_LABELS[group.status]}
              count={page.statusCounts[group.status]}
              folded={folded.has(group.status)}
              onToggle={() =>
                setFolded((current) => {
                  const next = new Set(current)
                  if (next.has(group.status)) next.delete(group.status)
                  else next.add(group.status)
                  return next
                })
              }
            />
            {folded.has(group.status)
              ? null
              : group.rows.map((listing) => (
                  <CrmTableRow
                    key={listing.id}
                    open={listing.id === openId}
                    label={listing.title}
                    tick={{ shown: massSelect, ticked: selection.selected.has(listing.id), onToggle: () => selection.toggle(listing.id) }}
                    onOpen={() => {
                      setPressedId(listing.id)
                      setOpen(listing.id)
                    }}
                    buttons={[{ label: `Duplicate ${listing.title}`, icon: <CopyIcon className="size-4" />, onPress: () => duplicate(listing) }]}
                    onDelete={() => askToDelete([listing.id], listing.title)}
                    onRightClick={(x, y) => setRightClick({ id: listing.id, x, y })}
                  >
                    <MainCell name={listing.title} line={listing.categories.length ? listing.categories.join(", ") : `/${listing.slug}`}>
                      <PrefetchMark id={listing.id} />
                    </MainCell>
                    <TableCell column="meta" className="hidden md:hidden @lg:table-cell">
                      <Chip muted>{DIRECTORY_LISTING_STATUS_LABELS[listing.status]}</Chip>
                    </TableCell>
                    <TableCell column="mutedMeta" className="hidden tabular-nums md:hidden @xl:table-cell">
                      {listing.views.toLocaleString()}
                    </TableCell>
                    <TableCell column="mutedMeta" className="hidden md:hidden @4xl:table-cell">
                      {formatDate(listing.createdAt)}
                    </TableCell>
                    <TableCell column="mutedMeta" className="hidden md:hidden @2xl:table-cell">
                      {formatDate(listing.updatedAt)}
                    </TableCell>
                  </CrmTableRow>
                ))}
          </React.Fragment>
        ))}
      </CrmTable>
      <ListPager page={page.page} pageSize={page.pageSize} total={page.total} />
      {rightClick && rightClicked ? (
        <CrmRowMenu
          key={`${rightClick.id}-${rightClick.x}-${rightClick.y}`}
          at={rightClick}
          massSelect={{ on: massSelect, onToggle: () => toggleMassSelect(!massSelect ? rightClick.id : undefined) }}
          items={[
            { label: "Duplicate", icon: <CopyIcon className="size-4" />, onSelect: () => duplicate(rightClicked) },
            {
              label: "Delete",
              icon: <Trash2Icon className="size-4" />,
              destructive: true,
              onSelect: () => askToDelete([rightClicked.id], rightClicked.title),
            },
          ]}
          onClose={() => setRightClick(null)}
        />
      ) : null}
    </div>
  )

  return frame({
    ids,
    showMiddleFor: listKey,
    showRightFor: pressedId && pressedId === openId ? pressedId : undefined,
    middle,
    right: {
      label: "Listing",
      showLabel: "Show the listing",
      content: openId ? (
        <ListingRecord
          key={`${openId}:${recordRead}`}
          listingId={openId}
          title={openRow?.title ?? "Listing"}
          categories={data.categories}
          customSections={data.customSections}
          actions={{
            busy,
            duplicate: () => openRow && duplicate(openRow),
            remove: () => askToDelete([openId], openRow?.title ?? null),
          }}
          onSaved={() => void onChanged()}
        />
      ) : (
        <EmptyRecord
          title="Listing"
          icon={<StoreIcon aria-hidden />}
          line={page.total ? "Click a listing to see it here." : "Make a listing with New listing to see it here."}
          hideLabel="Hide the listing"
        />
      ),
    },
    windows: (
      <>
        {change.windows}
        <ConfirmDialog
          open={confirm !== null}
          onOpenChange={(open) => {
            if (!open) setConfirm(null)
          }}
          title={confirm && confirm.ids.length === 1 ? "Delete this listing?" : `Delete ${confirm?.ids.length ?? 0} listings?`}
          description={confirm ? deleteWords(confirm) : null}
          confirmLabel={confirm && confirm.ids.length > 1 ? `Delete ${confirm.ids.length} listings` : "Delete listing"}
          destructive
          loading={busy}
          onConfirm={() =>
            void run(async () => {
              if (!confirm) return
              const { done, kept } = await removeListings(confirm.ids)
              // The open listing gone, the first row opens in its place.
              if (openId && done.includes(openId)) setOpen(undefined)
              await refresh()
              // Anything that would not go stays ticked, so the rows still on
              // screen are the ones the count is talking about.
              selection.setSelected(new Set(kept))
              if (done.length === 0) {
                throw new Error("No listings were deleted. They may already be gone, and the list has been read again.")
              }
              setConfirm(null)
            })
          }
        />
      </>
    ),
  })
}

/** What deleting takes with it, said before anything goes. */
function deleteWords(confirm: DeleteImpact) {
  const one = confirm.ids.length === 1
  return [
    one
      ? `${confirm.title ?? "The listing"} goes for good, and its public page stops existing.`
      : `${confirm.ids.length} listings go for good, and their public pages stop existing.`,
    confirm.categoryLinks
      ? `${confirm.categoryLinks === 1 ? "One category tag goes" : `${confirm.categoryLinks} category tags go`} too. The categories themselves stay.`
      : null,
    // First among the things that involve a person: somebody loses a page they were given.
    confirm.claims
      ? `${
          confirm.claims === 1
            ? "A business owner looks after this listing and loses it"
            : `${confirm.claims} business owners look after these listings and lose them`
        }.`
      : null,
    confirm.pendingRequests
      ? `${confirm.pendingRequests === 1 ? "One change waiting to be read goes" : `${confirm.pendingRequests} changes waiting to be read go`} with it.`
      : null,
    confirm.saves ? `${confirm.saves === 1 ? "One saved copy goes" : `${confirm.saves} saved copies go`} with it.` : null,
    confirm.deals
      ? `${confirm.deals === 1 ? "One deal goes" : `${confirm.deals} deals go`} with it, because a deal belongs to its listing.`
      : null,
    confirm.pendingFeatured
      ? `${plural(confirm.pendingFeatured, "One featured checkout is still open", `${confirm.pendingFeatured} featured checkouts are still open`)}, so deleting waits until ${confirm.pendingFeatured === 1 ? "it finishes or expires" : "they finish or expire"}.`
      : null,
    confirm.activeFeatured
      ? `${plural(confirm.activeFeatured, "One paid featured placement is still running", `${confirm.activeFeatured} paid featured placements are still running`)}, and deleting now ends ${confirm.activeFeatured === 1 ? "it" : "them"} with no refund.`
      : null,
  ]
    .filter(Boolean)
    .join(" ")
}
