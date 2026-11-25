import * as React from "react"
import { SparklesIcon, XCircleIcon } from "lucide-react"

import { FilterRow } from "@/components/admin-dashboard/list-parts"
import { CrmListHeader, CrmRowMenu } from "@/components/crm/crm-row"
import { CrmTable, CrmTableRow, MainCell } from "@/components/crm/crm-table"
import { EmptyRecord } from "@/components/crm/record-frame"
import { DetailRow, DetailRows } from "@/components/directory/listings-dashboard/detail-rows"
import { ListPager, NoMatches, useOpenFirstRow } from "@/components/directory/listings-dashboard/section-parts"
import { EventRecord } from "@/components/events/events-dashboard/event-record"
import type { EventsLoaded, EventsSectionProps } from "@/components/events/events-dashboard/load-section"
import { FilterPopover } from "@/components/shared/filter-popover"
import { PanelCard } from "@/components/shared/panel-card"
import { MiddleHeading, PanelReopenButton } from "@/components/shared/three-panels"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TableCell } from "@/components/ui/table"
import {
  getEventsDashboardErrorMessage,
  stopFeaturingEvent,
  type FeaturedEventRow,
} from "@/lib/api/events/events-dashboard"
import { formatWallClock } from "@/lib/events/event-time"
import { formatDate } from "@/lib/format/format-time"
import { formatMoney } from "@/lib/format/money"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useListSearchNavigate, useOpenRecord } from "@/lib/nav/list-search"

type Data = Extract<EventsLoaded, { section: "featured" }>

/**
 * The Featured events row (task events/37, Part 1): every event featured
 * now, by an admin's free switch or by a spot a listing's owner paid for.
 * Filter shows ended spots too. A row opens its event on the right, under a
 * card about the spot. "Stop featuring" switches an admin's off, or revokes
 * a paid spot with no refund, the same as Revoke on the Listings dashboard's
 * Placements row, which lists event spots as well.
 */
export function FeaturedSection({ data, search, frame, onChanged }: EventsSectionProps<Data>) {
  const setListSearch = useListSearchNavigate()
  const setOpen = useOpenRecord()
  const page = data.page
  const spots = search.spots ?? "running"
  const q = search.q ?? ""
  const [rightClick, setRightClick] = React.useState<{ id: string; x: number; y: number } | null>(null)
  const [stopping, setStopping] = React.useState<FeaturedEventRow | null>(null)
  const [run, busy] = useAsyncAction(getEventsDashboardErrorMessage)
  const [pressedId, setPressedId] = React.useState<string>()

  const rows = page.rows
  const ids = rows.map((row) => row.id)
  const openId = search.open
  useOpenFirstRow(ids, openId)
  const openRow = rows.find((row) => row.id === openId) ?? null
  const rightClicked = rightClick ? rows.find((row) => row.id === rightClick.id) : undefined
  const listKey = `${q}|${spots}|${page.page}|${page.pageSize}`

  const middle = (
    <div className="@container flex h-full min-h-0 flex-col overflow-hidden bg-card">
      <CrmListHeader
        tabs={<MiddleHeading icon={SparklesIcon} label="Featured events" />}
        end={<PanelReopenButton side="right" label="Show the event" />}
        menuLabel="More for featured events"
        search={{
          name: "featured-search",
          label: "Search featured events by title",
          placeholder: "Search featured events",
          value: q,
          onChange: (text) => setListSearch({ q: text.trim() ? text : undefined, page: undefined }),
        }}
        massSelect={null}
        filter={
          <FilterPopover
            contentClassName="w-60"
            count={spots === "running" ? 0 : 1}
            onClear={() => setListSearch({ spots: undefined, page: undefined })}
            save={null}
          >
            <FilterRow id="featured-spots" label="Show">
              <Select
                value={spots}
                onValueChange={(value) => setListSearch({ spots: value === "running" ? undefined : value, page: undefined })}
              >
                <SelectTrigger id="featured-spots" className="h-8 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="running">Running now</SelectItem>
                  <SelectItem value="all">Ended ones too</SelectItem>
                </SelectContent>
              </Select>
            </FilterRow>
          </FilterPopover>
        }
      />
      <CrmTable<"event">
        columns={[
          { key: "event", label: "Event", column: "main", className: "min-w-40", sortable: false },
          { key: "how", label: "How", column: "meta", className: "hidden md:hidden @lg:table-cell", sortable: false },
          { key: "runs", label: "Runs until", column: "meta", className: "hidden md:hidden @xl:table-cell", sortable: false },
          { key: "paid", label: "Paid", column: "meta", className: "hidden md:hidden @2xl:table-cell", sortable: false },
        ]}
        sort="event"
        direction="asc"
        onSort={() => undefined}
        empty={
          rows.length > 0
            ? null
            : q.trim()
              ? <NoMatches words={q} noun="featured events" onClear={() => setListSearch({ q: undefined, page: undefined })} />
              : spots === "running"
              ? "No event is featured now. Switch Featured on in an event, or a listing's owner can pay to feature theirs."
              : "No event has been featured yet."
        }
      >
        {rows.map((row) => (
          <CrmTableRow
            key={row.id}
            open={row.id === openId}
            label={row.eventTitle}
            onOpen={() => {
              setPressedId(row.id)
              setOpen(row.id)
            }}
            onRightClick={row.running ? (x, y) => setRightClick({ id: row.id, x, y }) : undefined}
          >
            <MainCell name={row.eventTitle} line={formatWallClock(row.eventStart)} />
            <TableCell column="mutedMeta" className="hidden md:hidden @lg:table-cell">
              <span className="block max-w-48 truncate">
                {row.kind === "admin" ? "Featured by an admin" : `Paid by ${row.buyerEmail ?? "the owner"}`}
              </span>
            </TableCell>
            <TableCell column="mutedMeta" className="hidden md:hidden @xl:table-cell">
              {row.running ? (row.endsAt ? formatDate(row.endsAt) : "The event ends") : <Badge variant="outline">Ended</Badge>}
            </TableCell>
            <TableCell column="mutedMeta" className="hidden tabular-nums md:hidden @2xl:table-cell">
              {row.amount !== null && row.currency ? formatMoney(row.amount, row.currency) : "Free"}
            </TableCell>
          </CrmTableRow>
        ))}
      </CrmTable>
      <ListPager page={page.page} pageSize={page.pageSize} total={page.total} />
      {rightClick && rightClicked ? (
        <CrmRowMenu
          key={`${rightClick.id}-${rightClick.x}-${rightClick.y}`}
          at={rightClick}
          massSelect={null}
          items={[
            {
              label: "Stop featuring",
              icon: <XCircleIcon className="size-4" />,
              destructive: true,
              onSelect: () => setStopping(rightClicked),
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
      label: "Event",
      showLabel: "Show the event",
      content: openRow ? (
        <EventRecord
          key={openRow.eventId}
          eventId={openRow.eventId}
          title={openRow.eventTitle}
          categories={data.categories}
          onSaved={() => void onChanged()}
          onOpenEvent={(id) => void setListSearch({ section: undefined, open: id, spots: undefined, page: undefined })}
          extra={
            <PanelCard storageId="event-featured-spot" icon={<SparklesIcon />} title="Featured spot">
              <div className="grid gap-3">
                <DetailRows>
                  <DetailRow label="How" value={openRow.kind === "admin" ? "Featured by an admin, for free" : `Paid by ${openRow.buyerEmail ?? "the owner"}`} />
                  <DetailRow label="Runs until" value={openRow.endsAt ? formatDate(openRow.endsAt) : "The event ends, or Featured is switched off"} />
                  {openRow.amount !== null && openRow.currency ? (
                    <DetailRow label="Paid" value={formatMoney(openRow.amount, openRow.currency)} />
                  ) : null}
                </DetailRows>
                {openRow.running ? (
                  <Button type="button" variant="outline" className="w-fit" disabled={busy} onClick={() => setStopping(openRow)}>
                    Stop featuring
                  </Button>
                ) : null}
              </div>
            </PanelCard>
          }
        />
      ) : (
        <EmptyRecord
          title="Event"
          icon={<SparklesIcon aria-hidden />}
          line="Click a featured event to see it here."
          hideLabel="Hide the event"
        />
      ),
    },
    windows: (
      <ConfirmDialog
        open={stopping !== null}
        onOpenChange={(open) => {
          if (!open) setStopping(null)
        }}
        title="Stop featuring this event?"
        description={
          stopping?.kind === "paid"
            ? `${stopping.eventTitle} leaves the top of the Events page now. The owner paid for this spot, and nothing is refunded.`
            : `${stopping?.eventTitle} leaves the top of the Events page now. Switch Featured on in the event to put it back.`
        }
        confirmLabel="Stop featuring"
        destructive
        loading={busy}
        onConfirm={() =>
          void run(async () => {
            if (!stopping) return
            await stopFeaturingEvent({ kind: stopping.kind, id: stopping.id })
            setStopping(null)
            await onChanged()
          })
        }
      />
    ),
  })
}
