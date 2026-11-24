import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { MergeIcon, StoreIcon, XIcon } from "lucide-react"

import { CrmListHeader, CrmRowMenu } from "@/components/crm/crm-row"
import { CrmTable, CrmTableRow, MainCell } from "@/components/crm/crm-table"
import { EmptyRecord, FooterState, RecordFrame } from "@/components/crm/record-frame"
import { DetailRow, DetailRows } from "@/components/directory/listings-dashboard/detail-rows"
import { ListingThumbnail } from "@/components/directory/listings-dashboard/listing-thumbnail"
import { ListPager, NoMatches, RecordMenu, useOpenFirstRow, type SectionProps } from "@/components/directory/listings-dashboard/section-parts"
import { PanelCard } from "@/components/shared/panel-card"
import { MiddleHeading, PanelReopenButton } from "@/components/shared/three-panels"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { TableCell } from "@/components/ui/table"
import {
  getDuplicatesErrorMessage,
  markPairNotDuplicate,
  mergeDuplicateListings,
  type DuplicatePair,
  type DuplicateSide,
  type DuplicatesPage,
} from "@/lib/api/directory/duplicates"
import { describeListingPairMatch } from "@/lib/directory/listing-duplicates"
import { DIRECTORY_LISTING_STATUS_LABELS, type ListingStatus } from "@/lib/directory/listing-status"
import { formatDate } from "@/lib/format/format-time"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useListSearchNavigate, useOpenRecord } from "@/lib/nav/list-search"

/**
 * The Duplicates row (Tyler's pick, 24 Nov 2026: "Merge duplicate
 * listings"): pairs of listings that look like the same place, by the rule
 * in `lib/directory/listing-duplicates.ts`, A to Z by the older one.
 *
 * - **Header:** search, which finds either name. No Mass select: a merge
 *   needs somebody to pick which listing stays, one pair at a time.
 * - **Rows:** both names, and what matched. The right-click menu has Not a
 *   duplicate.
 * - **Right:** the two side by side, each with Keep this one, and Not a
 *   duplicate in the footer. Keep asks first, because a merge cannot be
 *   undone.
 */
export function DuplicatesSection({ data, search, frame, onChanged }: SectionProps<DuplicatesPage>) {
  const setListSearch = useListSearchNavigate()
  const setOpen = useOpenRecord()
  const q = search.q ?? ""
  const [rightClick, setRightClick] = React.useState<{ id: string; x: number; y: number } | null>(null)
  const [merging, setMerging] = React.useState<{ keep: DuplicateSide; gone: DuplicateSide } | null>(null)
  const [run, busy] = useAsyncAction(getDuplicatesErrorMessage)
  const [pressedId, setPressedId] = React.useState<string>()

  const ids = data.pairs.map((pair) => pair.id)
  const openId = search.open
  useOpenFirstRow(ids, openId)
  const openPair = data.pairs.find((pair) => pair.id === openId) ?? null
  const listKey = `${q}|${data.page}`

  const notDuplicate = (pair: DuplicatePair) =>
    void run(async () => {
      await markPairNotDuplicate(pair.first.id, pair.second.id)
      await onChanged()
    })

  const rightClicked = rightClick ? data.pairs.find((pair) => pair.id === rightClick.id) : undefined

  const middle = (
    <div className="@container flex h-full min-h-0 flex-col overflow-hidden bg-card">
      <CrmListHeader
        tabs={<MiddleHeading icon={MergeIcon} label="Duplicates" />}
        end={<PanelReopenButton side="right" label="Show the pair" />}
        menuLabel="More for duplicates"
        search={{
          name: "duplicates-search",
          label: "Search possible duplicates by either name",
          placeholder: "Search duplicates",
          value: q,
          onChange: (text) => setListSearch({ q: text.trim() ? text : undefined, page: undefined }),
        }}
        massSelect={null}
      />
      <CrmTable<"name">
        columns={[
          { key: "name", label: "Listings", column: "main", className: "min-w-40", sortable: false },
          { key: "address", label: "Address", column: "meta", className: "hidden md:hidden @2xl:table-cell", sortable: false },
        ]}
        sort="name"
        direction="asc"
        onSort={() => undefined}
        select={null}
        empty={
          data.pairs.length > 0 ? null : q.trim() ? (
            <NoMatches words={q} noun="possible duplicates" onClear={() => setListSearch({ q: undefined, page: undefined })} />
          ) : (
            "No two listings look like the same place. Two listings at one street address with very close names show here."
          )
        }
      >
        {data.pairs.map((pair) => (
          <CrmTableRow
            key={pair.id}
            open={pair.id === openId}
            label={`${pair.first.title} and ${pair.second.title}`}
            onOpen={() => {
              setPressedId(pair.id)
              setOpen(pair.id)
            }}
            onRightClick={(x, y) => setRightClick({ id: pair.id, x, y })}
          >
            <MainCell
              lead={<ListingThumbnail url={pair.first.featuredImage || pair.second.featuredImage} />}
              name={`${pair.first.title} and ${pair.second.title}`}
              line={describeListingPairMatch(pair.matched)}
            />
            <TableCell column="mutedMeta" className="hidden md:hidden @2xl:table-cell">
              {pair.first.address || pair.second.address || "No address"}
            </TableCell>
          </CrmTableRow>
        ))}
      </CrmTable>
      <ListPager page={data.page} pageSize={data.pageSize} total={data.total} />
      {rightClick && rightClicked ? (
        <CrmRowMenu
          key={`${rightClick.id}-${rightClick.x}-${rightClick.y}`}
          at={rightClick}
          massSelect={null}
          items={[{ label: "Not a duplicate", icon: <XIcon className="size-4" />, onSelect: () => notDuplicate(rightClicked) }]}
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
      label: "Pair",
      showLabel: "Show the pair",
      content: openPair ? (
        <PairRecord
          key={openPair.id}
          pair={openPair}
          busy={busy}
          onKeep={(keep, gone) => setMerging({ keep, gone })}
          onNotDuplicate={() => notDuplicate(openPair)}
        />
      ) : (
        <EmptyRecord
          title="Pair"
          icon={<MergeIcon aria-hidden />}
          line={data.total ? "Click a pair to compare the two here." : "Nothing to compare."}
          hideLabel="Hide the pair"
        />
      ),
    },
    windows: (
      <ConfirmDialog
        open={merging !== null}
        onOpenChange={(open) => {
          if (!open) setMerging(null)
        }}
        title={merging ? `Keep ${merging.keep.title} and merge the other into it?` : ""}
        description={merging ? mergeWords(merging.keep, merging.gone) : null}
        confirmLabel="Merge"
        destructive
        loading={busy}
        onConfirm={() =>
          void run(async () => {
            if (!merging) return
            await mergeDuplicateListings(merging.keep.id, merging.gone.id)
            // The list is read again before the question closes, so the merged pair is gone when it does.
            await onChanged()
            setMerging(null)
          })
        }
      />
    ),
  })
}

/** What a merge does, said before it happens. */
function mergeWords(keep: DuplicateSide, gone: DuplicateSide) {
  return [
    `The copy at /${gone.slug} is deleted, and everything that pointed at it moves to ${keep.title}: saves, follows, events, deals, guide entries, reports and its owner, if this one has none.`,
    `${keep.title} keeps its own name, photo, hours, write-up and categories.`,
    `The old address /${gone.slug} forwards to /${keep.slug}. Its past views stay counted under the old address.`,
    // Keeping a draft over a published listing takes the place off the public site until the draft is published.
    keep.status === "draft" && gone.status === "published"
      ? `${keep.title} is a draft, so the place has no public page until it is published.`
      : null,
    "This cannot be undone.",
  ]
    .filter(Boolean)
    .join(" ")
}

function PairRecord({
  pair,
  busy,
  onKeep,
  onNotDuplicate,
}: {
  pair: DuplicatePair
  busy: boolean
  onKeep: (keep: DuplicateSide, gone: DuplicateSide) => void
  onNotDuplicate: () => void
}) {
  const navigate = useNavigate()
  const openOnListings = (id: string) => void navigate({ to: "/admin/listings", search: { open: id } })
  return (
    <RecordFrame
      avatar={<MergeIcon aria-hidden />}
      title="Possible duplicate"
      line={describeListingPairMatch(pair.matched)}
      hideLabel="Hide the pair"
      actions={
        <RecordMenu
          label="Pair menu"
          actions={[
            { label: `Open ${pair.first.title}`, icon: <StoreIcon className="size-4" />, onSelect: () => openOnListings(pair.first.id) },
            { label: `Open ${pair.second.title}`, icon: <StoreIcon className="size-4" />, onSelect: () => openOnListings(pair.second.id) },
            { label: "Not a duplicate", icon: <XIcon className="size-4" />, onSelect: onNotDuplicate, disabled: busy },
          ]}
        />
      }
      body={
        <>
          <SideCard side={pair.first} label="Older" busy={busy} onKeep={() => onKeep(pair.first, pair.second)} />
          <SideCard side={pair.second} label="Newer" busy={busy} onKeep={() => onKeep(pair.second, pair.first)} />
        </>
      }
      footer={
        <>
          <FooterState>
            <span className="text-muted-foreground">Pick the one to keep, or say they are two places.</span>
          </FooterState>
          <Button type="button" variant="outline" disabled={busy} onClick={onNotDuplicate}>
            Not a duplicate
          </Button>
        </>
      }
    />
  )
}

function SideCard({ side, label, busy, onKeep }: { side: DuplicateSide; label: string; busy: boolean; onKeep: () => void }) {
  const status = DIRECTORY_LISTING_STATUS_LABELS[side.status as ListingStatus] ?? side.status
  return (
    <PanelCard storageId={`duplicate-${label.toLowerCase()}`} icon={<StoreIcon />} title={side.title} meta={label}>
      <div className="grid gap-3">
        <DetailRows>
          <DetailRow label="Status" value={status} />
          <DetailRow label="Address" value={side.address || "None"} />
          <DetailRow label="Phone" value={side.phone || "None"} />
          <DetailRow label="Website" value={side.website || "None"} />
          <DetailRow label="Owner" value={side.owner ?? "Nobody yet"} />
          <DetailRow label="Saves" value={side.saves.toLocaleString()} />
          <DetailRow label="Events" value={side.events.toLocaleString()} />
          <DetailRow label="Deals" value={side.deals.toLocaleString()} />
          <DetailRow label="Added" value={formatDate(side.createdAt)} />
        </DetailRows>
        <div>
          <Button type="button" size="sm" disabled={busy} onClick={onKeep}>
            Keep this one
          </Button>
        </div>
      </div>
    </PanelCard>
  )
}
