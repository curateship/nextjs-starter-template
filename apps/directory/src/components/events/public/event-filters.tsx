import * as React from "react"
import { Link, useNavigate } from "@tanstack/react-router"
import { CheckIcon } from "lucide-react"

import {
  LineMenuTrigger,
  LineTabCount,
  LineTabTrack,
  lineTabProps,
} from "@/components/directory/public/line-tabs"
import { FoldingMenu, MenuAction } from "@/components/shared/folding-menu"
import type { EventCategory, EventDateCounts } from "@/lib/api/events/public"
import {
  EVENT_DATE_FILTERS,
  EVENT_DATE_FILTER_LABELS,
  eventDateFilterText,
  type EventsPageSearch,
} from "@/lib/events/events-page"
import { focusRing } from "@/lib/layout/focus-ring"

/**
 * The router marks a link as the current page when its address is part of
 * the one showing, so "Any time" would count as current beside "Today". Only
 * an exact match is current; every link also says so itself.
 */
const exactSearch = { exact: true }

/** "Today, 1 event", so a screen reader hears the number with the words. */
function countWords(count: number) {
  return count === 1 ? "1 event" : `${count} events`
}

/**
 * The dates over the list and the map: Any time, Today, This weekend and Next
 * 7 days, in one dropdown in the underlined row (Tyler's drawing of 25 Nov
 * 2026; they were a row of chips before). The button names the one chosen.
 * Each choice carries the number of events it would show, so nobody picks
 * one to find nothing behind it.
 *
 * There is no picker for a pair of days of the visitor's own. Tyler had it
 * taken off on 25 Sep 2026. A `?from=` and `?to=` in the address still narrow
 * the list, so an old link keeps working: the button reads "Dates" and
 * `EventDateRangeNote` under the row says which, with "Clear dates".
 *
 * Every choice writes to the address, so a filtered page survives a reload
 * and can be sent to somebody. A choice keeps the category, the typed words,
 * the place and the distance, and drops the page number, because page 3 of
 * the old list is nowhere in the new one.
 */
export function EventDateFilters({
  current,
  counts,
}: {
  /** The address as it stands, so a choice keeps what it is not changing. */
  current: EventsPageSearch
  /** How many events are behind each choice. */
  counts: EventDateCounts
}) {
  const kept = keptByDates(current)
  const rangeActive = Boolean(current.from || current.to)
  const choices = [
    { key: "any", search: kept, label: "Any time", count: counts.anyTime, active: !current.when && !rangeActive },
    ...EVENT_DATE_FILTERS.map((when) => ({
      key: when,
      search: { ...kept, when },
      label: EVENT_DATE_FILTER_LABELS[when],
      count: counts[when],
      active: current.when === when,
    })),
  ]
  const chosen = choices.find((choice) => choice.active)
  const navigate = useNavigate()
  const [open, setOpen] = React.useState(false)

  return (
    <FoldingMenu
      label="When"
      fit
      align="start"
      open={open}
      onOpenChange={setOpen}
      trigger={
        <LineMenuTrigger on={!choices[0]!.active} aria-label={`When: ${chosen?.label ?? "Dates"}`}>
          {chosen?.label ?? "Dates"}
        </LineMenuTrigger>
      }
    >
      {choices.map((choice) => (
        <MenuChoice
          key={choice.key}
          chosen={choice.active}
          count={choice.count}
          onClick={() => {
            setOpen(false)
            void navigate({ to: "/events", search: choice.search })
          }}
        >
          {choice.label}
        </MenuChoice>
      ))}
    </FoldingMenu>
  )
}

/**
 * One choice in a row dropdown: the shell's menu row (`MenuAction`), with a
 * tick before the one chosen and, for the dates, its number in grey at the
 * right, read out with the words.
 */
function MenuChoice({
  chosen,
  count,
  onClick,
  children,
}: {
  chosen: boolean
  count?: number
  onClick: () => void
  children: string
}) {
  return (
    <MenuAction
      icon={<CheckIcon aria-hidden="true" className={chosen ? "" : "invisible"} />}
      onClick={onClick}
    >
      {children}
      {count === undefined ? null : (
        <>
          <span className="sr-only">, {countWords(count)}</span>
          <span aria-hidden="true" className="ml-auto pl-6 text-muted-foreground tabular-nums">
            {count}
          </span>
        </>
      )}
    </MenuAction>
  )
}

/**
 * The line under the row while an old link's own pair of days narrows the
 * list: "Showing events from Oct 3 to Oct 5. Clear dates".
 */
export function EventDateRangeNote({ current }: { current: EventsPageSearch }) {
  if (!current.from && !current.to) return null
  return (
    <p className="text-sm text-muted-foreground">
      Showing events {eventDateFilterText(current)}.{" "}
      <Link
        to="/events"
        search={keptByDates(current)}
        className={`rounded-sm underline hover:text-foreground ${focusRing}`}
      >
        Clear dates
      </Link>
    </p>
  )
}

/** What a date choice keeps of the address. */
function keptByDates(current: EventsPageSearch): EventsPageSearch {
  return {
    // The map has the same choices, and a choice keeps the map showing.
    view: current.view === "map" ? ("map" as const) : undefined,
    place: current.place,
    category: current.category,
    q: current.q,
    near: current.near,
    radius: current.radius,
    area: current.area,
  }
}

/**
 * Upcoming or Past, as underlined tabs at the start of the row (Tyler,
 * 19 Nov 2026: "Upcoming | Past chips"; drawn underlined on 25 Nov 2026).
 * Past lists the events that are over, newest first. Each carries its number.
 * Both keep the place, the category and the typed words; the dates and the
 * distance belong to the upcoming list, so Past drops them.
 */
export function EventTimeTabs({
  current,
  counts,
}: {
  current: EventsPageSearch
  counts: EventDateCounts
}) {
  const kept = {
    place: current.place,
    category: current.category,
    q: current.q,
  }
  const past = current.list === "past"
  return (
    <LineTabTrack label="Upcoming or past">
      <TimeTab search={kept} active={!past} label="Upcoming" count={counts.anyTime} />
      <TimeTab search={{ ...kept, list: "past" }} active={past} label="Past" count={counts.past} />
    </LineTabTrack>
  )
}

function TimeTab({
  search,
  active,
  label,
  count,
}: {
  search: EventsPageSearch
  active: boolean
  label: string
  count: number
}) {
  return (
    <Link to="/events" search={search} activeOptions={exactSearch} {...lineTabProps(active)}>
      {label}
      <span className="sr-only">, {countWords(count)}</span>
      <LineTabCount>{count}</LineTabCount>
    </Link>
  )
}

/**
 * The category, as a dropdown in the underlined row after the dates (Tyler's
 * drawing of 25 Nov 2026; it sat in the search bar before). "All categories"
 * and then one line per category with a published public event, in the order
 * set on the Categories screen. A dropdown rather than chips, because a site
 * with twenty categories wrapped chips over three lines.
 *
 * It works on every view, so the page decides what a pick keeps.
 */
export function EventCategoryMenu({
  categories,
  current,
  onChange,
}: {
  categories: EventCategory[]
  /** The slug picked, if any. */
  current: string | undefined
  onChange: (slug: string | undefined) => void
}) {
  const chosen = categories.find((row) => row.slug === current)
  const choices = [
    { slug: undefined, name: "All categories" },
    ...categories.map((row) => ({ slug: row.slug as string | undefined, name: row.name })),
  ]
  const [open, setOpen] = React.useState(false)
  return (
    <FoldingMenu
      label="Category"
      fit
      align="start"
      open={open}
      onOpenChange={setOpen}
      trigger={
        <LineMenuTrigger on={Boolean(chosen)} aria-label={`Category: ${chosen?.name ?? "All categories"}`}>
          {chosen?.name ?? "All categories"}
        </LineMenuTrigger>
      }
    >
      {choices.map((choice) => (
        <MenuChoice
          key={choice.slug ?? "all"}
          chosen={choice.slug === chosen?.slug}
          onClick={() => {
            setOpen(false)
            onChange(choice.slug)
          }}
        >
          {choice.name}
        </MenuChoice>
      ))}
    </FoldingMenu>
  )
}
