import * as React from "react"
import { CalendarIcon, CopyIcon, SparklesIcon, TagIcon, Trash2Icon } from "lucide-react"

import { FilterRow } from "@/components/admin-dashboard/list-parts"
import { CrmListHeader, CrmRowMenu } from "@/components/crm/crm-row"
import { CrmTable, CrmTableRow, MainCell } from "@/components/crm/crm-table"
import { EmptyRecord } from "@/components/crm/record-frame"
import { ListPager, NoMatches, useOpenFirstRow } from "@/components/directory/listings-dashboard/section-parts"
import { EventRecord } from "@/components/events/events-dashboard/event-record"
import type { EventsLoaded, EventsSectionProps } from "@/components/events/events-dashboard/load-section"
import { NewEventDropdown } from "@/components/events/events-dashboard/new-event-dropdown"
import { useBulkChangeAsk } from "@/components/shared/bulk-change-menu"
import { DashboardTabs } from "@/components/shared/dashboard-tabs"
import { FilterPopover } from "@/components/shared/filter-popover"
import { SelectedMenu, SelectedMenuRow, SelectedMenuSeparator } from "@/components/shared/mass-select"
import { PanelReopenButton } from "@/components/shared/three-panels"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TableCell } from "@/components/ui/table"
import { changeEvents, copyEvent, getEventErrorMessage, removeEvents, type EventSummary } from "@/lib/api/events/events"
import { EVENT_TAB_LABELS, EVENT_TABS, type EventTab } from "@/lib/events/events-dashboard-search"
import { describeRepeat } from "@/lib/events/event-repeat"
import {
  DEFAULT_EVENT_SORT,
  EVENT_VIEW_RANGES,
  EVENT_VIEW_RANGE_LABELS,
  eventSortDirection,
  type EventSortColumn,
} from "@/lib/events/event-sort"
import { formatEventStart } from "@/lib/events/event-time"
import { formatDate } from "@/lib/format/format-time"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useBulkChange } from "@/lib/hooks/use-bulk-change"
import { useClearSelectionOnListChange } from "@/lib/hooks/use-clear-selection"
import { useSelection } from "@/lib/hooks/use-selection"
import { useListSearchNavigate, useListSort, useOpenRecord } from "@/lib/nav/list-search"
import { SCHEDULE_STATUS_LABELS } from "@/lib/events/schedule-status"

type Data = Extract<EventsLoaded, { section: "events" }>

/**
 * The Events row: the site's events, a repeating one once, searched, sorted
 * and paged on the server, behind Upcoming, Past and Draft tabs in the
 * header, each with its count (the mock of 19 Nov 2026, as the Listings row
 * has Published, Draft and Closed). It was the Events page, a table whose
 * rows opened a window.
 *
 * - **Header:** the tabs, the "N selected" menu (Set a category, Publish,
 *   Unpublish, Feature, Stop featuring, Delete), the search box, Select,
 *   Filter (the range the Views column counts, and a category picked in the
 *   Categories block), and New event.
 * - **Rows:** Duplicate, the cog and the bin; a right-click menu of Mass
 *   select, Duplicate and Delete.
 * - **Right:** the open event, which saves itself (`event-record.tsx`).
 */
export function EventsSection({ data, search, frame, onChanged }: EventsSectionProps<Data>) {
  const setListSearch = useListSearchNavigate()
  const setOpen = useOpenRecord()
  const page = data.page
  const q = search.q ?? ""
  const tab: EventTab = search.tab ?? "upcoming"
  const viewDays = search.days ?? "all"
  const sort = search.sort ?? DEFAULT_EVENT_SORT
  const direction = search.direction ?? eventSortDirection(sort)
  const toggleSort = useListSort<EventSortColumn>({ sort, direction }, eventSortDirection)
  const categoryName = search.category ? data.categories.find((category) => category.id === search.category)?.name : undefined

  const [massSelect, setMassSelect] = React.useState(false)
  const selection = useSelection()
  const [rightClick, setRightClick] = React.useState<{ id: string; x: number; y: number } | null>(null)
  const [confirm, setConfirm] = React.useState<{ ids: string[]; title: string | null; dates: number } | null>(null)
  const [run, busy] = useAsyncAction(getEventErrorMessage)
  const [pressedId, setPressedId] = React.useState<string>()
  /** Bumped when a bulk change reaches the open event, so its record is read again. */
  const [recordRead, setRecordRead] = React.useState(0)

  const listKey = `${q}|${tab}|${search.category ?? ""}|${sort}|${direction}|${viewDays}|${page.page}|${page.pageSize}`
  useClearSelectionOnListChange(selection.setSelected, listKey)

  const rows = page.events
  const ids = rows.map((event) => event.id)
  const openId = search.open
  useOpenFirstRow(ids, openId, listKey)
  const openRow = rows.find((event) => event.id === openId) ?? null

  const bulk = useBulkChange({
    one: "event",
    rows,
    send: changeEvents,
    describeError: getEventErrorMessage,
    onChanged: async () => {
      await onChanged()
    },
    setSelected: selection.setSelected,
  })
  const ticked = [...selection.selected]
  const change = useBulkChangeAsk({
    count: ticked.length,
    one: "event",
    many: "events",
    busy: bulk.busy,
    categories: data.categories,
    // The only kind with a free featured switch. A listing owner's paid spot
    // is a separate record and nothing here touches it.
    canFeature: true,
    onRun: async (next) => {
      const went = await bulk.run(ticked, next)
      // The open event's form holds its fields as it opened, and its next
      // save sends all of them, so a bulk change to it is read again instead.
      if (openId && ticked.includes(openId)) setRecordRead((count) => count + 1)
      return went
    },
  })

  /** A draft copy, opened at once so the admin can change the day. */
  const duplicate = (event: { id: string }) =>
    void run(async () => {
      const made = await copyEvent(event.id)
      await onChanged()
      setListSearch({ tab: "draft", open: made.id, page: undefined })
    })

  const askToDelete = (list: string[], title: string | null) =>
    setConfirm({
      ids: list,
      title,
      dates: rows.filter((event) => list.includes(event.id)).reduce((sum, event) => sum + event.seriesDates.total, 0),
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

  const filterCount = (viewDays !== "all" ? 1 : 0) + (search.category ? 1 : 0)
  const rightClicked = rightClick ? rows.find((event) => event.id === rightClick.id) : undefined
  const anyEvents = page.tabCounts.upcoming + page.tabCounts.past + page.tabCounts.draft > 0

  const ask = (step: () => void) => (menu: { close: () => void }) => () => {
    menu.close()
    step()
  }

  const middle = (
    <div className="@container flex h-full min-h-0 flex-col overflow-hidden bg-card">
      <CrmListHeader
        tabs={
          <>
            <PanelReopenButton side="left" label="Show the page" />
            <DashboardTabs
              value={tab}
              onValueChange={(value) => setListSearch({ tab: value === "upcoming" ? undefined : value, page: undefined })}
              tabs={EVENT_TABS.map((each) => ({ value: each, label: EVENT_TAB_LABELS[each], count: page.tabCounts[each] }))}
            />
          </>
        }
        end={<PanelReopenButton side="right" label="Show the event" />}
        selected={
          massSelect && ticked.length ? (
            <SelectedMenu
              count={ticked.length}
              busy={busy || bulk.busy}
              onClear={selection.clear}
              pages={{}}
              main={(menu) => (
                <>
                  <SelectedMenuRow onClick={ask(change.ask.category)(menu)}>
                    <TagIcon className="size-4" />
                    Set a category
                  </SelectedMenuRow>
                  <SelectedMenuRow onClick={ask(() => change.ask.status("published"))(menu)}>Publish</SelectedMenuRow>
                  <SelectedMenuRow onClick={ask(() => change.ask.status("draft"))(menu)}>Unpublish</SelectedMenuRow>
                  <SelectedMenuRow onClick={ask(() => change.ask.featured(true))(menu)}>
                    <SparklesIcon className="size-4" />
                    Feature
                  </SelectedMenuRow>
                  <SelectedMenuRow onClick={ask(() => change.ask.featured(false))(menu)}>Stop featuring</SelectedMenuRow>
                  <SelectedMenuSeparator />
                  <SelectedMenuRow className="text-destructive" onClick={ask(() => askToDelete(ticked, null))(menu)}>
                    <Trash2Icon className="size-4" />
                    Delete
                  </SelectedMenuRow>
                </>
              )}
            />
          ) : null
        }
        menuLabel="More for events"
        search={{
          name: "event-search",
          label: "Search events by title, address or place",
          placeholder: "Search events",
          value: q,
          onChange: (text) => setListSearch({ q: text.trim() ? text : undefined, page: undefined }),
        }}
        massSelect={{ on: massSelect, onToggle: () => toggleMassSelect() }}
        filter={
          <FilterPopover
            contentClassName="w-60"
            count={filterCount}
            onClear={() => setListSearch({ days: undefined, category: undefined, page: undefined })}
            save={null}
          >
            <FilterRow id="events-views" label="Views counted over">
              <Select
                value={String(viewDays)}
                onValueChange={(value) => setListSearch({ days: value === "all" ? undefined : 30, page: undefined })}
              >
                <SelectTrigger id="events-views" className="h-8 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EVENT_VIEW_RANGES.map((days) => (
                    <SelectItem key={days} value={String(days)}>
                      {EVENT_VIEW_RANGE_LABELS[days]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterRow>
            {categoryName ? (
              <p className="text-sm text-muted-foreground">Only events in {categoryName}, picked in the Categories block.</p>
            ) : null}
          </FilterPopover>
        }
        primary={<NewEventDropdown />}
      />
      <CrmTable<EventSortColumn>
        columns={[
          { key: "title", label: "Event", column: "main", className: "min-w-40" },
          { key: "date", label: "Date", column: "meta", className: "hidden md:hidden @lg:table-cell" },
          {
            key: "views",
            label: viewDays === "all" ? "Views" : "30-day views",
            column: "meta",
            className: "hidden md:hidden @2xl:table-cell",
          },
          { key: "updated", label: "Updated", column: "meta", className: "hidden md:hidden @4xl:table-cell" },
        ]}
        sort={sort}
        direction={direction}
        onSort={toggleSort}
        select={
          massSelect
            ? {
                noun: "events",
                disabled: ids.length === 0,
                checked: selection.selectAllState(ids),
                onToggle: () => selection.toggleVisible(ids),
              }
            : null
        }
        empty={
          rows.length > 0 ? null : q.trim() || filterCount ? (
            <NoMatches
              words={q}
              noun="events"
              onClear={() => setListSearch({ q: undefined, days: undefined, category: undefined, page: undefined })}
            />
          ) : anyEvents ? (
            tab === "upcoming" ? (
              "Nothing is coming up."
            ) : (
              `No ${EVENT_TAB_LABELS[tab].toLowerCase()} events.`
            )
          ) : (
            "No events yet. Make the first one with New event."
          )
        }
      >
        {rows.map((event) => (
          <CrmTableRow
            key={event.id}
            open={event.id === openId}
            label={event.title}
            tick={{ shown: massSelect, ticked: selection.selected.has(event.id), onToggle: () => selection.toggle(event.id) }}
            onOpen={() => {
              setPressedId(event.id)
              setOpen(event.id)
            }}
            buttons={[{ label: `Duplicate ${event.title}`, icon: <CopyIcon className="size-4" />, onPress: () => duplicate(event) }]}
            onDelete={() => askToDelete([event.id], event.title)}
            onRightClick={(x, y) => setRightClick({ id: event.id, x, y })}
          >
            <MainCell lead={<EventThumbnail url={event.coverImage} />} name={event.title} line={rowLine(event)} />
            <TableCell column="mutedMeta" className="hidden md:hidden @lg:table-cell">
              {formatEventStart(event)}
            </TableCell>
            <TableCell column="mutedMeta" className="hidden tabular-nums md:hidden @2xl:table-cell">
              {event.views.toLocaleString()}
            </TableCell>
            <TableCell column="mutedMeta" className="hidden md:hidden @4xl:table-cell">
              {formatDate(event.updatedAt)}
            </TableCell>
          </CrmTableRow>
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
      label: "Event",
      showLabel: "Show the event",
      content: openId ? (
        <EventRecord
          key={`${openId}:${recordRead}`}
          eventId={openId}
          title={openRow?.title ?? "Event"}
          categories={data.categories}
          actions={{
            busy,
            duplicate: () => duplicate({ id: openId }),
            remove: () => askToDelete([openId], openRow?.title ?? null),
          }}
          onSaved={() => void onChanged()}
          onOpenEvent={(id) => setOpen(id)}
        />
      ) : (
        <EmptyRecord
          title="Event"
          icon={<CalendarIcon aria-hidden />}
          line={anyEvents ? "Click an event to see it here." : "Make an event with New event to see it here."}
          hideLabel="Hide the event"
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
          title={confirm && confirm.ids.length === 1 ? "Delete this event?" : `Delete ${confirm?.ids.length ?? 0} events?`}
          description={confirm ? deleteWarning(confirm) : null}
          confirmLabel={confirm && confirm.ids.length > 1 ? `Delete ${confirm.ids.length} events` : "Delete event"}
          destructive
          loading={busy}
          onConfirm={() =>
            void run(async () => {
              if (!confirm) return
              const { done, kept } = await removeEvents(confirm.ids)
              // The open event gone, the first row opens in its place.
              if (openId && done.includes(openId)) setOpen(undefined)
              await onChanged()
              selection.setSelected(new Set(kept))
              if (done.length === 0) {
                throw new Error("No events were deleted. They may already be gone, and the list has been read again.")
              }
              setConfirm(null)
            })
          }
        />
      </>
    ),
  })
}

/** The line under a title: a repeat says so, otherwise its place or its categories. */
function rowLine(event: EventSummary): string {
  const { total, upcoming } = event.seriesDates
  const parts: string[] = []
  if (event.repeat) parts.push(`${describeRepeat(event.repeat)}, ${upcoming} more ${upcoming === 1 ? "date" : "dates"} coming`)
  else if (total) parts.push(`No longer repeats, ${total} later ${total === 1 ? "date" : "dates"}`)
  if (event.visibility === "private") parts.push("Private")
  if (event.featuredNow) parts.push("Featured")
  if (!parts.length) parts.push(event.placeName || (event.categories.length ? event.categories.join(", ") : `/events/${event.slug}`))
  // Cancelled or postponed goes first, so it is never cut off (task events/27).
  if (event.scheduleStatus !== "scheduled") parts.unshift(SCHEDULE_STATUS_LABELS[event.scheduleStatus])
  return parts.join(" · ")
}

/** The cover before the title, 28px, the same as a listing's thumbnail on the Listings row. */
function EventThumbnail({ url }: { url: string }) {
  const [broken, setBroken] = React.useState(false)
  return url && !broken ? (
    <img
      src={url}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setBroken(true)}
      className="size-7 shrink-0 rounded-md bg-muted object-cover"
    />
  ) : (
    <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
      <CalendarIcon className="size-3.5" />
    </span>
  )
}

/** What the delete window says goes, dates of repeating events included. */
function deleteWarning(confirm: { ids: string[]; title: string | null; dates: number }): string {
  const keeps = "The listings and categories they point at stay."
  const datesText = (count: number) => `${count} later ${count === 1 ? "date" : "dates"}`
  if (confirm.ids.length > 1) {
    const dates = confirm.dates ? ` So do ${datesText(confirm.dates)} of the repeating events among them.` : ""
    return `${confirm.ids.length} events go for good, and their pages stop existing.${dates} ${keeps}`
  }
  const title = confirm.title ?? "The event"
  if (confirm.dates) return `${title} and its ${datesText(confirm.dates)} go for good, and their pages stop existing. ${keeps}`
  return `${title} goes for good, and its page stops existing. The listings and categories it points at stay.`
}
