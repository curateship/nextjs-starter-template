import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { ListTodoIcon, StoreIcon } from "lucide-react"

import { CrmListHeader, CrmRowMenu } from "@/components/crm/crm-row"
import { Chip, CrmTable, CrmTableRow, MainCell } from "@/components/crm/crm-table"
import { EmptyRecord } from "@/components/crm/record-frame"
import { FilterRow } from "@/components/admin-dashboard/list-parts"
import { ListingThumbnail } from "@/components/directory/listings-dashboard/listing-thumbnail"
import type { ListingsLoaded } from "@/components/directory/listings-dashboard/load-section"
import { ListingRecord } from "@/components/directory/listings-dashboard/records/listing-record"
import {
  ListPager,
  NoMatches,
  PrefetchMark,
  prefetchHandlers,
  useOpenFirstRow,
  type SectionProps,
} from "@/components/directory/listings-dashboard/section-parts"
import { deleteWords, type DeleteImpact } from "@/components/directory/listings-dashboard/delete-words"
import { FilterPopover } from "@/components/shared/filter-popover"
import { MiddleHeading, PanelReopenButton } from "@/components/shared/three-panels"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TableCell } from "@/components/ui/table"
import { copyListing, getListingErrorMessage, loadListingDeleteImpact, removeListings } from "@/lib/api/directory/listings"
import { forgetListings, prefetchListing } from "@/lib/directory/listing-cache"
import { NEEDS_WORK_FILTER_LABELS, NEEDS_WORK_GAP_LABELS, NEEDS_WORK_GAPS } from "@/lib/directory/needs-work"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useListSearchNavigate, useOpenRecord } from "@/lib/nav/list-search"

type Data = Extract<ListingsLoaded, { section: "needsWork" }>

/**
 * The Needs work row (Tyler's pick, 24 Nov 2026: "Needs work list"): the
 * published listings missing a photo, opening hours, a write-up or a
 * category, A to Z, each with a chip per gap.
 *
 * - **Header:** search, then Filter with Missing, to narrow to one gap.
 * - **Rows:** nobody changes these in bulk, so there is no Mass select. The
 *   right-click menu opens the listing on the Listings row.
 * - **Right:** the same listing record the Listings row opens, so a gap is
 *   filled in place. Once a listing misses nothing it leaves the list, and
 *   stays open on the right until another row is picked.
 */
export function NeedsWorkSection({ data, search, frame, onChanged }: SectionProps<Data>) {
  const navigate = useNavigate()
  const setListSearch = useListSearchNavigate()
  const setOpen = useOpenRecord()
  const { page } = data
  const q = search.q ?? ""
  const gap = search.gap
  const [rightClick, setRightClick] = React.useState<{ id: string; x: number; y: number } | null>(null)
  const [confirm, setConfirm] = React.useState<DeleteImpact | null>(null)
  const [run, busy] = useAsyncAction(getListingErrorMessage)
  const [pressedId, setPressedId] = React.useState<string>()

  const refresh = React.useCallback(async () => {
    forgetListings()
    await onChanged()
  }, [onChanged])

  const listKey = `${q}|${gap ?? ""}|${page.page}|${page.pageSize}`
  const ids = page.listings.map((listing) => listing.id)
  const openId = search.open
  useOpenFirstRow(ids, openId, listKey)
  const openRow = page.listings.find((listing) => listing.id === openId) ?? null

  const openOnListings = (id: string) => void navigate({ to: "/admin/listings", search: { open: id } })

  /** A copy is a draft, so it opens on the Listings row, where drafts are. */
  const duplicate = (id: string) =>
    void run(async () => {
      const copy = await copyListing(id)
      await refresh()
      openOnListings(copy.id)
    })

  const askToDelete = (id: string, title: string | null) =>
    void run(async () => {
      const impact = await loadListingDeleteImpact([id])
      setConfirm({ ...impact, ids: [id], title })
    })

  const middle = (
    <div className="@container flex h-full min-h-0 flex-col overflow-hidden bg-card" {...prefetchHandlers(prefetchListing)}>
      <CrmListHeader
        tabs={<MiddleHeading icon={ListTodoIcon} label="Needs work" />}
        end={<PanelReopenButton side="right" label="Show the listing" />}
        menuLabel="More for listings that need work"
        search={{
          name: "needs-work-search",
          label: "Search listings that need work by name",
          placeholder: "Search listings",
          value: q,
          onChange: (text) => setListSearch({ q: text.trim() ? text : undefined, page: undefined }),
        }}
        massSelect={null}
        filter={
          <FilterPopover
            contentClassName="w-60"
            count={gap ? 1 : 0}
            onClear={() => setListSearch({ gap: undefined, page: undefined })}
            save={null}
          >
            <FilterRow id="needs-work-gap" label="Missing">
              <Select
                value={gap ?? "any"}
                onValueChange={(next) => setListSearch({ gap: next === "any" ? undefined : next, page: undefined })}
              >
                <SelectTrigger id="needs-work-gap" className="h-8 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Anything</SelectItem>
                  {NEEDS_WORK_GAPS.map((each) => (
                    <SelectItem key={each} value={each}>
                      {NEEDS_WORK_FILTER_LABELS[each]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterRow>
          </FilterPopover>
        }
      />
      <CrmTable<"name">
        columns={[
          { key: "name", label: "Listing", column: "main", className: "min-w-40", sortable: false },
          { key: "missing", label: "Missing", column: "meta", sortable: false },
        ]}
        sort="name"
        direction="asc"
        onSort={() => undefined}
        select={null}
        empty={
          page.listings.length > 0 ? null : q.trim() || gap ? (
            <NoMatches words={q} noun="listings" onClear={() => setListSearch({ q: undefined, gap: undefined, page: undefined })} />
          ) : (
            "Every published listing has a photo, opening hours, a write-up and a category."
          )
        }
      >
        {page.listings.map((listing) => (
          <CrmTableRow
            key={listing.id}
            open={listing.id === openId}
            label={listing.title}
            onOpen={() => {
              setPressedId(listing.id)
              setOpen(listing.id)
            }}
            onRightClick={(x, y) => setRightClick({ id: listing.id, x, y })}
          >
            <MainCell lead={<ListingThumbnail url={listing.featuredImage} />} name={listing.title} line={`/${listing.slug}`}>
              <PrefetchMark id={listing.id} />
            </MainCell>
            <TableCell column="meta">
              <span className="flex flex-wrap gap-1">
                {listing.gaps.map((each) => (
                  <Chip key={each} muted>
                    {NEEDS_WORK_GAP_LABELS[each]}
                  </Chip>
                ))}
              </span>
            </TableCell>
          </CrmTableRow>
        ))}
      </CrmTable>
      <ListPager page={page.page} pageSize={page.pageSize} total={page.total} />
      {rightClick ? (
        <CrmRowMenu
          key={`${rightClick.id}-${rightClick.x}-${rightClick.y}`}
          at={rightClick}
          massSelect={null}
          items={[
            {
              label: "Open on the Listings row",
              icon: <StoreIcon className="size-4" />,
              onSelect: () => openOnListings(rightClick.id),
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
          key={openId}
          listingId={openId}
          title={openRow?.title ?? "Listing"}
          categories={data.categories}
          customSections={data.customSections}
          actions={{
            busy,
            duplicate: () => duplicate(openId),
            remove: () => askToDelete(openId, openRow?.title ?? null),
          }}
          onSaved={() => void onChanged()}
        />
      ) : (
        <EmptyRecord
          title="Listing"
          icon={<StoreIcon aria-hidden />}
          line="Nothing needs work. A published listing missing something shows here."
          hideLabel="Hide the listing"
        />
      ),
    },
    windows: (
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) setConfirm(null)
        }}
        title="Delete this listing?"
        description={confirm ? deleteWords(confirm) : null}
        confirmLabel="Delete listing"
        destructive
        loading={busy}
        onConfirm={() =>
          void run(async () => {
            if (!confirm) return
            const { done } = await removeListings(confirm.ids)
            if (openId && done.includes(openId)) setOpen(undefined)
            await refresh()
            if (done.length === 0) throw new Error("The listing was not deleted. It may already be gone, and the list has been read again.")
            setConfirm(null)
          })
        }
      />
    ),
  })
}
